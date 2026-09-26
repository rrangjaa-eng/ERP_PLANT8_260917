import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, leaveRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
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
} from "@/domain/approvals";
import { submitLeave, getLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID } from "@/domain/settings/keys";
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

async function rejectedDoc(org: Org) {
  const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
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

  it("in_review에서 기안자 회수 → withdrawn이고 이미 승인한 1단 기록은 남는다", async () => {
    const org = await makeOrg();
    const submitted = await submitLeave(org.drafter, FULL_DAY, deps);
    await approveDocument(org.lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, deps);
    await withdrawDocument(org.drafter, { instanceId: submitted.instanceId, expectedVersion: 2 }, deps);
    expect(await instanceOf(submitted.instanceId)).toMatchObject({ status: "withdrawn", version: 3 });
    expect((await stepsOf(submitted.instanceId))[0]).toMatchObject({ action: "approved", actedBy: org.lead.id });
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
    await expect(
      resubmitLeave(org.drafter, { leaveId: submitted.leaveId, expectedVersion: 1, input: RESUBMIT_INPUT }, deps),
    ).rejects.toBeInstanceOf(UserFacingError);
    expect((await roundsOf(submitted.instanceId)).length).toBe(1);

    const doc = await rejectedDoc(org);
    const before = await state(doc.instanceId, doc.leaveId);
    await expect(
      resubmitLeave(org.pm, { leaveId: doc.leaveId, expectedVersion: doc.version, input: RESUBMIT_INPUT }, deps),
    ).rejects.toBeInstanceOf(UserFacingError);
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
    const withdrawn = await submitLeave(org.drafter, FULL_DAY, deps);
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
  it("기안자: submitted · in_review → [회수] · rejected → [다시 신청] · withdrawn · approved → [] · 1단 후보는 [승인, 반려]", async () => {
    const org = await makeOrg();
    const doc = await submitLeave(org.drafter, FULL_DAY, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual(["withdraw"]);
    expect(await viewActions(org.lead, doc.leaveId)).toEqual(["approve", "reject"]);
    await approveDocument(org.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual(["withdraw"]);
    await approveDocument(org.ceo, { instanceId: doc.instanceId, expectedVersion: 2 }, deps);
    expect(await viewActions(org.drafter, doc.leaveId)).toEqual([]);

    const rejected = await rejectedDoc(org);
    expect(await viewActions(org.drafter, rejected.leaveId)).toEqual(["resubmit"]);

    const withdrawn = await submitLeave(org.drafter, FULL_DAY, deps);
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

    const second = await submitLeave(lead, FULL_DAY, deps);
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

    const second = await submitLeave(ceoDrafter, FULL_DAY, deps);
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

    const doc = await rejectedDoc(org);
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
    const hidden = await submitLeave(org.drafter, FULL_DAY, deps);
    const hiddenApprove = await approveDocument(org.lead, { instanceId: hidden.instanceId, expectedVersion: 1 }, deps);
    const leadResult = await projectActionResult(org.lead, {
      documentId: hiddenApprove.documentId,
      final: hiddenApprove.final,
      nextHolderNames: hiddenApprove.nextHolderNames,
    });
    expect(JSON.stringify(leadResult)).not.toContain("최대표");
    expect(leadResult).toMatchObject({ documentId: hidden.leaveId, final: false });

    const toReject = await submitLeave(org.drafter, FULL_DAY, deps);
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
