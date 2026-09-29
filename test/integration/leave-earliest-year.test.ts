import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { myLeaveYearRange, submitLeave } from "@/domain/leave";
import { findLeaveFiscalYearRange } from "@/repositories/leave-requests";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// 04.1-06(C-04 · C-P1 · 사용자 결정 2026-09-29): `/leave` 연도 select 옵션의 끝 = 내 신청의 가장 이른 · 가장 늦은
// 회계연도(위 끝은 max(올해, 가장 늦은 연도) — 연말에 낸 다음 해 신청이 목록에 보이게). 도메인 읽기는 viewer 본인
// 신청만 세고, 리포지토리 min · max(fiscal_year) 쿼리 한 번이다(해마다 조회하지 않는다).

const deps = { now: NOW_2026 };

function fullDay(startDate: string, endDate: string) {
  return { kind: "full_day", startDate, endDate, half: "" };
}

describe("myLeaveYearRange(C-04)", () => {
  it("신청이 없는 사용자는 null이다", async () => {
    const viewer = await makePerson("신청없음", DEFAULT_ROLE_ID, "기획1팀");
    expect(await myLeaveYearRange(viewer)).toBeNull();
  });

  it("본인 신청이 세 회계연도에 있으면 이른 쪽 · 늦은 쪽이고, 다른 사용자의 신청은 세지 않으며, 조회는 한 번이다", async () => {
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const drafter = await makePerson("두해기안", DEFAULT_ROLE_ID, "기획1팀");
    const other = await makePerson("다른기안", DEFAULT_ROLE_ID, "기획1팀");
    await submitLeave(drafter, fullDay("2026-09-21", "2026-09-22"), deps);
    await submitLeave(drafter, fullDay("2025-11-03", "2025-11-04"), deps);
    await submitLeave(drafter, fullDay("2027-01-05", "2027-01-06"), deps);
    await submitLeave(other, fullDay("2023-05-01", "2023-05-02"), deps);
    await submitLeave(other, fullDay("2028-01-04", "2028-01-05"), deps);

    let calls = 0;
    const counted: typeof findLeaveFiscalYearRange = (...args) => {
      calls += 1;
      return findLeaveFiscalYearRange(...args);
    };
    expect(await myLeaveYearRange(drafter, { findLeaveFiscalYearRange: counted })).toEqual({ earliest: 2025, latest: 2027 });
    expect(calls).toBe(1);
    expect(await myLeaveYearRange(other)).toEqual({ earliest: 2023, latest: 2028 });
  });
});
