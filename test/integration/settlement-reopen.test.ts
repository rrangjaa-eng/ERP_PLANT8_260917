import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, projects, settlementApprovals } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { ForbiddenError } from "@/domain/permissions/can";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { changeProjectStatus } from "@/domain/projects/status";
import { GateBlockedError } from "@/domain/rules/gate";
import { getSettlement, getSettlementHeader, SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { getReopenTarget, reopenCompletedProject } from "@/domain/settlements/reopen";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { markActionLogRowsPruned } from "@/repositories/action-log";
import { upsertVisibility } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";
import { setupSettlementProject, type SettlementFixture } from "./fixtures/settlements";

// 07.2-19(PU2 · D-7214~7216 · 07.2 D-7302 카드 11 「다시 결재 받기」): 대표 · 관리자가 완료 프로젝트를 사유와 함께 정산으로 되돌리면
// 승인된 정산 결재가 같은 문서에서 초안(draft)으로 물리고, 담당 PM이 같은 문서를 다시 올려 결재선을 처음부터 다시 탄다.

const CONFLICT = "다른 사람이 먼저 바꿈 · 새로 고침";
const REASON = "정산 실수 · 실행가 다시";

async function projectStatus(projectId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  return row?.status;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function stepsOf(instanceId: string) {
  return db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, action: approvalSteps.action, actedBy: approvalSteps.actedBy, actedAt: approvalSteps.actedAt })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

async function logsOf(documentId: string, actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.documentId, documentId), eq(actionLog.actionType, actionType)))
    .orderBy(asc(actionLog.seq));
}

async function statusChanges(projectId: string) {
  return db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, projectId), eq(actionLog.actionType, "status_change")))
    .orderBy(asc(actionLog.seq));
}

// 정산 결재를 올리고 대표가 승인해 완료된 프로젝트(문서 id = 프로젝트 id).
async function completedProject(fx?: SettlementFixture) {
  const project = fx ?? (await setupSettlementProject());
  const done = await submitSettlement(project.pm, { projectId: project.projectId });
  if (done.kind !== "submitted") throw new Error("올리기 안 됨");
  await approveDocument(project.ceo, { instanceId: done.instanceId, expectedVersion: done.version });
  if ((await projectStatus(project.projectId)) !== "completed") throw new Error("완료 안 됨");
  const instance = await instanceOf(done.documentId);
  return { fx: project, documentId: done.documentId, instanceId: done.instanceId, version: instance.version };
}

async function reopenAs(viewer: Viewer, c: { fx: SettlementFixture; version: number }, reason = REASON) {
  return reopenCompletedProject(viewer, { projectId: c.fx.projectId, reason, expectedInstanceVersion: c.version });
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
  const caught = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(caught instanceof Error)) throw new Error("거부되지 않았다");
  return caught;
}

describe("완료 되돌리기 — 한 트랜잭션(인스턴스 → 프로젝트)", () => {
  it("대표가 사유와 함께 되돌리면 인스턴스 approved → draft(version + 1 · 차수 그대로) · 프로젝트 completed → settling · 로그 둘", async () => {
    const c = await completedProject();
    const before = await instanceOf(c.documentId);

    const done = await reopenAs(c.fx.ceo, c);

    expect(done).toMatchObject({ number: c.fx.projectNumber });
    const after = await instanceOf(c.documentId);
    expect(after.status).toBe("draft");
    expect(after.version).toBe(before.version + 1);
    expect(after.currentRound).toBe(before.currentRound);
    expect(after.id).toBe(c.instanceId);
    expect(await projectStatus(c.fx.projectId)).toBe("settling");

    const reopenLogs = await logsOf(c.documentId, "document_reopen");
    expect(reopenLogs).toHaveLength(1);
    expect(reopenLogs[0]).toMatchObject({ actorId: c.fx.ceo.id, entity: "approval_instance", entityId: c.instanceId });
    expect(reopenLogs[0]?.detail).toMatchObject({ kind: SETTLEMENT_DOCUMENT_KIND, round: 1, reason: REASON });
    expect((await statusChanges(c.fx.projectId)).at(-1)?.detail).toEqual({ from: "completed", to: "settling", trigger: "reopen" });
    // 정산 결재 행은 프로젝트당 하나 그대로.
    expect(await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, c.fx.projectId))).toHaveLength(1);
  });

  it("시스템 관리자도 되돌린다(projects.reopen 쓰기)", async () => {
    const c = await completedProject();
    const sysadmin = await makePerson("시스템관리자", SYSADMIN_ROLE_ID, null);
    await reopenAs(sysadmin, c);
    expect(await projectStatus(c.fx.projectId)).toBe("settling");
  });

  it("사유가 비면 `사유 없음 · 사유 적기` · 500자 넘으면 거부 · 아무것도 바뀌지 않는다", async () => {
    const c = await completedProject();
    expect((await errorOf(reopenAs(c.fx.ceo, c, "   "))).message).toBe("사유 없음 · 사유 적기");
    expect((await errorOf(reopenAs(c.fx.ceo, c, "가".repeat(501)))).message).toBe("사유 500자 넘음 · 줄여 적기");
    expect((await instanceOf(c.documentId)).status).toBe("approved");
    expect(await projectStatus(c.fx.projectId)).toBe("completed");
  });

  it("projects.reopen 없는 팀장 · 담당 PM은 거부 · 그대로", async () => {
    const c = await completedProject();
    expect(await errorOf(reopenAs(c.fx.lead, c))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(reopenAs(c.fx.pm, c))).toBeInstanceOf(ForbiddenError);
    expect((await instanceOf(c.documentId)).status).toBe("approved");
    expect(await projectStatus(c.fx.projectId)).toBe("completed");
    expect(await logsOf(c.documentId, "document_reopen")).toHaveLength(0);
  });

  it("완료 아닌 프로젝트 · 다른 version은 `다른 사람이 먼저 바꿈 · 새로 고침`", async () => {
    const fx = await setupSettlementProject();
    const done = await submitSettlement(fx.pm, { projectId: fx.projectId });
    if (done.kind !== "submitted") throw new Error("올리기 안 됨");
    expect((await errorOf(reopenCompletedProject(fx.ceo, { projectId: fx.projectId, reason: REASON, expectedInstanceVersion: done.version }))).message).toBe(CONFLICT);

    const c = await completedProject();
    expect((await errorOf(reopenCompletedProject(c.fx.ceo, { projectId: c.fx.projectId, reason: REASON, expectedInstanceVersion: c.version - 1 }))).message).toBe(CONFLICT);
    expect((await instanceOf(c.documentId)).status).toBe("approved");
  });

  it("두 번째 되돌리기 — 차례로(트랜잭션 전 판정) · 동시에(트랜잭션 안 엔진 충돌) 모두 `다른 사람이 먼저 바꿈 · 새로 고침`", async () => {
    const first = await completedProject();
    await reopenAs(first.fx.ceo, first);
    expect((await errorOf(reopenAs(first.fx.ceo, first))).message).toBe(CONFLICT);

    const c = await completedProject();
    const sysadmin = await makePerson("시스템관리자", SYSADMIN_ROLE_ID, null);
    const results = await Promise.allSettled([reopenAs(c.fx.ceo, c), reopenAs(sysadmin, c)]);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]?.reason as Error).message).toBe(CONFLICT);
    expect(await logsOf(c.documentId, "document_reopen")).toHaveLength(1);
    expect((await statusChanges(c.fx.projectId)).filter((row) => (row.detail as { trigger?: string }).trigger === "reopen")).toHaveLength(1);
  });

  it("손 전환(changeProjectStatus manual completed → settling)은 대표도 거부", async () => {
    const c = await completedProject();
    await expect(changeProjectStatus(c.fx.ceo, c.fx.projectId, { from: "completed", to: "settling" })).rejects.toBeInstanceOf(GateBlockedError);
    expect(await projectStatus(c.fx.projectId)).toBe("completed");
  });
});

describe("화면 재료 getReopenTarget", () => {
  it("완료 · 승인 문서 · projects.reopen 보유자에게만 version, 그 밖은 null", async () => {
    const c = await completedProject();
    expect(await getReopenTarget(c.fx.ceo, { projectId: c.fx.projectId })).toEqual({ instanceVersion: c.version });
    expect(await getReopenTarget(c.fx.lead, { projectId: c.fx.projectId })).toBeNull();
    expect(await getReopenTarget(c.fx.pm, { projectId: c.fx.projectId })).toBeNull();
    await reopenAs(c.fx.ceo, c);
    expect(await getReopenTarget(c.fx.ceo, { projectId: c.fx.projectId })).toBeNull();
  });
});

describe("되돌린 뒤 draft 소비자(eng D-19-2)", () => {
  it("머리 줄 `작성 중`(올리기 아님) · 정산 문서 낱말 `작성 중` · 담당 PM만 문서 화면 다시 올리기", async () => {
    const c = await completedProject();
    await reopenAs(c.fx.ceo, c);

    expect(await getSettlementHeader(c.fx.pm, { projectId: c.fx.projectId })).toEqual({ statusWord: "작성 중", canSubmit: false });
    expect((await getSettlement(c.fx.pm, { projectId: c.fx.projectId }))?.statusWord).toBe("작성 중");

    const actionsOf = async (viewer: Viewer) =>
      (await getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: c.documentId, readOnlyVisible: true }))?.actions ?? [];
    expect(await actionsOf(c.fx.pm)).toContain("resubmit");
    expect(await actionsOf(c.fx.ceo)).toEqual([]);
    expect(await actionsOf(c.fx.lead)).toEqual([]);
  });

  it("결재선 끝 줄 `되돌림 · {이름} · MM-DD HH:mm · 사유 {원문}` 한 줄 — 결재 정보를 못 보는 계급에는 없다", async () => {
    const c = await completedProject();
    await reopenAs(c.fx.ceo, c);
    const view = await getApprovalView(c.fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: c.documentId, readOnlyVisible: true });
    const reopenLines = (view?.endLines ?? []).filter((line) => line.text.startsWith("되돌림"));
    expect(reopenLines).toHaveLength(1);
    expect(reopenLines[0]?.text).toMatch(new RegExp(`^되돌림 · 최대표 · \\d{2}-\\d{2} \\d{2}:\\d{2} · 사유 ${REASON}$`));
    expect(reopenLines[0]?.tone).toBe("muted");

    const viewer = await makePerson("결재 정보 가림", TEAM_LEAD_ROLE_ID, "기획1팀");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "approval.value", visible: false });
    try {
      const hidden = await getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: c.documentId, readOnlyVisible: true });
      expect(JSON.stringify(hidden?.endLines ?? null)).not.toContain(REASON);
    } finally {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "approval.value", visible: true });
    }
  });
});

describe("다시 올리기 — 같은 문서 · 결재선 다시 탐(D-7215 · 07.2 D-7302)", () => {
  it("담당 PM이 다시 올리면 같은 인스턴스 차수 2 · 새 route · 차수 1 기록 그대로 → 대표 승인 → 완료(최종 승인 훅 한 번)", async () => {
    const c = await completedProject();
    const roundOne = await stepsOf(c.instanceId);
    await reopenAs(c.fx.ceo, c);
    const approvalChangesBefore = (await statusChanges(c.fx.projectId)).filter((row) => (row.detail as { trigger?: string }).trigger === "approval").length;

    const again = await submitSettlement(c.fx.pm, { projectId: c.fx.projectId });
    expect(again).toMatchObject({ kind: "submitted", documentId: c.documentId, instanceId: c.instanceId, round: 2 });
    const steps = await stepsOf(c.instanceId);
    expect(steps.filter((step) => step.round === 1)).toEqual(roundOne);
    expect(steps.filter((step) => step.round === 2).map((step) => step.action)).toEqual([null]);
    expect((await instanceOf(c.documentId)).status).toBe("submitted");
    if (again.kind !== "submitted") throw new Error("다시 올리기 안 됨");

    await approveDocument(c.fx.ceo, { instanceId: c.instanceId, expectedVersion: again.version });
    expect(await projectStatus(c.fx.projectId)).toBe("completed");
    expect((await statusChanges(c.fx.projectId)).filter((row) => (row.detail as { trigger?: string }).trigger === "approval")).toHaveLength(approvalChangesBefore + 1);
    expect(await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, c.fx.projectId))).toHaveLength(1);
    // 끝 줄은 round 2 진행 · 승인 뒤에도 남는다.
    const view = await getApprovalView(c.fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: c.documentId, readOnlyVisible: true });
    expect((view?.endLines ?? []).some((line) => line.text.startsWith("되돌림 · 최대표"))).toBe(true);
  });

  it("되돌린 뒤 담당 PM 아닌 사람의 다시 올리기는 거부", async () => {
    const c = await completedProject();
    await reopenAs(c.fx.ceo, c);
    await expect(submitSettlement(c.fx.lead, { projectId: c.fx.projectId })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await instanceOf(c.documentId)).status).toBe("draft");
  });

  it("완료 뒤 담당 PM을 B로 바꾸고 되돌리면 B만 다시 올린다(07.2 D-7311) — 인스턴스 기안자 B · 로그에 이전 기안자 · A 거부", async () => {
    const c = await completedProject();
    const nextPm = await makePerson("새 담당 PM", DEFAULT_ROLE_ID, "기획1팀");
    await db.update(projects).set({ pmUserId: nextPm.id }).where(eq(projects.id, c.fx.projectId));
    await reopenAs(c.fx.ceo, c);

    const refusedA = await errorOf(submitSettlement(c.fx.pm, { projectId: c.fx.projectId }));
    expect(refusedA).toBeInstanceOf(ForbiddenError);

    expect(await submitSettlement(nextPm, { projectId: c.fx.projectId })).toMatchObject({ kind: "submitted", instanceId: c.instanceId, round: 2 });
    expect((await instanceOf(c.documentId)).drafterId).toBe(nextPm.id);
    const submits = await logsOf(c.documentId, "document_submit");
    expect((submits.at(-1)?.detail as { previousDrafterId?: string }).previousDrafterId).toBe(c.fx.pm.id);
  });

  it("행동 로그 정리를 돌려도 document_reopen 줄은 남고 끝 줄 그대로 · 두 번 되돌리면 끝 줄은 가장 최근 한 줄", async () => {
    const c = await completedProject();
    await reopenAs(c.fx.ceo, c, "첫 되돌림");
    await markActionLogRowsPruned(SYSTEM_VIEWER, { documentId: c.documentId });
    expect((await logsOf(c.documentId, "document_reopen"))[0]?.prunedAt).toBeNull();

    const again = await submitSettlement(c.fx.pm, { projectId: c.fx.projectId });
    if (again.kind !== "submitted") throw new Error("다시 올리기 안 됨");
    await approveDocument(c.fx.ceo, { instanceId: c.instanceId, expectedVersion: again.version });
    const version = (await instanceOf(c.documentId)).version;
    await reopenCompletedProject(c.fx.ceo, { projectId: c.fx.projectId, reason: "두째 되돌림", expectedInstanceVersion: version });

    const view = await getApprovalView(c.fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: c.documentId, readOnlyVisible: true });
    const reopenLines = (view?.endLines ?? []).filter((line) => line.text.startsWith("되돌림"));
    expect(reopenLines).toHaveLength(1);
    expect(reopenLines[0]?.text.endsWith("사유 두째 되돌림")).toBe(true);
    expect((await logsOf(c.documentId, "document_reopen")).map((row) => (row.detail as { round?: number }).round)).toEqual([1, 2]);
  });
});
