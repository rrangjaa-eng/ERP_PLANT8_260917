import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, leaveRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setVisibilityCell } from "@/domain/permissions/matrix";
import {
  approveDocument,
  describeDeduction,
  getApprovalView,
  projectActionResult,
  rejectDocument,
  withdrawDocument,
  ApprovalConflictError,
  NotCurrentHolderError,
  NOT_HOLDER_MESSAGE,
  previewRoute,
  prepareReopen,
  reopenApprovedDocument,
  type ReopenAuthority,
} from "@/domain/approvals";
import { withTransaction } from "@/lib/db-transaction";
import { SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { setupSettlementProject } from "./fixtures/settlements";
import { submitLeave, getLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import {
  APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER,
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
} from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import type { appendActionLog } from "@/repositories/action-log";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// 04.1-02 Task 2: 반려(사유 필수) · 회수(최종 전만) · 다시 신청(번호 유지 · 새 차수 고정)이 공용 전이 함수
// 하나를 지나고, 전이와 행동 로그가 한 트랜잭션이다. 결재선 설정 · 권한 · 노출은 매 테스트 전 setup의
// TRUNCATE + 시드로 원래 값이 된다(테스트가 바꾼 값은 다음 테스트로 새지 않는다).

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer; pm: Viewer };

// 기획1팀에 기안자(기획 PM) · 팀장 · 무관한 기획 PM, 대표 한 명(팀 없음). 2·3단은 빈 자리라 팀장 승인 뒤 지금 단계는 4단(대표).
async function makeOrg(): Promise<Org> {
  return {
    drafter: await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀"),
    lead: await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
    ceo: await makePerson("최대표", CEO_ROLE_ID, null),
    pm: await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀"),
  };
}

const FULL_DAY = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
const FULL_DAY_B = { ...FULL_DAY, startDate: "2026-09-14", endDate: "2026-09-16" };
const FULL_DAY_C = { ...FULL_DAY, startDate: "2026-09-07", endDate: "2026-09-09" };
const RESUBMIT_INPUT = { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "", note: "날짜 변경" };
const REASON = "현장 일정 겹침";
const deps = { now: NOW_2026 };

async function instanceOf(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스 없음");
  return row;
}

async function stepsOf(instanceId: string) {
  return db
    .select({
      round: approvalRoutes.round,
      stepIndex: approvalSteps.stepIndex,
      roleId: approvalSteps.roleId,
      actedBy: approvalSteps.actedBy,
      actedAt: approvalSteps.actedAt,
      action: approvalSteps.action,
      reason: approvalSteps.reason,
    })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

async function roundsOf(instanceId: string) {
  return db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId)).orderBy(asc(approvalRoutes.round));
}

async function leaveRowOf(leaveId: string) {
  const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId));
  if (!row) throw new Error("신청 행 없음");
  return row;
}

async function logsOf(entityId: string) {
  return db.select().from(actionLog).where(eq(actionLog.entityId, entityId)).orderBy(asc(actionLog.seq));
}

async function state(instanceId: string, leaveId: string) {
  const instance = await instanceOf(instanceId);
  const leave = await leaveRowOf(leaveId);
  return {
    status: instance.status,
    version: instance.version,
    round: instance.currentRound,
    steps: await stepsOf(instanceId),
    routes: (await roundsOf(instanceId)).length,
    leave: [leave.kind, leave.startDate, leave.endDate, leave.half, leave.note, leave.number],
    log: await countRows("action_log"),
  };
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error("거부되어야 하는데 성공함");
    },
    (error: unknown) => error as Error,
  );
}

async function viewActions(viewer: Viewer, leaveId: string) {
  return (await getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, deps))?.actions;
}

async function rejectedDoc(org: Org, input = FULL_DAY) {
  const submitted = await submitLeave(org.drafter, input, deps);
  const rejected = await rejectDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1, reason: REASON }, deps);
  return { ...submitted, version: rejected.version };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("반려 — 사유 필수 · 기안자에게 돌아감(EXP-03)", () => {
  it("1단 후보의 반려: 상태 rejected · 1단 행에 action · 사유 · 처리자 · 시각 · 문서 상태 반려 · document_reject 로그", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const result = await rejectDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1, reason: `  ${REASON}  ` }, deps);
    expect(result).toMatchObject({ status: "rejected", version: 2, documentId: submitted.leaveId, drafterName: "박서연" });

    const [step1] = await stepsOf(submitted.instanceId);
    expect(step1).toMatchObject({ round: 1, stepIndex: 1, action: "rejected", reason: REASON, actedBy: org.lead.id });
    expect(step1?.actedAt).toBeInstanceOf(Date);
    expect((await getLeave(org.drafter, submitted.leaveId, deps))?.status).toBe("rejected");

    const rejectLogs = (await logsOf(submitted.instanceId)).filter((row) => row.actionType === "document_reject");
    expect(rejectLogs).toHaveLength(1);
    expect(rejectLogs[0]?.detail).toMatchObject({ round: 1 });
  });

  it.each([
    ["빈 문자열", "", "사유 없음 · 사유 적기"],
    ["공백뿐", "   ", "사유 없음 · 사유 적기"],
    ["501자", "가".repeat(501), "사유 500자 넘음 · 줄여 적기"],
  ])("사유가 %s이면 서버가 거부하고 상태는 그대로", async (_label, reason, message) => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const before = await state(submitted.instanceId, submitted.leaveId);
    const error = await errorOf(rejectDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1, reason }, deps));
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe(message);
    expect(await state(submitted.instanceId, submitted.leaveId)).toEqual(before);
  });

  it("(CEO-8 · CEO-18) 기안자 · 무관한 기획 PM · 대표(4단 전)의 맞는 version 반려는 전부 거부 · 기록 0 · version 그대로 · 사유 글자 없는 운영 로그", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const infoSpy = vi.spyOn(log, "info");
    for (const viewer of [org.drafter, org.pm, org.ceo]) {
      const error = await errorOf(rejectDocument(viewer, { instanceId: submitted.instanceId, expectedVersion: 1, reason: REASON }, deps));
      expect(error).toBeInstanceOf(NotCurrentHolderError);
      expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", {
        instanceId: submitted.instanceId,
        viewerId: viewer.id,
        reason: "not_holder",
        expectedVersion: 1,
        actualVersion: 1,
      });
    }
    expect(infoSpy.mock.calls.filter(([event]) => event === "approval.refused")).toHaveLength(3);
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(REASON);
    expect((await stepsOf(submitted.instanceId)).filter((step) => step.actedBy !== null)).toHaveLength(0);
    expect(await instanceOf(submitted.instanceId)).toMatchObject({ status: "submitted", version: 1 });
  });
});

describe("회수 — 최종 승인 전만 · 끝 상태", () => {
  it("submitted에서 기안자 회수 → withdrawn · document_withdraw 로그", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const result = await withdrawDocument(org.drafter, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps);
    expect(result).toMatchObject({ status: "withdrawn", version: 2 });
    expect((await logsOf(submitted.instanceId)).filter((row) => row.actionType === "document_withdraw")).toHaveLength(1);
  });

  it("in_review(팀장 승인 1건)에서 기안자 회수 거부(06.6 D28) · 상태 · version · 단계 · 로그 그대로 · 팀장 회수는 not_drafter", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps);
    const before = await state(submitted.instanceId, submitted.leaveId);
    const infoSpy = vi.spyOn(log, "info");

    const refused = withdrawDocument(org.drafter, { instanceId: submitted.instanceId, expectedVersion: 2 }, deps);
    await expect(refused).rejects.toBeInstanceOf(ApprovalConflictError);
    await expect(refused).rejects.toThrow(/^김팀장이 \d{2}:\d{2}에 승인함 · 새로 고침$/);
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ reason: "invalid_state" }));
    expect(await state(submitted.instanceId, submitted.leaveId)).toEqual(before);
    expect(await viewActions(org.drafter, submitted.leaveId)).toEqual([]);

    await expect(
      withdrawDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 2 }, deps),
    ).rejects.toBeInstanceOf(NotCurrentHolderError);
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ reason: "not_drafter" }));
    expect(await state(submitted.instanceId, submitted.leaveId)).toEqual(before);
  });

  it("approved에서 회수 → `최종 승인됨 · 새로 고침`으로 거부", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps);
    await approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 2 }, deps);
    const error = await errorOf(withdrawDocument(org.drafter, { instanceId: submitted.instanceId, expectedVersion: 3 }, deps));
    expect(error).toBeInstanceOf(ApprovalConflictError);
    expect(error.message).toBe("최종 승인됨 · 새로 고침");
    expect(await instanceOf(submitted.instanceId)).toMatchObject({ status: "approved", version: 3 });
  });

  it("(CEO-18) 기안자가 아닌 사람의 회수는 거부 · reason not_drafter", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const infoSpy = vi.spyOn(log, "info");
    const error = await errorOf(withdrawDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps));
    expect(error).toBeInstanceOf(NotCurrentHolderError);
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", {
      instanceId: submitted.instanceId,
      viewerId: org.lead.id,
      reason: "not_drafter",
      expectedVersion: 1,
      actualVersion: 1,
    });
    expect(await instanceOf(submitted.instanceId)).toMatchObject({ status: "submitted", version: 1 });
  });
});

describe("다시 신청 — 번호 유지 · 새 차수 고정(EXP-04 ordering)", () => {
  it("반려 뒤 설정의 2단 계급을 바꾸고 다시 신청: 번호 같음 · 차수 2 · 차수 1 반려 기록 보존 · 새 계급은 차수 2에만 · 검증된 칸 저장 · document_submit round 2", async () => {
    const org = await makeOrg();
    const doc = await rejectedDoc(org);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key, DEFAULT_ROLE_ID, null);

    const result = await resubmitLeave(org.drafter, { leaveId: doc.leaveId, expectedVersion: doc.version, input: RESUBMIT_INPUT }, deps);
    expect(result).toMatchObject({ leaveId: doc.leaveId, round: 2, version: doc.version + 1 });

    const instance = await instanceOf(doc.instanceId);
    expect(instance).toMatchObject({ status: "submitted", currentRound: 2 });
    const leave = await leaveRowOf(doc.leaveId);
    expect(leave).toMatchObject({ number: doc.number, startDate: "2026-09-28", endDate: "2026-09-29", daysQuarters: 8, half: null, note: "날짜 변경" });

    const steps = await stepsOf(doc.instanceId);
    const round1 = steps.filter((step) => step.round === 1);
    const round2 = steps.filter((step) => step.round === 2);
    expect(round1.find((step) => step.stepIndex === 1)).toMatchObject({ action: "rejected", reason: REASON });
    expect(round1.find((step) => step.stepIndex === 2)?.roleId).not.toBe(DEFAULT_ROLE_ID);
    expect(round2.find((step) => step.stepIndex === 2)?.roleId).toBe(DEFAULT_ROLE_ID);
    expect(round2.every((step) => step.actedBy === null)).toBe(true);

    const submits = (await logsOf(doc.instanceId)).filter((row) => row.actionType === "document_submit");
    expect(submits.map((row) => (row.detail as { round: number }).round)).toEqual([1, 2]);
  });

  it("rejected가 아닌 문서의 다시 신청과 기안자가 아닌 사람의 다시 신청은 거부된다", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const notRejected = await errorOf(
      resubmitLeave(org.drafter, { leaveId: submitted.leaveId, expectedVersion: 1, input: RESUBMIT_INPUT }, deps),
    );
    expect(notRejected).toBeInstanceOf(UserFacingError);
    expect(notRejected).toBeInstanceOf(ApprovalConflictError);
    expect(notRejected.message).toBe(NOT_HOLDER_MESSAGE);
    expect((await roundsOf(submitted.instanceId)).length).toBe(1);

    const doc = await rejectedDoc(org, FULL_DAY_B);
    const before = await state(doc.instanceId, doc.leaveId);
    const notDrafter = await errorOf(
      resubmitLeave(org.pm, { leaveId: doc.leaveId, expectedVersion: doc.version, input: RESUBMIT_INPUT }, deps),
    );
    expect(notDrafter).toBeInstanceOf(UserFacingError);
    expect(notDrafter).toBeInstanceOf(NotCurrentHolderError);
    expect(notDrafter.message).toBe(NOT_HOLDER_MESSAGE);
    expect(await state(doc.instanceId, doc.leaveId)).toEqual(before);
  });
});

describe("사건별 종결 검사(CX-B1)", () => {
  it("rejected 문서: 지금 version의 기안자 회수 · 팀장 승인 · 팀장 반려는 거부되고 행이 그대로, 기안자의 다시 신청만 통과", async () => {
    const org = await makeOrg();
    const doc = await rejectedDoc(org);
    const before = await state(doc.instanceId, doc.leaveId);
    const current = { instanceId: doc.instanceId, expectedVersion: doc.version };

    await expect(withdrawDocument(org.drafter, current, deps)).rejects.toBeInstanceOf(UserFacingError);
    await expect(approveDocument(org.lead, current, deps)).rejects.toBeInstanceOf(UserFacingError);
    await expect(rejectDocument(org.lead, { ...current, reason: REASON }, deps)).rejects.toBeInstanceOf(UserFacingError);
    expect(await state(doc.instanceId, doc.leaveId)).toEqual(before);

    const result = await resubmitLeave(org.drafter, { leaveId: doc.leaveId, expectedVersion: doc.version, input: RESUBMIT_INPUT }, deps);
    expect(result.round).toBe(2);
    expect(await instanceOf(doc.instanceId)).toMatchObject({ status: "submitted", version: doc.version + 1 });
  });

  it("approved · withdrawn 문서에서 기안자의 지금 version 다시 신청은 거부되고 차수 2가 없다", async () => {
    const org = await makeOrg();
    const approved = await submitLeave(org.drafter, FULL_DAY, deps);
    await approveDocument(org.lead, { instanceId: approved.instanceId, expectedVersion: 1 }, deps);
    await approveDocument(org.ceo, { instanceId: approved.instanceId, expectedVersion: 2 }, deps);
    const withdrawn = await submitLeave(org.drafter, FULL_DAY_B, deps);
    await withdrawDocument(org.drafter, { instanceId: withdrawn.instanceId, expectedVersion: 1 }, deps);

    for (const [doc, version] of [
      [approved, 3],
      [withdrawn, 2],
    ] as const) {
      await expect(
        resubmitLeave(org.drafter, { leaveId: doc.leaveId, expectedVersion: version, input: RESUBMIT_INPUT }, deps),
      ).rejects.toBeInstanceOf(UserFacingError);
      expect((await roundsOf(doc.instanceId)).length).toBe(1);
    }
  });
});

describe("가능 행동(X-5 · CXF-B-F01)", () => {
  it("기안자: submitted → [회수] · in_review(앞 사람 승인) → [] · rejected → [다시 신청] · withdrawn · approved → [] · 1단 후보는 [승인, 반려]", async () => {
    const org = await makeOrg();
    const doc = await submitLeave(org.drafter, FULL_DAY, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual(["withdraw"]);
    expect(await viewActions(org.lead, doc.leaveId)).toEqual(["approve", "reject"]);
    await approveDocument(org.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual([]);
    await approveDocument(org.ceo, { instanceId: doc.instanceId, expectedVersion: 2 }, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual([]);

    const rejected = await rejectedDoc(org, FULL_DAY_B);
    expect(await viewActions(org.drafter, rejected.leaveId)).toEqual(["resubmit"]);

    const withdrawn = await submitLeave(org.drafter, FULL_DAY_C, deps);
    await withdrawDocument(org.drafter, { instanceId: withdrawn.instanceId, expectedVersion: 1 }, deps);
    expect(await viewActions(org.drafter, withdrawn.leaveId)).toEqual([]);
  });

  it("W5 팀장 본인 승인: 가능 행동 [승인, 회수] · 기안자 반려 거부 · 승인 성공 뒤 [회수] · 두 번째 문서 회수 성공", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL.key, "self_approve", null);
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(lead, FULL_DAY, deps);
    expect(await viewActions(lead, doc.leaveId)).toEqual(["approve", "withdraw"]);

    const infoSpy = vi.spyOn(log, "info");
    await expect(rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1, reason: REASON }, deps)).rejects.toBeInstanceOf(
      NotCurrentHolderError,
    );
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ reason: "not_holder" }));
    expect(await instanceOf(doc.instanceId)).toMatchObject({ status: "submitted", version: 1 });
    expect((await stepsOf(doc.instanceId)).filter((step) => step.actedBy !== null)).toHaveLength(0);

    await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect((await stepsOf(doc.instanceId))[0]).toMatchObject({ action: "approved", actedBy: lead.id });
    expect(await viewActions(lead, doc.leaveId)).toEqual(["withdraw"]);

    const second = await submitLeave(lead, FULL_DAY_B, deps);
    await withdrawDocument(lead, { instanceId: second.instanceId, expectedVersion: 1 }, deps);
    expect((await instanceOf(second.instanceId)).status).toBe("withdrawn");
  });

  it("W8 대표 폴백 기안자(1~3단 빈 자리 · 대표 계급 재직자 = 기안자 한 명): [승인, 회수] · 반려 거부 · 승인 성공 · 두 번째 문서 회수 성공", async () => {
    const ceoDrafter = await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(ceoDrafter, FULL_DAY, deps);
    expect(await viewActions(ceoDrafter, doc.leaveId)).toEqual(["approve", "withdraw"]);
    await expect(
      rejectDocument(ceoDrafter, { instanceId: doc.instanceId, expectedVersion: 1, reason: REASON }, deps),
    ).rejects.toBeInstanceOf(NotCurrentHolderError);
    const approved = await approveDocument(ceoDrafter, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect(approved.status).toBe("approved");

    const second = await submitLeave(ceoDrafter, FULL_DAY_B, deps);
    await withdrawDocument(ceoDrafter, { instanceId: second.instanceId, expectedVersion: 1 }, deps);
    expect((await instanceOf(second.instanceId)).status).toBe("withdrawn");
  });
});

describe("원자성 — 로그 쓰기 실패면 전이 전체가 롤백(Codex HIGH)", () => {
  const failingAppend: typeof appendActionLog = () => Promise.reject(new Error("action_log 쓰기 실패(주입)"));
  const failing = { ...deps, appendActionLog: failingAppend };

  it("반려 · 회수 · 다시 신청 각각 — 호출 실패 · 상태 · version · 단계 · 차수 · 신청 칸 · action_log 행 수가 그대로", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const before = await state(submitted.instanceId, submitted.leaveId);
    const current = { instanceId: submitted.instanceId, expectedVersion: 1 };

    await expect(rejectDocument(org.lead, { ...current, reason: REASON }, failing)).rejects.toThrow("주입");
    expect(await state(submitted.instanceId, submitted.leaveId)).toEqual(before);
    await expect(withdrawDocument(org.drafter, current, failing)).rejects.toThrow("주입");
    expect(await state(submitted.instanceId, submitted.leaveId)).toEqual(before);

    const doc = await rejectedDoc(org, FULL_DAY_B);
    const rejectedBefore = await state(doc.instanceId, doc.leaveId);
    await expect(
      resubmitLeave(org.drafter, { leaveId: doc.leaveId, expectedVersion: doc.version, input: RESUBMIT_INPUT }, failing),
    ).rejects.toThrow("주입");
    expect(await state(doc.instanceId, doc.leaveId)).toEqual(rejectedBefore);
  });
});

describe("액션 반환값 투영(B-A1)", () => {
  it("노출을 끈 결재자에게는 다음 담당 · 기안자 이름 · 차감 일수가 없고, 켠 대조 사례에는 있다", async () => {
    const org = await makeOrg();

    // 켠 대조 — 이름 · 일수가 있다(검출기).
    const shown = await submitLeave(org.drafter, FULL_DAY, deps);
    const shownApprove = await approveDocument(org.lead, { instanceId: shown.instanceId, expectedVersion: 1 }, deps);
    const shownLead = await projectActionResult(org.lead, { documentId: shownApprove.documentId, final: shownApprove.final, nextHolderNames: shownApprove.nextHolderNames });
    expect(shownLead).toMatchObject({ documentId: shown.leaveId, final: false, nextHolderNames: "최대표" });
    const shownFinal = await approveDocument(org.ceo, { instanceId: shown.instanceId, expectedVersion: 2 }, deps);
    const shownDays = await describeDeduction(org.ceo, { kind: shownFinal.kind, documentId: shownFinal.documentId });
    expect(await projectActionResult(org.ceo, { documentId: shownFinal.documentId, final: true, deductedDays: shownDays })).toMatchObject({
      final: true,
      deductedDays: "3일",
    });

    // 팀장 계급 approval.value 끔 — 다음 담당 · 기안자 이름이 없다.
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "approval.value", visible: false });
    const hidden = await submitLeave(org.drafter, FULL_DAY_B, deps);
    const hiddenApprove = await approveDocument(org.lead, { instanceId: hidden.instanceId, expectedVersion: 1 }, deps);
    const leadResult = await projectActionResult(org.lead, {
      documentId: hiddenApprove.documentId,
      final: hiddenApprove.final,
      nextHolderNames: hiddenApprove.nextHolderNames,
    });
    expect(JSON.stringify(leadResult)).not.toContain("최대표");
    expect(leadResult).toMatchObject({ documentId: hidden.leaveId, final: false });

    const toReject = await submitLeave(org.drafter, FULL_DAY_C, deps);
    const rejected = await rejectDocument(org.lead, { instanceId: toReject.instanceId, expectedVersion: 1, reason: REASON }, deps);
    const rejectResult = await projectActionResult(org.lead, { documentId: rejected.documentId, final: false, drafterName: rejected.drafterName });
    expect(JSON.stringify(rejectResult)).not.toContain("박서연");

    // 마지막 결재자(대표) 계급 leave.value 끔 — 차감 일수가 없다.
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, infoItem: "leave.value", visible: false });
    const finalResult = await approveDocument(org.ceo, { instanceId: hidden.instanceId, expectedVersion: 2 }, deps);
    const days = await describeDeduction(org.ceo, { kind: finalResult.kind, documentId: finalResult.documentId });
    const ceoResult = await projectActionResult(org.ceo, { documentId: finalResult.documentId, final: finalResult.final, deductedDays: days });
    expect(ceoResult).toMatchObject({ final: true });
    expect(ceoResult).not.toHaveProperty("deductedDays");
  });
});

// 07.2-13(PU9 · D-7251): 반반차 · 재택 결재 단계 — 설정 슬롯 번호 ≤ N인 단계만 남는다. 미리보기(엔진 previewRoute ·
// 같은 hint)와 제출 · 재상신의 approval_steps가 같고, 진행 중 문서는 제출 때 굳은 결재선 그대로다.
describe("반반차 · 재택 결재 단계(PU9 · D-7251)", () => {
  // 4단 전부에 보유자가 있는 조직 — 1단 팀장(기획1팀) · 2단 본부 책임자(기획본부) · 3단 본부 책임자(경영관리본부) · 4단 대표.
  async function fullOrg() {
    return {
      drafter: await makePerson("경량기안", DEFAULT_ROLE_ID, "기획1팀"),
      lead: await makePerson("경량팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
      head: await makePerson("경량본부장", DIVISION_HEAD_ROLE_ID, "기획1팀"),
      mgmt: await makePerson("경량경영", DIVISION_HEAD_ROLE_ID, "경영관리팀"),
      ceo: await makePerson("경량대표", CEO_ROLE_ID, null),
    };
  }
  const QUARTER = { kind: "quarter_day", startDate: "2026-09-30", endDate: "2026-09-30", half: "", startTime: "09:00" };
  const REMOTE = { kind: "remote", startDate: "2026-09-15", endDate: "2026-09-15", half: "" };

  async function stepRowsOf(instanceId: string, round: number) {
    const rows = await db
      .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, label: approvalSteps.label })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(eq(approvalRoutes.instanceId, instanceId))
      .orderBy(asc(approvalSteps.stepIndex));
    return rows.filter((row) => row.round === round).map((row) => ({ stepIndex: row.stepIndex, label: row.label }));
  }
  async function previewLabels(viewer: Viewer, leaveKind: "full_day" | "half_day" | "quarter_day" | "remote") {
    return (await previewRoute(viewer, { kind: LEAVE_DOCUMENT_KIND, hint: { leaveKind } }, deps)).steps.map((step) => step.label);
  }
  const setStopAfter = (value: number) => upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER.key, value, null);

  it("값 2: 반반차 · 재택 제출 결재선 = 미리보기 2단 · 종일 = 4단 · 제출 뒤 값 1로 바꿔도 진행 중 문서 그대로", async () => {
    const org = await fullOrg();
    await setStopAfter(2);

    const quarterPreview = await previewLabels(org.drafter, "quarter_day");
    const quarter = await submitLeave(org.drafter, QUARTER, deps);
    const quarterSteps = await stepRowsOf(quarter.instanceId, 1);
    expect(quarterSteps.map((step) => step.stepIndex)).toEqual([1, 2]);
    expect(quarterSteps.map((step) => step.label)).toEqual(quarterPreview);

    const remotePreview = await previewLabels(org.drafter, "remote");
    const remote = await submitLeave(org.drafter, REMOTE, deps);
    expect((await stepRowsOf(remote.instanceId, 1)).map((step) => step.label)).toEqual(remotePreview);
    expect(remotePreview).toHaveLength(2);

    const fullPreview = await previewLabels(org.drafter, "full_day");
    const full = await submitLeave(org.drafter, FULL_DAY, deps);
    const fullSteps = await stepRowsOf(full.instanceId, 1);
    expect(fullSteps.map((step) => step.stepIndex)).toEqual([1, 2, 3, 4]);
    expect(fullSteps.map((step) => step.label)).toEqual(fullPreview);

    await setStopAfter(1);
    expect(await stepRowsOf(quarter.instanceId, 1)).toEqual(quarterSteps);
    expect(await previewLabels(org.drafter, "quarter_day")).toHaveLength(1);
  });

  it("종일 반려 → 반반차로 바꿔 다시 신청: 차수 2 결재선 = 반반차 미리보기(지금 설정 값 2 → 2단) · 차수 1은 4단 그대로", async () => {
    const org = await fullOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const rejected = await rejectDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1, reason: REASON }, deps);
    await setStopAfter(2);

    const preview = await previewLabels(org.drafter, "quarter_day");
    await resubmitLeave(org.drafter, { leaveId: submitted.leaveId, expectedVersion: rejected.version, input: { ...QUARTER, note: "" } }, deps);
    const round2 = await stepRowsOf(submitted.instanceId, 2);
    expect(round2.map((step) => step.stepIndex)).toEqual([1, 2]);
    expect(round2.map((step) => step.label)).toEqual(preview);
    expect((await stepRowsOf(submitted.instanceId, 1)).map((step) => step.stepIndex)).toEqual([1, 2, 3, 4]);
  });

  it("C-3 현행 유지: 1단만 남는 반반차(값 1)를 그 팀장이 올리면 본인 건너뜀으로 비고 대표가 대신 승인한다", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID.key, TEAM_LEAD_ROLE_ID, null);
    await setStopAfter(1);
    const lead = await makePerson("경량팀장기안", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("경량대표승인", CEO_ROLE_ID, null);

    const doc = await submitLeave(lead, QUARTER, deps);
    expect((await stepRowsOf(doc.instanceId, 1)).map((step) => step.stepIndex)).toEqual([1]);
    expect(await viewActions(ceo, doc.leaveId)).toContain("approve");
    const approved = await approveDocument(ceo, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect(approved.status).toBe("approved");
  });

  it("힌트 없이 부르는 미리보기와 다른 단계 끔은 그대로 — 값 2여도 종일은 꺼진 단계만 빠진다", async () => {
    const org = await fullOrg();
    await setStopAfter(2);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ENABLED.key, false, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_ENABLED.key, true, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP4_ENABLED.key, true, null);
    const noHint = (await previewRoute(org.drafter, { kind: LEAVE_DOCUMENT_KIND }, deps)).steps.map((step) => step.label);
    expect(noHint).toEqual(await previewLabels(org.drafter, "full_day"));
    expect(noHint).toHaveLength(3);
    // 슬롯 번호 기준 — 2단이 꺼져 있으면 반반차는 1단 하나뿐이다(켜진 단계 두 개가 아니다).
    expect(await previewLabels(org.drafter, "quarter_day")).toHaveLength(1);
  });
});

// 07.2-19(eng D-19-1 · T-07.2-19-01 · T-07.2-19-02): 엔진 reopen은 기안자 판정 대신 정산 되돌리기 모듈만 만드는 브랜드 권한 값이
// 그 인스턴스 문서와 맞을 때만 지난다 — 값 없이 · 다른 문서 값으로 · 기안자 본인이라도 거부. reopen을 켜지 않은 종류는 값이 있어도 거부.
describe("승인 되돌리기(reopen) — 브랜드 권한 값 · 종류 opt-in(07.2-19)", () => {
  // 테스트 전용 위조 — 운영 코드에서는 domain/settlements/reopen.ts 안 함수만 만든다.
  const forged = (kind: string, documentId: string) => ({ kind, documentId }) as ReopenAuthority;

  async function approvedSettlement() {
    const fx = await setupSettlementProject();
    const done = await submitSettlement(fx.pm, { projectId: fx.projectId });
    if (done.kind !== "submitted") throw new Error("올리기 안 됨");
    const approved = await approveDocument(fx.ceo, { instanceId: done.instanceId, expectedVersion: done.version });
    return { fx, instanceId: done.instanceId, documentId: done.documentId, version: approved.version };
  }

  async function reopenAs(viewer: Viewer, input: { instanceId: string; version: number }, authority?: ReopenAuthority) {
    const prepared = await prepareReopen(viewer);
    return withTransaction((tx) =>
      reopenApprovedDocument(viewer, { instanceId: input.instanceId, expectedVersion: input.version, reason: REASON, authority }, tx, prepared),
    );
  }

  it("값 없이 · 다른 문서 id 값으로 · 기안자(PM) 본인이 값 없이 부르면 모두 거부 · 인스턴스 그대로", async () => {
    const s = await approvedSettlement();
    for (const [viewer, authority] of [
      [s.fx.ceo, undefined],
      [s.fx.ceo, forged(SETTLEMENT_DOCUMENT_KIND, "00000000-0000-4000-8000-000000000000")],
      [s.fx.pm, undefined],
    ] as const) {
      expect(await errorOf(reopenAs(viewer, s, authority))).toBeInstanceOf(NotCurrentHolderError);
    }
    const after = await instanceOf(s.instanceId);
    expect([after.status, after.version]).toEqual(["approved", s.version]);
  });

  it("맞는 값이면 approved → draft · document_reopen 로그(사유 · 차수) 한 줄", async () => {
    const s = await approvedSettlement();
    await reopenAs(s.fx.ceo, s, forged(SETTLEMENT_DOCUMENT_KIND, s.documentId));
    const after = await instanceOf(s.instanceId);
    expect([after.status, after.version, after.currentRound]).toEqual(["draft", s.version + 1, 1]);
    const logs = (await logsOf(s.instanceId)).filter((row) => row.actionType === "document_reopen");
    expect(logs.map((row) => row.detail)).toEqual([{ kind: SETTLEMENT_DOCUMENT_KIND, round: 1, reason: REASON }]);
  });

  it("reopen을 켜지 않은 종류(연차)의 approved는 값이 있어도 거부 · 그대로", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    const first = await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps);
    const final = await approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version }, deps);
    expect(final.status).toBe("approved");
    const refused = await errorOf(reopenAs(org.ceo, { instanceId: submitted.instanceId, version: final.version }, forged(LEAVE_DOCUMENT_KIND, submitted.leaveId)));
    expect(refused).toBeInstanceOf(UserFacingError);
    expect((await instanceOf(submitted.instanceId)).status).toBe("approved");
  });
});
