import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, settlementApprovals } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  approveDocument,
  getApprovalView,
  listMyInbox,
  rejectDocument,
  withdrawDocument,
  ApprovalConflictError,
  ROUTE_BLOCKED_ASSIGN_LINE,
  ROUTE_BLOCKED_DRAFTER_LINE,
} from "@/domain/approvals";
import { submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { SETTLEMENT_DOCUMENT_KIND, SettlementUndoRefusedError, submitSettlement, withdrawSettlement } from "@/domain/settlements";
import { setSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { setUserArchived } from "@/repositories/users";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";
import { setupSettlementProject } from "./fixtures/settlements";

// 06.6 D28: 지금 차수에 기안자 아닌 사람의 승인이 있으면 기안자 회수를 막는다(결재 모듈 공통). 승인 0건 갈래(건너뜀 · 2차 ·
// 결재할 사람 없음)와 본인 승인(D-6602)은 회수되고, 인박스와 상세의 가능 행동이 같다. 매 it은 setup의 TRUNCATE + 시드에서 시작한다.

const FULL_DAY = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
const RESUBMIT_INPUT = { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "", note: "날짜 변경" };
const deps = { now: NOW_2026 };

async function selfApprove() {
  await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL.key, "self_approve", null);
}

async function currentSteps(instanceId: string, round: number) {
  return db
    .select({ stepIndex: approvalSteps.stepIndex, actedBy: approvalSteps.actedBy, actedAt: approvalSteps.actedAt, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), eq(approvalRoutes.round, round)))
    .orderBy(asc(approvalSteps.stepIndex));
}

// 불변 스냅숏 — 인스턴스 status · version · 차수 + 지금 차수 단계 행 + action_log 행 수.
async function snapshot(instanceId: string) {
  const [instance] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!instance) throw new Error("인스턴스 없음");
  return {
    status: instance.status,
    version: instance.version,
    round: instance.currentRound,
    steps: await currentSteps(instanceId, instance.currentRound),
    log: await countRows("action_log"),
  };
}

async function leaveView(viewer: Viewer, leaveId: string) {
  return getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, deps);
}

async function submittedSettlement(viewer: Viewer, projectId: string) {
  await submitSettlement(viewer, { projectId });
  const [doc] = await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, projectId));
  if (!doc) throw new Error("정산 결재 문서 없음");
  const [instance] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, doc.id)));
  if (!instance) throw new Error("결재 인스턴스 없음");
  return { documentId: doc.id, instanceId: instance.id, version: instance.version };
}

describe("06.6 결재 회수 막기(D28) — 앞 사람 승인 · 승인 0건 갈래 · 본인 승인 · 인박스", () => {
  it("정산: 팀장 1단 승인 뒤 PM 회수는 맞는 version이어도 거부 · 행 · version · 로그 그대로 · PM 가능 행동 [](G3)", async () => {
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED, true);
    const fx = await setupSettlementProject();
    const doc = await submittedSettlement(fx.pm, fx.projectId);
    const approved = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    expect(approved.status).toBe("in_review");
    const before = await snapshot(doc.instanceId);

    await expect(withdrawSettlement(fx.pm, { projectId: fx.projectId, expectedInstanceVersion: approved.version })).rejects.toBeInstanceOf(
      ApprovalConflictError,
    );
    expect(await snapshot(doc.instanceId)).toEqual(before);
    const view = await getApprovalView(fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.documentId });
    expect(view?.actions).toEqual([]);
  });

  it("연차 기본 건너뜀 · 팀장 기안: 승인 0건 · submitted · 팀장 [회수] · 회수 성공(G4)", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(lead, FULL_DAY, deps);
    expect((await snapshot(doc.instanceId)).status).toBe("submitted");
    expect((await currentSteps(doc.instanceId, 1)).filter((step) => step.action !== null)).toHaveLength(0);
    expect((await leaveView(lead, doc.leaveId))?.actions).toEqual(["withdraw"]);

    const withdrawn = await withdrawDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("반려 뒤 다시 신청한 2차: 지난 차수 승인과 무관하게 기안자 [회수] · 회수 성공(G5)", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(drafter, FULL_DAY, deps);
    const approved = await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);
    const rejected = await rejectDocument(ceo, { instanceId: doc.instanceId, expectedVersion: approved.version, reason: "일정 겹침" }, deps);
    const resubmitted = await resubmitLeave(drafter, { leaveId: doc.leaveId, expectedVersion: rejected.version, input: RESUBMIT_INPUT }, deps);
    expect(resubmitted.round).toBe(2);
    expect((await snapshot(doc.instanceId)).status).toBe("submitted");
    expect((await leaveView(drafter, doc.leaveId))?.actions).toEqual(["withdraw"]);

    const withdrawn = await withdrawDocument(drafter, { instanceId: doc.instanceId, expectedVersion: resubmitted.version }, deps);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("본인 승인(D-6602): 팀장 본인 승인 뒤 [회수] · 본부장 승인 뒤 [] · 회수 거부 · 상태 그대로(G6)", async () => {
    await selfApprove();
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const divHead = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(lead, FULL_DAY, deps);
    const selfApproved = await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);
    expect((await leaveView(lead, doc.leaveId))?.actions).toEqual(["withdraw"]);

    const headApproved = await approveDocument(divHead, { instanceId: doc.instanceId, expectedVersion: selfApproved.version }, deps);
    expect(headApproved.status).toBe("in_review");
    expect((await leaveView(lead, doc.leaveId))?.actions).toEqual([]);
    const before = await snapshot(doc.instanceId);
    const refused = await withdrawDocument(lead, { instanceId: doc.instanceId, expectedVersion: headApproved.version }, deps).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(ApprovalConflictError);
    expect((refused as Error).message.startsWith("본부장이 ")).toBe(true);
    expect((refused as Error).message.endsWith("에 승인함 · 새로 고침")).toBe(true);
    expect(await snapshot(doc.instanceId)).toEqual(before);
  });

  it("결재할 사람 없음(no_fallback_holder): 기안자 [회수] · 끝 줄 회수 후 새로 신청 · 회수 성공(G7b)", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(drafter, FULL_DAY, deps);
    await setUserArchived(SYSTEM_VIEWER, ceo.id, true);

    const view = await leaveView(drafter, doc.leaveId);
    expect(view?.actions).toEqual(["withdraw"]);
    expect(view?.endLines?.at(-1)).toEqual({ text: ROUTE_BLOCKED_DRAFTER_LINE, tone: "danger" });
    expect(view?.endLines?.some((line) => line.text === ROUTE_BLOCKED_ASSIGN_LINE)).toBe(false);

    const withdrawn = await withdrawDocument(drafter, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("본인 승인만 있는 멈춘 문서(orphan_final)는 회수되고 끝 줄은 회수 후 새로 신청(06.6 D-6602 · D-6604)(G7c)", async () => {
    await selfApprove();
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const divHead = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(lead, FULL_DAY, deps);
    const selfApproved = await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);
    // 막힘이 no_fallback_holder가 아니라 orphan_final임을 보장 — 본인 승인 1건(approvers ≥ 1)이 있는 진행 중 문서.
    expect(selfApproved.status).toBe("in_review");
    expect((await currentSteps(doc.instanceId, 1)).filter((step) => step.action === "approved" && step.actedBy === lead.id)).toHaveLength(1);
    await setUserArchived(SYSTEM_VIEWER, divHead.id, true);
    await setUserArchived(SYSTEM_VIEWER, ceo.id, true);

    const view = await leaveView(lead, doc.leaveId);
    expect(view?.endLines?.some((line) => line.text === ROUTE_BLOCKED_DRAFTER_LINE || line.text === ROUTE_BLOCKED_ASSIGN_LINE)).toBe(true);
    expect(view?.actions).toEqual(["withdraw"]);
    expect(view?.endLines?.at(-1)).toEqual({ text: ROUTE_BLOCKED_DRAFTER_LINE, tone: "danger" });
    expect(view?.endLines?.some((line) => line.text === ROUTE_BLOCKED_ASSIGN_LINE)).toBe(false);

    const withdrawn = await withdrawDocument(lead, { instanceId: doc.instanceId, expectedVersion: selfApproved.version }, deps);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("정산 늦은 되돌리기: 팀장 승인 뒤 PM 토스트 되돌리기 거부 문구 꼬리는 새로 고침(D-6609)(G8)", async () => {
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED, true);
    const fx = await setupSettlementProject();
    const doc = await submittedSettlement(fx.pm, fx.projectId);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });

    const late = await withdrawSettlement(fx.pm, { projectId: fx.projectId, undo: true, round: 1 }).catch((error: unknown) => error);
    expect(late).toBeInstanceOf(SettlementUndoRefusedError);
    expect((late as Error).message.endsWith("에 승인함 · 새로 고침")).toBe(true);
  });

  it("인박스 = 상세: 본부장 기안 · 팀장 1단 승인 · 본부장 2단 지금 담당 → 둘 다 [승인](회수 없음)(G9)", async () => {
    await selfApprove();
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const divHead = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(divHead, FULL_DAY, deps);
    await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version }, deps);

    const inbox = await listMyInbox(divHead, { now: NOW_2026, withDetails: true });
    const item = inbox.mine.find((row) => row.instanceId === doc.instanceId);
    expect(item?.actions).toEqual(["approve"]);
    expect((await leaveView(divHead, doc.leaveId))?.actions).toEqual(["approve"]);
  });
});
