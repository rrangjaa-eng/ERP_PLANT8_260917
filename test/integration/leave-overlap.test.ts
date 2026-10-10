import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, leaveRequests } from "@/db/schema";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { submitLeave, LeaveValidationError, type SubmitLeaveInput } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// 06.3-02(D-6307 ~ D-6311): 같은 기안자의 결재 중 · 승인 연차와 영업일이 겹치는 신청은 시작일 칸 한 줄로 막힌다 —
// 서비스 직접 호출. 회수 · 반려 · 반차 오전 + 오후 · 휴일 접촉 · 다른 기안자는 통과.

const deps = { now: NOW_2026 };
const FULL_21_23: SubmitLeaveInput = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
const HALF_22_AM: SubmitLeaveInput = { kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "am" };
const HALF_22_PM: SubmitLeaveInput = { kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "pm" };
const OVERLAP_22_FULL = [{ field: "startDate", message: "9월 22일 종일 신청과 겹침 · 날짜 바꾸기" }];

async function world() {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

async function counts() {
  return { leave: await countRows("leave_requests"), instances: await countRows("approval_instances") };
}

async function refusal(promise: Promise<unknown>): Promise<LeaveValidationError> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LeaveValidationError);
  return error as LeaveValidationError;
}

describe("제출 겹침(06.3 D-6307~D-6309)", () => {
  it("결재 중 종일 09-21~23 뒤 반차 09-22 오전 → 시작일 칸 `9월 22일 종일 신청과 겹침 · 날짜 바꾸기` · 행 수 그대로", async () => {
    const { drafter } = await world();
    await submitLeave(drafter, FULL_21_23, deps);
    const before = await counts();
    const error = await refusal(submitLeave(drafter, HALF_22_AM, deps));
    expect(error.fieldErrors).toEqual(OVERLAP_22_FULL);
    expect(await counts()).toEqual(before);
  });

  it("첫 신청을 최종 승인한 뒤에도 같은 거절 · 회수하거나 반려한 뒤에는 같은 날 제출 성공", async () => {
    const { drafter, lead, ceo } = await world();
    const approved = await submitLeave(drafter, FULL_21_23, deps);
    await approveDocument(lead, { instanceId: approved.instanceId, expectedVersion: 1 }, deps);
    await approveDocument(ceo, { instanceId: approved.instanceId, expectedVersion: 2 }, deps);
    expect((await refusal(submitLeave(drafter, HALF_22_AM, deps))).fieldErrors).toEqual(OVERLAP_22_FULL);

    const other = await makePerson("김민수", DEFAULT_ROLE_ID, "기획1팀");
    const withdrawn = await submitLeave(other, FULL_21_23, deps);
    await withdrawDocument(other, { instanceId: withdrawn.instanceId, expectedVersion: 1 }, deps);
    await expect(submitLeave(other, HALF_22_AM, deps)).resolves.toMatchObject({ version: 1 });

    const third = await makePerson("이지은", DEFAULT_ROLE_ID, "기획1팀");
    const rejected = await submitLeave(third, FULL_21_23, deps);
    await rejectDocument(lead, { instanceId: rejected.instanceId, expectedVersion: 1, reason: "일정 겹침" }, deps);
    await expect(submitLeave(third, HALF_22_AM, deps)).resolves.toMatchObject({ version: 1 });
  });

  it("반차 오전 뒤 같은 날 반차 오후 → 성공 · 반반차 오전 뒤 반반차 오후 → 거절 · 다른 기안자의 같은 날 → 성공", async () => {
    const { drafter } = await world();
    await submitLeave(drafter, HALF_22_AM, deps);
    await expect(submitLeave(drafter, HALF_22_PM, deps)).resolves.toMatchObject({ version: 1 });

    const quarterAm: SubmitLeaveInput = { kind: "quarter_day", startDate: "2026-09-29", endDate: "2026-09-29", half: "am" };
    const quarterPm: SubmitLeaveInput = { ...quarterAm, half: "pm" };
    await submitLeave(drafter, quarterAm, deps);
    expect((await refusal(submitLeave(drafter, quarterPm, deps))).fieldErrors).toEqual([
      { field: "startDate", message: "9월 29일 반반차 신청과 겹침 · 날짜 바꾸기" },
    ]);

    const other = await makePerson("김민수", DEFAULT_ROLE_ID, "기획1팀");
    await expect(submitLeave(other, HALF_22_AM, deps)).resolves.toMatchObject({ version: 1 });
  });

  it("살아 있는 종일 10-02~05 뒤 종일 10-05~06 → 성공(휴일에서만 맞닿음)", async () => {
    const { drafter } = await world();
    await submitLeave(drafter, { kind: "full_day", startDate: "2026-10-02", endDate: "2026-10-05", half: "" }, deps);
    await expect(
      submitLeave(drafter, { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-06", half: "" }, deps),
    ).resolves.toMatchObject({ version: 1 });
  });
});

async function rejectedLeave(drafter: Awaited<ReturnType<typeof world>>["drafter"], lead: Awaited<ReturnType<typeof world>>["lead"]) {
  const doc = await submitLeave(drafter, FULL_21_23, deps);
  const rejected = await rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, deps);
  return { ...doc, version: rejected.version };
}

async function snapshot(instanceId: string, leaveId: string) {
  const [instance] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  const routes = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId));
  const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId));
  return {
    status: instance?.status,
    version: instance?.version,
    routes: routes.length,
    leave: [leave?.kind, leave?.startDate, leave?.endDate, leave?.half, leave?.daysQuarters],
    log: await countRows("action_log"),
  };
}

describe("다시 신청 겹침(D-6310)", () => {
  it("반려된 A를 결재 중 B(09-28~30)와 겹치는 09-29로 다시 신청 → `9월 29일 종일 신청과 겹침` · A의 상태 · version · 차수 · 날짜 칸 그대로", async () => {
    const { drafter, lead } = await world();
    const a = await rejectedLeave(drafter, lead);
    await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-30", half: "" }, deps);
    const before = await snapshot(a.instanceId, a.leaveId);
    expect(before).toMatchObject({ status: "rejected", routes: 1 });

    const input: SubmitLeaveInput = { kind: "full_day", startDate: "2026-09-29", endDate: "2026-09-29", half: "" };
    const error = await refusal(resubmitLeave(drafter, { leaveId: a.leaveId, expectedVersion: a.version, input }, deps));
    expect(error.fieldErrors).toEqual([{ field: "startDate", message: "9월 29일 종일 신청과 겹침 · 날짜 바꾸기" }]);
    expect(await snapshot(a.instanceId, a.leaveId)).toEqual(before);
  });

  it("반려된 A를 자기 옛 날짜 그대로 다시 신청 → 성공(자기 행 제외)", async () => {
    const { drafter, lead } = await world();
    const a = await rejectedLeave(drafter, lead);
    const result = await resubmitLeave(drafter, { leaveId: a.leaveId, expectedVersion: a.version, input: FULL_21_23 }, deps);
    expect(result.round).toBe(2);
  });

  it("반려된 A를 회수된 C와 같은 날로 다시 신청 → 성공", async () => {
    const { drafter, lead } = await world();
    const a = await rejectedLeave(drafter, lead);
    const sameDay: SubmitLeaveInput = { kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", half: "" };
    const c = await submitLeave(drafter, sameDay, deps);
    await withdrawDocument(drafter, { instanceId: c.instanceId, expectedVersion: 1 }, deps);
    const result = await resubmitLeave(drafter, { leaveId: a.leaveId, expectedVersion: a.version, input: sameDay }, deps);
    expect(result.round).toBe(2);
  });
});

// 기안자 키(hashtextextended('leave:' || id, 0))의 advisory 미획득 대기 — bigint 키는 상위 32비트가 classid,
// 하위 32비트가 objid(objsubid = 1)로 보인다. 다른 advisory 잠금(달력 420_601 등)은 세지 않는다.
async function waitingOn(drafterId: string): Promise<number> {
  const key = sql`hashtextextended(${"leave:" + drafterId}, 0)`;
  const result = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from pg_locks
    where locktype = 'advisory' and not granted and objsubid = 1
      and classid::bigint = ((${key}) >> 32) & 4294967295
      and objid::bigint = (${key}) & 4294967295`);
  return Number(result.rows[0]?.n ?? 0);
}

describe("동시 제출(D-6311)", () => {
  it("기안자 잠금을 쥔 동안 같은 입력 두 제출이 그 키에서 둘 다 기다리고, 풀면 하나만 성공 · 하나는 겹침", async () => {
    const { drafter } = await world();
    // 두 제출이 트랜잭션 밖 휴일 조회에서 달력 잠금을 두고 다투지 않게 그 해 후보를 먼저 만든다.
    await loadHolidayLookup([2026]);
    const before = await countRows("leave_requests");

    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let held: () => void = () => {};
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"leave:" + drafter.id}, 0))`);
      held();
      await gate;
    });
    await holding;

    const both = Promise.allSettled([submitLeave(drafter, HALF_22_AM, deps), submitLeave(drafter, HALF_22_AM, deps)]);
    let waiting = 0;
    for (let tries = 0; tries < 60 && waiting < 2; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = await waitingOn(drafter.id);
    }
    open();
    await holder;
    const results = await both;

    expect(waiting).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toBeInstanceOf(LeaveValidationError);
    expect(loser?.status === "rejected" ? (loser.reason as LeaveValidationError).fieldErrors : null).toEqual([
      { field: "startDate", message: "9월 22일 반차 신청과 겹침 · 날짜 바꾸기" },
    ]);
    expect(await countRows("leave_requests")).toBe(before + 1);
  });

  it("기안자 잠금을 쥔 동안 반려된 A의 다시 신청과 같은 날 새 제출이 그 키에서 둘 다 기다리고, 풀면 하나만 성공 · 하나는 겹침", async () => {
    const { drafter, lead } = await world();
    const a = await rejectedLeave(drafter, lead);
    await loadHolidayLookup([2026]);

    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let held: () => void = () => {};
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"leave:" + drafter.id}, 0))`);
      held();
      await gate;
    });
    await holding;

    const both = Promise.allSettled([
      resubmitLeave(drafter, { leaveId: a.leaveId, expectedVersion: a.version, input: FULL_21_23 }, deps),
      submitLeave(drafter, HALF_22_AM, deps),
    ]);
    let waiting = 0;
    for (let tries = 0; tries < 60 && waiting < 2; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = await waitingOn(drafter.id);
    }
    open();
    await holder;
    const results = await both;

    expect(waiting).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toBeInstanceOf(LeaveValidationError);
    const fieldErrors = loser?.status === "rejected" ? (loser.reason as LeaveValidationError).fieldErrors : [];
    expect(fieldErrors.map((fieldError) => fieldError.field)).toEqual(["startDate"]);
    expect(fieldErrors[0]?.message).toMatch(/^9월 22일 (종일|반차) 신청과 겹침 · 날짜 바꾸기$/);
  });

  it("스모크 — 잠금 없이 같은 입력 두 제출을 동시에: 성공 1 · 겹침 거절 1", async () => {
    const { drafter } = await world();
    const results = await Promise.allSettled([submitLeave(drafter, FULL_21_23, deps), submitLeave(drafter, FULL_21_23, deps)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toBeInstanceOf(LeaveValidationError);
  });
});
