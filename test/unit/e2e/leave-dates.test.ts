import { describe, expect, it } from "vitest";
import { leaveWeekdayRange } from "../../e2e/leave-dates";

// 04.1-02(Codex HIGH 06): E2E가 만드는 연차 날짜는 실행하는 날이 1월 1일이든
// 12월 31일이든 그해 안의 평일 범위다 — 「그해 3월 첫 월요일 + 주 오프셋」.

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function weekdaysBetween(start: string, end: string): number {
  let count = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

describe("leaveWeekdayRange", () => {
  it("2026-01-01 기준 week 0 · 평일 2일 → 2026-03-02 ~ 2026-03-03", () => {
    expect(leaveWeekdayRange("2026-01-01", { week: 0, weekdays: 2 })).toEqual({
      startDate: "2026-03-02",
      endDate: "2026-03-03",
    });
  });

  it("윤년 2028-02-29 기준 시작은 3월 첫 월요일 2028-03-06", () => {
    expect(leaveWeekdayRange("2028-02-29", { week: 0, weekdays: 1 }).startDate).toBe("2028-03-06");
  });

  it.each([
    ["2026-01-01", 0, 2],
    ["2026-06-30", 3, 5],
    ["2026-12-31", 30, 20],
    ["2028-02-29", 12, 7],
  ])("기준일 %s · week %i · 평일 %i일 — 월요일 시작 · 같은 해 · 평일 수 일치", (today, week, weekdays) => {
    const { startDate, endDate } = leaveWeekdayRange(today, { week, weekdays });
    expect(weekdayOf(startDate)).toBe(1);
    expect(startDate.slice(0, 4)).toBe(today.slice(0, 4));
    expect(endDate.slice(0, 4)).toBe(today.slice(0, 4));
    expect(weekdaysBetween(startDate, endDate)).toBe(weekdays);
    expect([0, 6]).not.toContain(weekdayOf(endDate));
  });

  it.each([
    [{ week: -1, weekdays: 1 }],
    [{ week: 31, weekdays: 1 }],
    [{ week: 0, weekdays: 0 }],
    [{ week: 0, weekdays: 21 }],
    [{ week: 1.5, weekdays: 1 }],
  ])("범위 밖 인자 %o는 예외", (options) => {
    expect(() => leaveWeekdayRange("2026-09-26", options)).toThrow();
  });
});
