import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, users } from "@/db/schema";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, currentHolderNames, NotCurrentHolderError, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { getLeave, LeaveValidationError, submitLeave, type SubmitLeaveInput } from "@/domain/leave";
import { LEAVE_CANCEL_KIND, previewLeaveCancel, requestLeaveCancel, resubmitLeaveCancel } from "@/domain/leave/cancel";
import { getMyLeaveBalance } from "@/domain/leave/balance-service";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { listDocumentTitles } from "@/repositories/notify-sources";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// 07.2-15(PU10 · D-7252~7256 · 07.2 D-7310): 승인된 연차의 취소 요청 — 새 문서 종류 leave_cancel(결재 엔진 재사용 · 1단).
// 결재자는 원 연차 최신 차수의 팀장 단계를 복사한 한 단계(기안자가 그 단계 보유자면 다음 단계) · 없으면 엔진 대표 대체.
// 취소 승인은 연차 행을 쓰지 않는다 — 잔고 · 겹침 조회가 같은 판정(cancelledLeaveFilter)으로 그 연차를 뺀다.

const deps = { now: NOW_2026 };
const DAY_21: SubmitLeaveInput = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" };
const STALE = "이미 처리됨 · 새로 고침";

async function world() {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

async function instanceOf(kind: string, documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, kind), eq(approvalInstances.documentId, documentId)));
  if (!row) throw new Error(`인스턴스 없음: ${kind}`);
  return row;
}

// 지금 담당이 누구든 people 중 승인할 수 있는 사람이 끝까지 승인한다(지금 담당이 아니면 엔진이 NotCurrentHolderError).
async function approveThrough(people: Viewer[], instanceId: string): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
    if (row?.status === "approved") return;
    let moved = false;
    for (const person of people) {
      try {
        await approveDocument(person, { instanceId, expectedVersion: row?.version ?? 0 }, deps);
        moved = true;
        break;
      } catch (error) {
        if (!(error instanceof NotCurrentHolderError)) throw error;
      }
    }
    if (!moved) throw new Error("승인할 사람 없음");
  }
  throw new Error("최종 승인에 닿지 않음");
}

async function approvedLeave(drafter: Viewer, approvers: Viewer[], input: SubmitLeaveInput = DAY_21) {
  const leave = await submitLeave(drafter, input, deps);
  await approveThrough(approvers, leave.instanceId);
  return leave;
}

async function cancelSteps(instanceId: string) {
  return db
    .select({ roleId: approvalSteps.roleId, scopeKind: approvalSteps.scopeKind, round: approvalRoutes.round })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

async function annualUsed(viewer: Viewer): Promise<number | undefined> {
  return (await getMyLeaveBalance(viewer, { fiscalYear: 2026 }, deps)).annual?.usedQuarters;
}

async function refusal(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  return error as Error;
}

describe("트레이서 — 승인된 연차 → 취소 요청 → 팀장 1단 승인 → 취소됨 · 잔고 · 겹침 복귀(PU10)", () => {
  it("결재자 = 원 결재선 팀장 1명 · 단계 1행 · 팀장 승인 한 번에 최종 · 상태 cancelled · 사용 −1일 · 같은 날 새 신청 통과", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    expect(await annualUsed(drafter)).toBe(4);
    expect((await getLeave(drafter, leave.leaveId, deps))?.cancelState).toBe("none");

    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "  일정 바뀜  " }, deps);
    expect(cancel.approverName).toBe("김팀장");
    const instance = await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId);
    expect(instance).toMatchObject({ id: cancel.instanceId, status: "submitted", drafterId: drafter.id });
    expect(await cancelSteps(cancel.instanceId)).toEqual([{ roleId: TEAM_LEAD_ROLE_ID, scopeKind: "team", round: 1 }]);
    expect(await currentHolderNames(drafter, { kind: LEAVE_CANCEL_KIND, documentId: leave.leaveId })).toBe("김팀장");
    expect((await getLeave(drafter, leave.leaveId, deps))?.cancelState).toBe("requested");
    // 요청 중에는 아직 잔고 · 겹침이 그대로다.
    expect(await annualUsed(drafter)).toBe(4);
    await expect(submitLeave(drafter, DAY_21, deps)).rejects.toBeInstanceOf(LeaveValidationError);

    const done = await approveDocument(lead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps);
    expect(done).toMatchObject({ status: "approved", final: true });
    expect((await getLeave(drafter, leave.leaveId, deps))?.cancelState).toBe("cancelled");
    // 원 연차 인스턴스는 그대로 approved(연차 행 · 원 결재 쓰기 0).
    expect((await instanceOf("leave", leave.leaveId)).status).toBe("approved");
    expect(await annualUsed(drafter)).toBe(0);
    await expect(submitLeave(drafter, DAY_21, deps)).resolves.toMatchObject({ version: 1 });
  });
});

describe("반려 · 회수 · 다시 요청(D-7253 — 문서당 취소 건 하나)", () => {
  it("반려 → 연차 · 잔고 그대로 → 취소 다시 요청 → submitted(차수 2) · 회수 → withdrawn → 다시 요청 → submitted(차수 3)", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const first = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    const rejected = await rejectDocument(lead, { instanceId: first.instanceId, expectedVersion: first.version, reason: "행사 주간" }, deps);
    expect(rejected.status).toBe("rejected");
    expect((await getLeave(drafter, leave.leaveId, deps))?.cancelState).toBe("none");
    expect(await annualUsed(drafter)).toBe(4);

    const again = await resubmitLeaveCancel(drafter, { leaveId: leave.leaveId, expectedVersion: rejected.version, reason: "다시 부탁" }, deps);
    expect(again).toMatchObject({ instanceId: first.instanceId, approverName: "김팀장" });
    expect(await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId)).toMatchObject({ status: "submitted", currentRound: 2 });

    const withdrawn = await withdrawDocument(drafter, { instanceId: first.instanceId, expectedVersion: again.version }, deps);
    expect(withdrawn.status).toBe("withdrawn");
    expect((await getLeave(drafter, leave.leaveId, deps))?.cancelState).toBe("none");
    const third = await resubmitLeaveCancel(drafter, { leaveId: leave.leaveId, expectedVersion: withdrawn.version, reason: "정말 취소" }, deps);
    expect(await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId)).toMatchObject({ status: "submitted", currentRound: 3, version: third.version });
    expect((await cancelSteps(first.instanceId)).map((step) => step.round)).toEqual([1, 2, 3]);
  });
});

describe("요청 거부(T-07.2-15-01)", () => {
  it("사유 빈 값 · 500자 넘음 → 사유 문구 · 인스턴스 0", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    expect((await refusal(requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "   " }, deps))).message).toBe("사유 없음 · 사유 적기");
    expect((await refusal(requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "가".repeat(501) }, deps))).message).toBe(
      "사유 500자 넘음 · 줄여 적기",
    );
    await expect(instanceOf(LEAVE_CANCEL_KIND, leave.leaveId)).rejects.toThrow();
  });

  it("남의 연차 · 결재 중 연차(회수 막힘 포함) · 이미 요청 중 · 이미 취소됨 → 거부", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const other = await makePerson("김민수", DEFAULT_ROLE_ID, "기획1팀");
    expect(await refusal(requestLeaveCancel(other, { leaveId: leave.leaveId, reason: "남의 것" }, deps))).toBeInstanceOf(NotCurrentHolderError);
    expect(await refusal(requestLeaveCancel(lead, { leaveId: leave.leaveId, reason: "팀장도 못 함" }, deps))).toBeInstanceOf(NotCurrentHolderError);

    // 팀장이 승인해 회수가 막힌 결재 중 연차(D-7256) — 요청 입구 0.
    const pending = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-28", half: "" }, deps);
    await approveDocument(lead, { instanceId: pending.instanceId, expectedVersion: 1 }, deps);
    expect((await refusal(requestLeaveCancel(drafter, { leaveId: pending.leaveId, reason: "결재 중" }, deps))).message).toBe(STALE);

    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    expect((await refusal(requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "또" }, deps))).message).toBe(STALE);
    await approveDocument(lead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps);
    expect((await refusal(requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "또" }, deps))).message).toBe(STALE);
  });

  it("지난 날짜 연차도 요청을 받는다(D-7255)", async () => {
    const { drafter, lead, ceo } = await world();
    const past = await approvedLeave(drafter, [lead, ceo], { kind: "full_day", startDate: "2026-09-14", endDate: "2026-09-14", half: "" });
    await expect(requestLeaveCancel(drafter, { leaveId: past.leaveId, reason: "지난 것 정정" }, deps)).resolves.toMatchObject({ approverName: "김팀장" });
  });
});

describe("최종 승인 재확인(T-07.2-15-03)", () => {
  it("승인 직전 원 연차 인스턴스가 approved가 아니게 바뀜 → 승인 전체 롤백 `이미 처리됨 · 새로 고침`", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    // 관리자 조정 흉내 — 원 연차 인스턴스 상태를 직접 바꾼다.
    await db.update(approvalInstances).set({ status: "withdrawn" }).where(eq(approvalInstances.id, leave.instanceId));
    expect((await refusal(approveDocument(lead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps))).message).toBe(STALE);
    expect(await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId)).toMatchObject({ status: "submitted", version: cancel.version });
  });
});

describe("결재자 — 대표 대체 · 기안자 = 팀장 · 팀장 빈 자리(D-7254 · 07.2 D-7310)", () => {
  it("대표 본인 연차 → 결재자 = 대표 본인 · 제출 직후 submitted(즉시 승인 0) → 본인 승인 1회 → 취소됨 · 잔고 복귀", async () => {
    const { lead } = await world();
    const ceo = await makePerson("정대표", CEO_ROLE_ID, null);
    const others = await makePerson("한대표", CEO_ROLE_ID, null);
    await db.update(users).set({ archivedAt: new Date("2026-06-01T00:00:00Z") }).where(eq(users.id, others.id));
    // 시드의 다른 대표 계정이 있으면 그 사람이 대체 결재자가 된다 — 이 시험의 대표만 남긴다.
    const ceos = await db.select({ id: users.id }).from(users).where(eq(users.roleId, CEO_ROLE_ID));
    for (const row of ceos) if (row.id !== ceo.id) await db.update(users).set({ archivedAt: new Date("2026-06-01T00:00:00Z") }).where(eq(users.id, row.id));

    const leave = await approvedLeave(ceo, [lead, ceo]);
    expect(await annualUsed(ceo)).toBe(4);
    expect(await previewLeaveCancel(ceo, leave.leaveId, deps)).toEqual({ approverName: "정대표" });
    const cancel = await requestLeaveCancel(ceo, { leaveId: leave.leaveId, reason: "출장" }, deps);
    expect(cancel.approverName).toBe("정대표");
    expect((await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId)).status).toBe("submitted");
    await expect(approveDocument(ceo, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps)).resolves.toMatchObject({
      status: "approved",
    });
    expect((await getLeave(ceo, leave.leaveId, deps))?.cancelState).toBe("cancelled");
    expect(await annualUsed(ceo)).toBe(0);
  });

  it("기안자가 팀장인 연차 → 결재자 = 원 결재선 다음 단계 보유자(본부 책임자) · 본인 0", async () => {
    const { lead, ceo } = await world();
    const head = await makePerson("이본부", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const leave = await approvedLeave(lead, [head, ceo]);
    const preview = await previewLeaveCancel(lead, leave.leaveId, deps);
    expect(preview).toEqual({ approverName: "이본부" });
    const cancel = await requestLeaveCancel(lead, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    expect(cancel.approverName).toBe("이본부");
    expect((await cancelSteps(cancel.instanceId)).map((step) => step.roleId)).toEqual([DIVISION_HEAD_ROLE_ID]);
    expect(await refusal(approveDocument(lead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps))).toBeInstanceOf(
      NotCurrentHolderError,
    );
    await expect(approveDocument(head, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps)).resolves.toMatchObject({
      status: "approved",
    });
  });

  it("(회귀 T-07.2-15-01) 원 결재선 팀장이 보관된 직원 연차 → 결재자 = 대표 · 기안자 본인 승인 0", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    await db.update(users).set({ archivedAt: new Date("2026-06-01T00:00:00Z") }).where(eq(users.id, lead.id));
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    expect(cancel.approverName).toBe("최대표");
    expect(await refusal(approveDocument(drafter, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps))).toBeInstanceOf(
      NotCurrentHolderError,
    );
    await expect(approveDocument(ceo, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps)).resolves.toMatchObject({
      status: "approved",
    });
  });

  it("미리보기(결과 줄 재료) = 제출 뒤 담당 · 남의 연차 미리보기는 거부", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const preview = await previewLeaveCancel(drafter, leave.leaveId, deps);
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    expect(preview.approverName).toBe(cancel.approverName);
    expect(await currentHolderNames(drafter, { kind: LEAVE_CANCEL_KIND, documentId: leave.leaveId })).toBe(preview.approverName);
    const other = await makePerson("김민수", DEFAULT_ROLE_ID, "기획1팀");
    expect(await refusal(previewLeaveCancel(other, leave.leaveId, deps))).toBeInstanceOf(NotCurrentHolderError);
  });

  it("팀장 승인과 기안자 회수가 겹치면 하나만 성공 · 다른 쪽은 사용자 문구로 거부", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    const results = await Promise.allSettled([
      approveDocument(lead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps),
      withdrawDocument(drafter, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((result) => result.status === "rejected");
    expect(lost?.status === "rejected" ? (lost.reason as Error).message : "").toMatch(/새로 고침/);
    const final = await instanceOf(LEAVE_CANCEL_KIND, leave.leaveId);
    expect(["approved", "withdrawn"]).toContain(final.status);
  });
});

describe("원 연차 문서 보임 — 취소 결재 참여자(Codex PR #335)", () => {
  it("원 연차 승인 뒤 팀장이 바뀌어도 지금 취소 결재 후보는 원 연차 문서를 본다 · 무관한 사람은 null", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    // 원 팀장 보관 · 새 팀장 발령 — 새 팀장은 원 연차 결재에 참여하지 않았다.
    await db.update(users).set({ archivedAt: new Date("2026-06-01T00:00:00Z") }).where(eq(users.id, lead.id));
    const newLead = await makePerson("오새팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    expect(await getLeave(newLead, leave.leaveId, deps)).toBeNull();
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    expect(cancel.approverName).toBe("오새팀장");
    expect((await getLeave(newLead, leave.leaveId, deps))?.id).toBe(leave.leaveId);
    // 처리한 뒤에도 본다(처리 기록).
    await approveDocument(newLead, { instanceId: cancel.instanceId, expectedVersion: cancel.version }, deps);
    expect((await getLeave(newLead, leave.leaveId, deps))?.cancelState).toBe("cancelled");
    const stranger = await makePerson("무관", DEFAULT_ROLE_ID, null);
    expect(await getLeave(stranger, leave.leaveId, deps)).toBeNull();
  });
});

describe("알림 문서 제목 — leave_cancel도 연차 행으로(게이트 지적 P3)", () => {
  it("결재 대기 알림 제목: 원 연차 `연차 MM-DD` · 취소 결재 `연차 취소 MM-DD`(대체 글자 「결재 문서」로 떨어지지 않는다)", async () => {
    const { drafter, lead, ceo } = await world();
    const leave = await approvedLeave(drafter, [lead, ceo]);
    const titles = await listDocumentTitles(SYSTEM_VIEWER, [
      { kind: "leave", id: leave.leaveId },
      { kind: LEAVE_CANCEL_KIND, id: leave.leaveId },
    ]);
    expect(titles.get(`leave:${leave.leaveId}`)).toBe("연차 09-21");
    expect(titles.get(`${LEAVE_CANCEL_KIND}:${leave.leaveId}`)).toBe("연차 취소 09-21");
  });
});
