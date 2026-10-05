import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, projects, settlementApprovals } from "@/db/schema";
import { approveDocument, getApprovalView, listMyInbox, loadKindDetails, NotCurrentHolderError, rejectDocument } from "@/domain/approvals";
import { getDocumentKind } from "@/domain/approvals/kinds";
import { isRouteStepSettingKey } from "@/domain/approvals/route-step-settings";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { changeProjectStatus, StatusChangedError } from "@/domain/projects/status";
import { GateBlockedError } from "@/domain/rules/gate";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
} from "@/domain/settings/keys";
import {
  getSettlement,
  SETTLEMENT_DOCUMENT_KIND,
  SettlementUndoRefusedError,
  submitSettlement,
  withdrawSettlement,
  type SettlementApprovalAuthority,
} from "@/domain/settlements";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { extendToInProgress, makeSettlementPeople, SETTLEMENT_LINES, setupSettlementProject } from "./fixtures/settlements";
import { deferred, waitForLockWaiter } from "./lock-race";

// D-80 ② 승인 먼저 — 승인 트랜잭션이 프로젝트 행을 잡은 직후에 멈출 자리. 엔진 → 정산 훅 → changeProjectStatus 사슬에는 주입 지점이
// 없어 이 파일만 changeProjectStatus를 감싸 afterLock을 넣는다(race.afterLock이 null이면 원래 함수 그대로 — 나머지 사례는 영향 없음).
const race = vi.hoisted(() => ({ afterLock: null as null | (() => Promise<void>) }));
vi.mock("@/domain/projects/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/projects/status")>();
  return {
    ...actual,
    changeProjectStatus: (...args: Parameters<typeof actual.changeProjectStatus>) => {
      const [viewer, projectId, input, deps] = args;
      const afterLock = race.afterLock;
      return actual.changeProjectStatus(viewer, projectId, input, afterLock ? { ...deps, afterLock } : deps);
    },
  };
});

// 05-11 트레이서 — 정산 프로젝트의 담당 PM이 정산 결재를 올리고(확인 없음), 대표가 승인하는 순간 같은 트랜잭션에서 프로젝트가 완료된다.
// 권한은 「이 인스턴스 지금 차수의 마지막 단계 기록 = 승인한 사람」 하나다(F1) — 결재선 마지막 단계를 `projects.complete`가 없는 계급으로
// 바꿔도, 결재선을 전부 꺼 대표 폴백이 승인해도(P3-4) 완료되고, 인스턴스 밖 사람은 승인할 수 없다.

async function projectStatus(projectId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  return row?.status;
}

async function settlementOf(projectId: string) {
  const [row] = await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, projectId));
  return row ?? null;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  return row ?? null;
}

async function stepsOf(instanceId: string) {
  return db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, roleId: approvalSteps.roleId, isFallback: approvalSteps.isFallback, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

async function statusChangeLogs(projectId: string) {
  return db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, projectId), eq(actionLog.actionType, "status_change")))
    .orderBy(asc(actionLog.seq));
}

async function documentLogs(documentId: string) {
  return db.select().from(actionLog).where(eq(actionLog.documentId, documentId)).orderBy(asc(actionLog.seq));
}

// 올리기 → 문서 · 인스턴스 id(문서 행 · 인스턴스 행을 다시 읽는다).
async function submitted(viewer: Parameters<typeof submitSettlement>[0], projectId: string) {
  await submitSettlement(viewer, { projectId });
  const doc = await settlementOf(projectId);
  if (!doc) throw new Error("정산 결재 문서 없음");
  const instance = await instanceOf(doc.id);
  if (!instance) throw new Error("결재 인스턴스 없음");
  return { documentId: doc.id, instanceId: instance.id, version: instance.version };
}

describe("정산 결재 — 올리기 → 대표 승인 = 완료(같은 트랜잭션)", () => {
  it("담당 PM이 올리면 문서 한 행 · 인스턴스 submitted · 단계 행 하나(4단 대표 × 전사) · 문서 상태 `결재 중`", async () => {
    const fx = await setupSettlementProject();
    expect(await projectStatus(fx.projectId)).toBe("settling");

    const { documentId, instanceId } = await submitted(fx.pm, fx.projectId);

    expect((await instanceOf(documentId))?.status).toBe("submitted");
    const steps = await stepsOf(instanceId);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ round: 1, stepIndex: 4, roleId: CEO_ROLE_ID, isFallback: false, action: null });
    expect((await getSettlement(fx.pm, { projectId: fx.projectId }))?.statusWord).toBe("결재 중");
  });

  it("담당 PM이 아닌 팀장의 올리기 · 진행 프로젝트의 올리기는 거부되고 문서가 생기지 않는다", async () => {
    const fx = await setupSettlementProject();
    await expect(submitSettlement(fx.lead, { projectId: fx.projectId })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await settlementOf(fx.projectId)).toBeNull();

    expect((await extendToInProgress(fx)).project.status).toBe("in_progress");
    await expect(submitSettlement(fx.pm, { projectId: fx.projectId })).rejects.toBeInstanceOf(StatusChangedError);
    expect(await settlementOf(fx.projectId)).toBeNull();
  });

  it("대표 승인 → 인스턴스 approved · 프로젝트 completed · status_change(trigger approval) 한 건 · 문서 로그 document_submit(차수 1) · document_approve", async () => {
    const fx = await setupSettlementProject();
    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);
    const logsBefore = (await statusChangeLogs(fx.projectId)).length;

    const result = await approveDocument(fx.ceo, { instanceId, expectedVersion: version });

    expect(result.status).toBe("approved");
    expect(await projectStatus(fx.projectId)).toBe("completed");
    const changes = await statusChangeLogs(fx.projectId);
    expect(changes).toHaveLength(logsBefore + 1);
    expect(changes.at(-1)?.detail).toEqual({ from: "settling", to: "completed", trigger: "approval" });

    // OPS-08 — 04.1 엔진이 쓰는 문서 로그(설정 기본값 그대로).
    const logs = await documentLogs(documentId);
    expect(logs.map((log) => log.actionType)).toEqual(["document_submit", "document_approve"]);
    for (const log of logs) {
      expect(log.entity).toBe("approval_instance");
      expect(log.entityId).toBe(instanceId);
      expect((log.detail as { kind?: string }).kind).toBe(SETTLEMENT_DOCUMENT_KIND);
    }
    expect((logs[0]?.detail as { round?: number }).round).toBe(1);
    // 최종 승인 토스트 꼬리 — `{프로젝트 번호} 완료`(05-01 D8).
    const summary = (await getDocumentKind(SETTLEMENT_DOCUMENT_KIND).describeDocuments(fx.ceo, [documentId])).get(documentId);
    expect(summary?.finalApprovalNote).toBe(`${fx.projectNumber} 완료`);
    expect(summary?.documentText).toBe(fx.projectName);
  });

  it("결재선 단계 키 — 정산 결재 16키는 단계 칸(단독 저장 거부 대상)이고 자기 승인 키는 아니다", () => {
    for (const step of [1, 2, 3, 4]) {
      for (const field of ["enabled", "role_id", "scope", "org_unit_id"]) {
        expect(isRouteStepSettingKey(`approval_route.settlement.step${step}.${field}`)).toBe(true);
      }
    }
    expect(isRouteStepSettingKey("approval_route.settlement.self_approval")).toBe(false);
  });

  it("승인 직전 프로젝트가 진행으로 바뀌어 있으면 승인 전체가 롤백된다 — 인스턴스 · 단계 · 프로젝트 · 로그 그대로", async () => {
    const fx = await setupSettlementProject();
    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);
    expect((await extendToInProgress(fx)).project.status).toBe("in_progress");
    const before = { instance: await instanceOf(documentId), steps: await stepsOf(instanceId), logs: (await documentLogs(documentId)).length, changes: (await statusChangeLogs(fx.projectId)).length };

    await expect(approveDocument(fx.ceo, { instanceId, expectedVersion: version })).rejects.toBeInstanceOf(StatusChangedError);

    const after = await instanceOf(documentId);
    expect(after?.status).toBe(before.instance?.status);
    expect(after?.version).toBe(before.instance?.version);
    expect(await stepsOf(instanceId)).toEqual(before.steps);
    expect(await projectStatus(fx.projectId)).toBe("in_progress");
    expect((await documentLogs(documentId)).length).toBe(before.logs);
    expect((await statusChangeLogs(fx.projectId)).length).toBe(before.changes);
  });
});

describe("정산 결재 — 권한은 이 인스턴스의 마지막 단계 기록(F1 · P3-4)", () => {
  it("마지막 단계를 `projects.complete`가 없는 경영관리본부 책임자로 바꿔도 그 담당의 승인으로 완료된다 · 인스턴스 밖 대표 · 시스템 관리자는 승인할 수 없다", async () => {
    const fx = await setupSettlementProject();
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID.key, DIVISION_HEAD_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE.key, "org_unit", null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID.key, await orgUnitIdByName("경영관리본부"), null);
    const mgmtHead = await makePerson("경영본부장", DIVISION_HEAD_ROLE_ID, "경영관리팀");
    const sysadmin = await makePerson("시스템관리자", SYSADMIN_ROLE_ID, null);
    expect(await can(mgmtHead, "projects.complete", "write")).toBe(false);

    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);

    await expect(approveDocument(fx.ceo, { instanceId, expectedVersion: version })).rejects.toBeInstanceOf(NotCurrentHolderError);
    await expect(approveDocument(sysadmin, { instanceId, expectedVersion: version })).rejects.toBeInstanceOf(NotCurrentHolderError);
    expect(await projectStatus(fx.projectId)).toBe("settling");

    const view = await getApprovalView(mgmtHead, { kind: SETTLEMENT_DOCUMENT_KIND, documentId });
    expect(view?.actions).toContain("approve");
    expect(view?.approveBlockedReason ?? null).toBeNull();

    await approveDocument(mgmtHead, { instanceId, expectedVersion: version });
    expect((await instanceOf(documentId))?.status).toBe("approved");
    expect(await projectStatus(fx.projectId)).toBe("completed");
    expect((await statusChangeLogs(fx.projectId)).at(-1)?.detail).toMatchObject({ trigger: "approval" });
  });

  it("결재선을 전부 끄면 대표 폴백(is_fallback)이 승인하고 프로젝트가 완료된다", async () => {
    const fx = await setupSettlementProject();
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ENABLED.key, false, null);

    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);
    expect((await instanceOf(documentId))?.status).toBe("submitted");
    const view = await getApprovalView(fx.ceo, { kind: SETTLEMENT_DOCUMENT_KIND, documentId });
    expect(view?.actions).toContain("approve");
    expect(view?.approveBlockedReason ?? null).toBeNull();

    await approveDocument(fx.ceo, { instanceId, expectedVersion: version });

    expect((await instanceOf(documentId))?.status).toBe("approved");
    expect((await stepsOf(instanceId)).filter((step) => step.round === 1 && step.isFallback)).toHaveLength(1);
    expect(await projectStatus(fx.projectId)).toBe("completed");
    expect((await statusChangeLogs(fx.projectId)).at(-1)?.detail).toMatchObject({ trigger: "approval" });
  });

  it("`trigger: approval`을 권한 없이 부르거나 다른 프로젝트 문서의 권한으로 부르면 GateBlockedError · 상태 그대로", async () => {
    const people = await makeSettlementPeople();
    const a = await setupSettlementProject(people, "가을 팝업 A");
    const b = await setupSettlementProject(people, "가을 팝업 B");
    const { documentId } = await submitted(a.pm, a.projectId);

    const direct = { from: "settling", to: "completed", trigger: "approval" } as Parameters<typeof changeProjectStatus>[2];
    await expect(changeProjectStatus(a.ceo, a.projectId, direct)).rejects.toBeInstanceOf(GateBlockedError);
    expect(await projectStatus(a.projectId)).toBe("settling");

    // 테스트 안 위조 — 런타임 결속(approvalAuthority.projectId === projectId)을 증명한다.
    const forged = { projectId: a.projectId, documentId } as unknown as SettlementApprovalAuthority;
    await expect(changeProjectStatus(a.ceo, b.projectId, direct, { approvalAuthority: forged })).rejects.toBeInstanceOf(GateBlockedError);
    expect(await projectStatus(b.projectId)).toBe("settling");
  });
});

describe("정산 결재 — 판단 근거 두 합(G4 · D11)", () => {
  const quoteTotal = SETTLEMENT_LINES.krw.unitPrice.amount * SETTLEMENT_LINES.krw.quantity + SETTLEMENT_LINES.usd.unitPrice.amount * SETTLEMENT_LINES.usd.unitPrice.fxRate * SETTLEMENT_LINES.usd.quantity;
  const executionTotal = SETTLEMENT_LINES.krw.execution.amount + SETTLEMENT_LINES.usd.execution.amount * SETTLEMENT_LINES.usd.execution.fxRate;

  it("대표의 문서 DTO에 견적가 합 · 실행가 합(현재 차수 줄 값의 합)이 있고 결재 시트 행에 같은 두 행이 있으며 `손익` 행은 없다", async () => {
    const fx = await setupSettlementProject();
    const { documentId } = await submitted(fx.pm, fx.projectId);

    const doc = await getSettlement(fx.ceo, { projectId: fx.projectId });
    expect(doc?.quoteTotalKrw).toBe(quoteTotal);
    expect(doc?.executionTotalKrw).toBe(executionTotal);

    const details = await loadKindDetails(fx.ceo, SETTLEMENT_DOCUMENT_KIND, [documentId], { visible });
    const labels = details.get(documentId)?.rows.map((row) => row.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(["프로젝트", "기간", "담당 PM", "견적가 합", "실행가 합", "기안"]));
    expect(labels).not.toContain("손익");
  });

  it("`quote.amount`를 못 보는 계급의 결재 담당에게는 두 합 필드 · 행이 없다", async () => {
    const fx = await setupSettlementProject();
    const { documentId } = await submitted(fx.pm, fx.projectId);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, infoItem: "quote.amount", visible: false });

    const doc = await getSettlement(fx.ceo, { projectId: fx.projectId });
    expect(doc).not.toBeNull();
    expect(doc && "quoteTotalKrw" in doc).toBe(false);
    expect(doc && "executionTotalKrw" in doc).toBe(false);

    const details = await loadKindDetails(fx.ceo, SETTLEMENT_DOCUMENT_KIND, [documentId], { visible });
    const labels = details.get(documentId)?.rows.map((row) => row.label) ?? [];
    expect(labels).toContain("프로젝트");
    expect(labels).not.toContain("견적가 합");
    expect(labels).not.toContain("실행가 합");
    expect(labels).not.toContain("손익");
  });
});

const BACK_TO_PROGRESS = "진행으로 바뀜 · 반려";

describe("정산 결재 — D-80 진행 복귀와 승인의 두 순서", () => {
  it("① 진행 복귀 먼저: 대표 화면 · 결재함에 `진행으로 바뀜 · 반려` · 승인은 전부 롤백(document_approve 없음) · 반려 → rejected · 진행이라 다시 올리기 없음", async () => {
    const fx = await setupSettlementProject();
    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);
    expect((await extendToInProgress(fx)).project.status).toBe("in_progress");

    const view = await getApprovalView(fx.ceo, { kind: SETTLEMENT_DOCUMENT_KIND, documentId });
    expect(view?.approveBlockedReason).toBe(BACK_TO_PROGRESS);
    const inbox = await listMyInbox(fx.ceo);
    expect(inbox.mine.find((item) => item.documentId === documentId)?.approveBlockedReason).toBe(BACK_TO_PROGRESS);

    await expect(approveDocument(fx.ceo, { instanceId, expectedVersion: version })).rejects.toBeInstanceOf(StatusChangedError);
    expect((await documentLogs(documentId)).map((log) => log.actionType)).toEqual(["document_submit"]);

    const rejected = await rejectDocument(fx.ceo, { instanceId, expectedVersion: version, reason: "기간 늘어남" });
    expect(rejected.status).toBe("rejected");
    expect(await getDocumentKind(SETTLEMENT_DOCUMENT_KIND).canResubmit?.(fx.pm, documentId)).toBe(false);
    expect((await getApprovalView(fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId }))?.actions ?? []).not.toContain("resubmit");
    await expect(submitSettlement(fx.pm, { projectId: fx.projectId })).rejects.toBeInstanceOf(StatusChangedError);
    expect(await projectStatus(fx.projectId)).toBe("in_progress");

    const logs = await documentLogs(documentId);
    expect(logs.map((log) => log.actionType)).toEqual(["document_submit", "document_reject"]);
    // 반려 로그에 사유 원문이 없다(OPS-08).
    expect(JSON.stringify(logs[1]?.detail)).not.toContain("기간 늘어남");
  });

  it("② 승인 먼저: 승인이 프로젝트 행을 잡은 동안 기간 변경은 기다리고, 승인 커밋 뒤 기간 변경은 거부 · 프로젝트 completed", async () => {
    const fx = await setupSettlementProject();
    const { instanceId, version } = await submitted(fx.pm, fx.projectId);
    const locked = deferred();
    const release = deferred();
    race.afterLock = async () => {
      locked.resolve();
      await release.promise;
    };
    let approving: ReturnType<typeof approveDocument>;
    try {
      approving = approveDocument(fx.ceo, { instanceId, expectedVersion: version });
      await locked.promise;
    } finally {
      race.afterLock = null;
    }
    const extending = extendToInProgress(fx);
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }

    const [approved, extended] = await Promise.allSettled([approving, extending]);
    expect(approved.status).toBe("fulfilled");
    expect(extended.status).toBe("rejected");
    const [row] = await db.select({ status: projects.status, endDate: projects.endDate }).from(projects).where(eq(projects.id, fx.projectId));
    expect(row?.status).toBe("completed");
    expect(row?.endDate).not.toBe("2099-12-31");
  });
});

describe("정산 결재 — 다시 올리기 · 늦은 되돌리기 · 행동 로그(E1 · OPS-08)", () => {
  it("반려 뒤 다시 올리기 = 같은 문서 · 차수 2, 되돌리기(회수) 뒤 다시 올리기 = 차수 3 · 로그 submit · reject · submit · withdraw · submit", async () => {
    const fx = await setupSettlementProject();
    const first = await submitted(fx.pm, fx.projectId);
    await rejectDocument(fx.ceo, { instanceId: first.instanceId, expectedVersion: first.version, reason: "증빙 다시" });
    expect(await getDocumentKind(SETTLEMENT_DOCUMENT_KIND).canResubmit?.(fx.pm, first.documentId)).toBe(true);
    expect((await getApprovalView(fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: first.documentId }))?.actions).toContain("resubmit");

    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toMatchObject({ kind: "submitted", documentId: first.documentId, instanceId: first.instanceId, round: 2 });
    expect((await withdrawSettlement(fx.pm, { projectId: fx.projectId, undo: true, round: 2 })).status).toBe("withdrawn");
    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toMatchObject({ kind: "submitted", documentId: first.documentId, round: 3 });
    expect(await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, fx.projectId))).toHaveLength(1);

    const logs = await documentLogs(first.documentId);
    expect(logs.map((log) => log.actionType)).toEqual(["document_submit", "document_reject", "document_submit", "document_withdraw", "document_submit"]);
    expect(logs.filter((log) => log.actionType === "document_submit").map((log) => (log.detail as { round?: number }).round)).toEqual([1, 2, 3]);
    for (const log of logs) {
      expect(log.entity).toBe("approval_instance");
      expect(log.entityId).toBe(first.instanceId);
      expect((log.detail as { kind?: string }).kind).toBe(SETTLEMENT_DOCUMENT_KIND);
    }
    expect(JSON.stringify(logs[1]?.detail)).not.toContain("증빙 다시");
  });

  it("대표 승인 뒤 PM의 되돌리기는 거부 — 오류에 대표 이름 · 시각 · approved, 회수 로그 없음 · 프로젝트 completed", async () => {
    const fx = await setupSettlementProject();
    const { documentId, instanceId, version } = await submitted(fx.pm, fx.projectId);
    await approveDocument(fx.ceo, { instanceId, expectedVersion: version });

    const error: unknown = await withdrawSettlement(fx.pm, { projectId: fx.projectId, undo: true, round: 1 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SettlementUndoRefusedError);
    if (!(error instanceof SettlementUndoRefusedError)) return;
    expect(error.detail).toMatchObject({ actorName: "최대표", status: "approved" });
    expect(error.detail.at).toBeInstanceOf(Date);
    expect(error.message).toMatch(/^최대표가 \d{2}:\d{2}에 승인함 · /);

    expect((await documentLogs(documentId)).map((log) => log.actionType)).toEqual(["document_submit", "document_approve"]);
    expect(await projectStatus(fx.projectId)).toBe("completed");
  });
});
