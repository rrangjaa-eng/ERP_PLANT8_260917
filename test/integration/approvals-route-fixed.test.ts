import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actionLog,
  approvalInstances,
  approvalRoutes,
  approvalSteps,
  documentCounters,
  leaveRequests,
  settingsSimple,
} from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  approveDocument,
  getApprovalView,
  listMyInbox,
  prepareSubmission,
  registerDocumentKind,
  submitDocument,
  ApprovalConflictError,
  NotCurrentHolderError,
} from "@/domain/approvals";
import { submitLeave, getLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import {
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP1_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
  ACTION_LOG_OPTIONAL_TYPES,
} from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { appendActionLog } from "@/repositories/action-log";
import { setUserArchived } from "@/repositories/users";
import { insertMembership } from "@/repositories/team-memberships";
import { log } from "@/lib/log";
import { makePerson, countRows, teamIdByName, NOW_2026 } from "./approvals-fixtures";

// 04.1-01 트레이서 — 종일 연차 한 건이 제출 → 팀장 승인 → 빈 자리(2·3단) 건너뜀 →
// 대표 승인 → 최종 승인. 결재선은 제출 때 고정되고 사람은 매번 다시 해석된다.

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer };

// 기획1팀에 기획 PM 기안자 · 팀장, 대표 한 명(팀 없음). 기획본부 책임자 · 경영관리본부 소속 없음.
async function tracerOrg(): Promise<Org> {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

async function stepsOf(instanceId: string) {
  return db
    .select({
      stepIndex: approvalSteps.stepIndex,
      label: approvalSteps.label,
      roleId: approvalSteps.roleId,
      scopeKind: approvalSteps.scopeKind,
      scopeTargetId: approvalSteps.scopeTargetId,
      isFallback: approvalSteps.isFallback,
      actedBy: approvalSteps.actedBy,
      actedAt: approvalSteps.actedAt,
      action: approvalSteps.action,
    })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalSteps.stepIndex));
}

async function instanceOf(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스가 없습니다");
  return row;
}

const FULL_DAY = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };

describe("트레이서 — 제출 → 팀장 승인 → 빈 자리 건너뜀 → 대표 승인 → 최종 승인", () => {
  let org: Org;
  beforeEach(async () => {
    org = await tracerOrg();
  });

  it("끝에서 끝까지 — 결재선 고정 · 재해석 · 행동 로그", async () => {
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    expect(submitted.number).toBe("LV26-0001");

    const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, submitted.leaveId));
    expect(leave?.daysQuarters).toBe(12);
    expect(leave?.fiscalYear).toBe(2026);

    const instance = await instanceOf(submitted.instanceId);
    expect(instance.status).toBe("submitted");
    expect(instance.documentKind).toBe(LEAVE_DOCUMENT_KIND);
    const fixedSteps = await stepsOf(submitted.instanceId);
    expect(fixedSteps.map((s) => s.stepIndex)).toEqual([1, 2, 3, 4]);

    // 팀장의 결재함 mine에 있고 대표·기안자에게는 없다.
    const leadInbox = await listMyInbox(org.lead, { now: NOW_2026 });
    expect(leadInbox.mine.map((item) => item.instanceId)).toEqual([submitted.instanceId]);
    expect((await listMyInbox(org.ceo, { now: NOW_2026 })).mine).toEqual([]);
    expect((await listMyInbox(org.drafter, { now: NOW_2026 })).mine).toEqual([]);

    // 팀장 승인 → in_review, 2·3단은 후보 0명이라 건너뛰고 지금 단계는 4단(대표).
    const afterLead = await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(afterLead.status).toBe("in_review");
    const view = await getApprovalView(org.ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.currentStepIndex).toBe(4);
    expect(view?.actions).toEqual(["approve"]);
    expect((await listMyInbox(org.ceo, { now: NOW_2026 })).mine.map((item) => item.instanceId)).toEqual([
      submitted.instanceId,
    ]);

    // 제출 뒤 설정을 바꿔도 이 문서의 단계 행 넷은 그대로다(EXP-04).
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key, DEFAULT_ROLE_ID, null);
    expect(
      (await stepsOf(submitted.instanceId)).map(({ stepIndex, label, roleId, scopeKind, scopeTargetId }) => ({
        stepIndex,
        label,
        roleId,
        scopeKind,
        scopeTargetId,
      })),
    ).toEqual(
      fixedSteps.map(({ stepIndex, label, roleId, scopeKind, scopeTargetId }) => ({
        stepIndex,
        label,
        roleId,
        scopeKind,
        scopeTargetId,
      })),
    );

    // 대표 승인 → approved. 대표 기록은 4단 행(폴백 아님) — 폴백 행 0개(ENG-1).
    const afterCeo = await approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 2 }, { now: NOW_2026 });
    expect(afterCeo.status).toBe("approved");
    const finalSteps = await stepsOf(submitted.instanceId);
    const acted = finalSteps.filter((s) => s.action === "approved");
    expect(acted.map((s) => [s.stepIndex, s.actedBy, s.isFallback])).toEqual([
      [1, org.lead.id, false],
      [4, org.ceo.id, false],
    ]);
    expect(acted.every((s) => s.actedAt instanceof Date)).toBe(true);
    expect(finalSteps.filter((s) => s.isFallback)).toHaveLength(0);

    // 행동 로그: document_submit 1 · document_approve 2, entity approval_instance.
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "approval_instance"), eq(actionLog.entityId, submitted.instanceId)));
    expect(logs.filter((l) => l.actionType === "document_submit")).toHaveLength(1);
    expect(logs.filter((l) => l.actionType === "document_approve")).toHaveLength(2);
  });

  it("서울 날짜 — 2026-12-31T15:30Z에 낸 2027-01-04 종일 신청의 번호는 LV27-0001 · 회계연도 2027", async () => {
    const submitted = await submitLeave(
      org.drafter,
      { kind: "full_day", startDate: "2027-01-04", endDate: "2027-01-04", half: "" },
      { now: new Date("2026-12-31T15:30:00Z") },
    );
    expect(submitted.number).toBe("LV27-0001");
    const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, submitted.leaveId));
    expect(leave?.fiscalYear).toBe(2027);
  });
});

describe("행동 로그 실패 주입 — 전이와 함께 롤백", () => {
  let org: Org;
  beforeEach(async () => {
    org = await tracerOrg();
  });

  const failingAppend: typeof appendActionLog = () => Promise.reject(new Error("action_log 쓰기 실패(주입)"));

  async function counterValue(): Promise<number | null> {
    const [row] = await db
      .select()
      .from(documentCounters)
      .where(and(eq(documentCounters.counterKey, LEAVE_DOCUMENT_KIND), eq(documentCounters.period, "2026")));
    return row?.value ?? null;
  }

  async function snapshotCounts() {
    return {
      leave: await countRows("leave_requests"),
      instances: await countRows("approval_instances"),
      routes: await countRows("approval_routes"),
      steps: await countRows("approval_steps"),
      counter: await counterValue(),
      log: await countRows("action_log"),
    };
  }

  it("제출 · 승인의 로그 쓰기가 실패하면 신청 · 인스턴스 · 단계 · 카운터 · version이 그대로다", async () => {
    const before = await snapshotCounts();
    await expect(submitLeave(org.drafter, FULL_DAY, { now: NOW_2026, appendActionLog: failingAppend })).rejects.toThrow();
    expect(await snapshotCounts()).toEqual(before);

    // 주입 없이 다시 — 성공하고 로그 1건.
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    expect(await countRows("action_log")).toBe(before.log + 1);

    const instanceBefore = await instanceOf(submitted.instanceId);
    const stepsBefore = await stepsOf(submitted.instanceId);
    const logBefore = await countRows("action_log");
    await expect(
      approveDocument(
        org.lead,
        { instanceId: submitted.instanceId, expectedVersion: 1 },
        { now: NOW_2026, appendActionLog: failingAppend },
      ),
    ).rejects.toThrow();
    const instanceAfter = await instanceOf(submitted.instanceId);
    expect([instanceAfter.status, instanceAfter.version]).toEqual([instanceBefore.status, instanceBefore.version]);
    expect(await stepsOf(submitted.instanceId)).toEqual(stepsBefore);
    expect(await countRows("action_log")).toBe(logBefore);

    const approved = await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(approved.status).toBe("in_review");
    expect(await countRows("action_log")).toBe(logBefore + 1);
  });

  it("설정으로 두 종류의 기록을 끄면 전이만 커밋되고 로그 행은 늘지 않는다(CXF-A-F04)", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, ["login"], null);
    const logBefore = await countRows("action_log");

    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    expect(submitted.number).toBe("LV26-0001");
    const approved = await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(approved.status).toBe("in_review");
    expect((await stepsOf(submitted.instanceId)).filter((s) => s.action === "approved")).toHaveLength(1);
    expect(await countRows("action_log")).toBe(logBefore);
  });
});

async function actedCount(instanceId: string): Promise<number> {
  return (await stepsOf(instanceId)).filter((s) => s.actedBy !== null).length;
}

describe("담당 소멸 · 발령 뒤 범위 고정(결정 3 · EXP-04)", () => {
  let org: Org;
  beforeEach(async () => {
    org = await tracerOrg();
  });

  it("제출 뒤 1단 팀장을 보관하면 1단은 빈 자리로 건너뛰고 지금 단계는 4단(대표)", async () => {
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    await setUserArchived(SYSTEM_VIEWER, org.lead.id, true);
    const view = await getApprovalView(org.ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.currentStepIndex).toBe(4);
    expect(view?.steps?.[0]?.state).toBe("empty");
  });

  it("이미 승인한 팀장을 보관해도 그 처리 기록은 결재선 목록에 그대로 보인다", async () => {
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    await setUserArchived(SYSTEM_VIEWER, org.lead.id, true);
    const view = await getApprovalView(org.ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.steps?.[0]).toMatchObject({ stepIndex: 1, state: "approved", actedByName: "김팀장" });
    expect(view?.currentStepIndex).toBe(4);
  });

  it("제출 뒤 기안자가 다른 팀으로 발령돼도 1단 범위(제출 때의 팀 id)는 그대로다", async () => {
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    const planTeam = await teamIdByName("기획1팀");
    await insertMembership(SYSTEM_VIEWER, {
      userId: org.drafter.id,
      teamId: await teamIdByName("경영관리팀"),
      effectiveFrom: "2026-02-01",
    });
    expect((await stepsOf(submitted.instanceId))[0]?.scopeTargetId).toBe(planTeam);
    expect((await listMyInbox(org.lead, { now: NOW_2026 })).mine.map((i) => i.instanceId)).toEqual([submitted.instanceId]);
  });
});

// 테스트 전용 두 번째 문서 종류 — 문서 표가 없다(document_id는 임의 uuid). 결재
// 모듈이 문서 종류를 하드코딩하지 않는다는 증거다.
const TEST_MEMO = "test_memo";
registerDocumentKind({
  kind: TEST_MEMO,
  label: "테스트 메모",
  loadRouteConfig: () =>
    Promise.resolve({
      selfApproval: "skip",
      steps: [{ enabled: true, roleId: TEAM_LEAD_ROLE_ID, scope: "drafter_team", orgUnitId: "" }],
    }),
  href: (id) => `/test-memo/${id}`,
  describeDocuments: () => Promise.resolve(new Map()),
});

describe("두 번째 문서 종류(test_memo) — 같은 엔진으로 최종 승인까지", () => {
  it("submitDocument · approveDocument로 approved", async () => {
    const org = await tracerOrg();
    const prepared = await prepareSubmission(org.drafter, { kind: TEST_MEMO, drafterId: org.drafter.id }, { now: NOW_2026 });
    const instance = await db.transaction((tx) => submitDocument(org.drafter, prepared, { documentId: randomUUID() }, tx));
    expect(instance.documentKind).toBe(TEST_MEMO);
    expect((await listMyInbox(org.lead, { now: NOW_2026 })).mine.map((i) => i.kind)).toEqual([TEST_MEMO]);
    const result = await approveDocument(org.lead, { instanceId: instance.id, expectedVersion: 1 }, { now: NOW_2026 });
    expect(result.status).toBe("approved");
  });
});

describe("설정 빈 값 — 3단 org_unit_id 행이 없어도 제출된다(CEO-7)", () => {
  it("3단 대상 id는 null이고 빈 자리로 건너뛴다", async () => {
    const org = await tracerOrg();
    await makePerson("경영관리", DEFAULT_ROLE_ID, "경영관리팀");
    await db.delete(settingsSimple).where(eq(settingsSimple.key, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key));
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    expect((await stepsOf(submitted.instanceId))[2]).toMatchObject({ stepIndex: 3, scopeTargetId: null });
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    const view = await getApprovalView(org.ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.currentStepIndex).toBe(4);
  });
});

describe("비후보 거부 · 운영 로그(CEO-8 · CEO-18)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1단이 지금 단계일 때 기안자 · 무관한 기획 PM · 대표(4단 전)의 맞는 version 승인은 전부 거부 · 기록 0 · version 그대로", async () => {
    const org = await tracerOrg();
    const planningPm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    const infoSpy = vi.spyOn(log, "info");

    for (const viewer of [org.drafter, planningPm, org.ceo]) {
      await expect(
        approveDocument(viewer, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 }),
      ).rejects.toBeInstanceOf(NotCurrentHolderError);
      expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", {
        instanceId: submitted.instanceId,
        viewerId: viewer.id,
        reason: "not_holder",
        expectedVersion: 1,
        actualVersion: 1,
      });
    }
    expect(infoSpy.mock.calls.filter(([event]) => event === "approval.refused")).toHaveLength(3);
    expect(await actedCount(submitted.instanceId)).toBe(0);
    expect((await instanceOf(submitted.instanceId)).version).toBe(1);
  });

  it("모든 담당과 대표를 보관해 막힌 문서의 getApprovalView는 route_blocked를 한 번 남긴다(이름·사유 글자 없음)", async () => {
    const org = await tracerOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    await setUserArchived(SYSTEM_VIEWER, org.lead.id, true);
    await setUserArchived(SYSTEM_VIEWER, org.ceo.id, true);
    const warnSpy = vi.spyOn(log, "warn");
    await getApprovalView(org.drafter, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(warnSpy.mock.calls).toEqual([
      ["approval.route_blocked", { instanceId: submitted.instanceId, kind: LEAVE_DOCUMENT_KIND, round: 1, stepIndex: 5 }],
    ]);
  });
});

describe("옛 version 승인 — 04.1-01 단독 상태(ENG-6 · D1)", () => {
  it("팀장 승인으로 version 2가 된 문서에 옛 version 1: 무관한 기획 PM · 기안자 둘 다 거부, 기록 · version 그대로", async () => {
    const org = await tracerOrg();
    const planningPm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });

    const pmError = await approveDocument(planningPm, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(pmError).toBeInstanceOf(Error);
    const message = (pmError as Error).message;
    expect(message).not.toContain("김팀장");
    expect(message).not.toMatch(/\d{2}:\d{2}/);

    await expect(
      approveDocument(org.drafter, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 }),
    ).rejects.toBeInstanceOf(ApprovalConflictError);
    expect(await actedCount(submitted.instanceId)).toBe(1);
    expect((await instanceOf(submitted.instanceId)).version).toBe(2);
  });
});

describe("담당 소멸 뒤 고아 최종 — 막힘으로 다룬다(ENG-3 · D2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 기획본부 책임자 한 명 · 경영관리팀 소속 한 명(대표는 경영관리팀 밖). 결재선 1단 =
  // 대표 × 전사(나머지 기본값) → 대표가 1단 승인 → 2·3단 담당 둘 다 보관.
  // 04.1-02 Task 2가 이 describe에 「기안자 회수 성공」 사례를 같은 도우미로 더한다(X-2).
  async function setupOrphanFinal() {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const divHead = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const mgmt = await makePerson("경영담당", DEFAULT_ROLE_ID, "경영관리팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const planningPm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID.key, CEO_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP1_SCOPE.key, "company", null);

    const submitted = await submitLeave(drafter, FULL_DAY, { now: NOW_2026 });
    const afterCeo = await approveDocument(ceo, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(afterCeo.status).toBe("in_review");
    await setUserArchived(SYSTEM_VIEWER, divHead.id, true);
    await setUserArchived(SYSTEM_VIEWER, mgmt.id, true);
    return { instanceId: submitted.instanceId, leaveId: submitted.leaveId, version: afterCeo.version, drafter, ceo, planningPm };
  }

  it("지금 단계 담당 없음 · 결재함 0건 · 읽기 경로 쓰기 없음 · 대표 승인 거부 · 담당 복구 뒤 승인", async () => {
    const { instanceId, leaveId, version, drafter, ceo, planningPm } = await setupOrphanFinal();
    const instanceBefore = await instanceOf(instanceId);
    const stepsBefore = await stepsOf(instanceId);

    const warnSpy = vi.spyOn(log, "warn");
    const view = await getApprovalView(ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, { now: NOW_2026 });
    expect(warnSpy.mock.calls.filter(([event]) => event === "approval.route_blocked")).toHaveLength(1);
    expect(view?.actions).toEqual([]);
    const current = view?.steps?.find((step) => step.stepIndex === view.currentStepIndex);
    expect(current).toMatchObject({ state: "blocked", holderNames: "" });

    for (const viewer of [drafter, ceo, planningPm]) {
      expect((await listMyInbox(viewer, { now: NOW_2026 })).mine.filter((item) => item.instanceId === instanceId)).toEqual([]);
    }
    const instanceAfter = await instanceOf(instanceId);
    expect([instanceAfter.status, instanceAfter.version]).toEqual([instanceBefore.status, instanceBefore.version]);
    expect(await stepsOf(instanceId)).toEqual(stepsBefore);

    await expect(approveDocument(ceo, { instanceId, expectedVersion: version }, { now: NOW_2026 })).rejects.toBeInstanceOf(
      NotCurrentHolderError,
    );
    expect(await actedCount(instanceId)).toBe(1);

    // 담당 복구 — 새 사람을 경영관리팀에 발령한다.
    const newMgmt = await makePerson("새담당", DEFAULT_ROLE_ID, "경영관리팀");
    expect((await listMyInbox(newMgmt, { now: NOW_2026 })).mine.map((item) => item.instanceId)).toEqual([instanceId]);
    const result = await approveDocument(newMgmt, { instanceId, expectedVersion: version }, { now: NOW_2026 });
    expect(result.status).toBe("approved");
  });
});

describe("종결 상태 조회 — walkRoute 없음(A-01)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("최종 승인된 문서의 조회는 route_blocked를 남기지 않고 지금 단계 없이 저장된 처리 기록만 보인다", async () => {
    const org = await tracerOrg();
    const planningPm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    await approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 2 }, { now: NOW_2026 });

    const warnSpy = vi.spyOn(log, "warn");
    for (const viewer of [org.drafter, org.lead, org.ceo]) {
      const view = await getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
      expect(view?.status).toBe("approved");
      expect(view?.currentStepIndex).toBeNull();
      expect(view?.actions).toEqual([]);
      expect(view?.steps?.map((step) => [step.stepIndex, step.state, step.actedByName])).toEqual([
        [1, "approved", "김팀장"],
        [4, "approved", "최대표"],
      ]);
      expect(view?.steps?.every((step) => step.actedAt instanceof Date)).toBe(true);
      expect(await getLeave(viewer, submitted.leaveId, { now: NOW_2026 })).not.toBeNull();
    }
    expect(await getLeave(planningPm, submitted.leaveId, { now: NOW_2026 })).toBeNull();

    await expect(
      approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 2 }, { now: NOW_2026 }),
    ).rejects.toBeInstanceOf(ApprovalConflictError);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("빈틈 있는 결재선의 대표 폴백 step_index(A-02)", () => {
  it("2·4단을 끈 결재선(3단 빈 자리)에서 대표 폴백 승인이 오류 없이 끝나고 폴백 행 step_index는 4", async () => {
    const org = await tracerOrg();
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ENABLED.key, false, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP4_ENABLED.key, false, null);
    const submitted = await submitLeave(org.drafter, FULL_DAY, { now: NOW_2026 });
    expect((await stepsOf(submitted.instanceId)).map((s) => s.stepIndex)).toEqual([1, 3]);

    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    const view = await getApprovalView(org.ceo, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.currentStepIndex).toBe(4);
    expect(view?.steps?.at(-1)).toMatchObject({ isFallback: true, state: "current" });

    const result = await approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 2 }, { now: NOW_2026 });
    expect(result.status).toBe("approved");
    const fallbackRows = await db
      .select({ stepIndex: approvalSteps.stepIndex })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(and(eq(approvalRoutes.instanceId, submitted.instanceId), eq(approvalSteps.isFallback, true), isNotNull(approvalSteps.actedBy)));
    expect(fallbackRows).toEqual([{ stepIndex: 4 }]);
  });
});
