import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { earliestMyLeaveYear, submitLeave } from "@/domain/leave";
import { findEarliestLeaveFiscalYear } from "@/repositories/leave-requests";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// 04.1-06(C-04 · C-P1): `/leave` 연도 select 옵션의 아래 끝 = 내 신청의 가장 이른 회계연도. 도메인 읽기는
// viewer 본인 신청만 세고, 리포지토리 min(fiscal_year) 쿼리 한 번이다(해마다 조회하지 않는다).

const deps = { now: NOW_2026 };

function fullDay(startDate: string, endDate: string) {
  return { kind: "full_day", startDate, endDate, half: "" };
}

describe("earliestMyLeaveYear(C-04)", () => {
  it("신청이 없는 사용자는 null이다", async () => {
    const viewer = await makePerson("신청없음", DEFAULT_ROLE_ID, "기획1팀");
    expect(await earliestMyLeaveYear(viewer)).toBeNull();
  });

  it("본인 신청이 두 회계연도에 있으면 이른 쪽이고, 다른 사용자의 더 이른 신청은 세지 않으며, 조회는 한 번이다", async () => {
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const drafter = await makePerson("두해기안", DEFAULT_ROLE_ID, "기획1팀");
    const other = await makePerson("다른기안", DEFAULT_ROLE_ID, "기획1팀");
    await submitLeave(drafter, fullDay("2026-09-21", "2026-09-22"), deps);
    await submitLeave(drafter, fullDay("2025-11-03", "2025-11-04"), deps);
    await submitLeave(other, fullDay("2023-05-01", "2023-05-02"), deps);

    let calls = 0;
    const counted: typeof findEarliestLeaveFiscalYear = (...args) => {
      calls += 1;
      return findEarliestLeaveFiscalYear(...args);
    };
    expect(await earliestMyLeaveYear(drafter, { findEarliestLeaveFiscalYear: counted })).toBe(2025);
    expect(calls).toBe(1);
    expect(await earliestMyLeaveYear(other)).toBe(2023);
  });
});
