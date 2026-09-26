import { beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, documentCounters, leaveRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, getApprovalView, listMyInbox } from "@/domain/approvals";
import { submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { appendActionLog } from "@/repositories/action-log";
import { makePerson, countRows, NOW_2026 } from "./approvals-fixtures";

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
