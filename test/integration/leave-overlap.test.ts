import { describe, expect, it } from "vitest";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { submitLeave, LeaveValidationError, type SubmitLeaveInput } from "@/domain/leave";
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
