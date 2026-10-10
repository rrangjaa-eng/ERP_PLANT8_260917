import { describe, expect, it } from "vitest";
import { generateHolidayRules, INITIAL_MANUAL_HOLIDAYS, LunarTableRangeError } from "@/domain/holidays/rules";
import { leaveWeekdayRange, onStableSeoulDay } from "../../e2e/leave-dates";

// 04.1-02(Codex HIGH 06) · 06.3-01(D-6317): E2E가 만드는 연차 날짜는 실행하는 날이 1월 1일이든
// 12월 31일이든 그해 안의 영업일 범위다(주말 · 공휴일 제외) — 「그해 3월 첫 월요일 + 주 오프셋」.

// 서버 후보 생성과 같은 출처로 만든 그해 휴일 집합(법정 + 수동 행, 수동 날짜는 대체일 자리를 막는다).
function holidaysOf(year: number): Set<string> {
  const manual = INITIAL_MANUAL_HOLIDAYS.filter((holiday) => holiday.date.startsWith(`${year}-`)).map((holiday) => holiday.date);
  try {
    const rules = generateHolidayRules(year, { blockers: new Set(manual) }).map((holiday) => holiday.date);
    return new Set([...rules, ...manual].filter((date) => date.startsWith(`${year}-`)));
  } catch (error) {
    if (error instanceof LunarTableRangeError) return new Set(manual);
    throw error;
  }
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isBusinessDayOf(date: string): boolean {
  const day = weekdayOf(date);
  return day !== 0 && day !== 6 && !holidaysOf(Number(date.slice(0, 4))).has(date);
}

function businessDaysBetween(start: string, end: string): number {
  let count = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    if (isBusinessDayOf(new Date(t).toISOString().slice(0, 10))) count += 1;
  }
  return count;
}

describe("leaveWeekdayRange", () => {
  it("2026-01-01 기준 week 0 · 영업일 2일 → 2026-03-03 ~ 2026-03-04 (03-02 대체공휴일 건너뜀)", () => {
    expect(leaveWeekdayRange("2026-01-01", { week: 0, weekdays: 2 })).toEqual({
      startDate: "2026-03-03",
      endDate: "2026-03-04",
    });
  });

  it("2026-01-01 기준 week 12 · 영업일 1일 → 2026-05-26 (05-25 대체공휴일 건너뜀)", () => {
    expect(leaveWeekdayRange("2026-01-01", { week: 12, weekdays: 1 })).toEqual({
      startDate: "2026-05-26",
      endDate: "2026-05-26",
    });
  });

  it("2026-01-01 기준 week 13 · 영업일 3일 → 2026-06-01 ~ 2026-06-04 (06-03 선거일 건너뜀)", () => {
    expect(leaveWeekdayRange("2026-01-01", { week: 13, weekdays: 3 })).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-04",
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
  ])("기준일 %s · week %i · 영업일 %i일 — 시작은 그 주 월~금 안의 첫 영업일 · 같은 해 · 영업일 수 일치 · 끝은 영업일", (today, week, weekdays) => {
    const { startDate, endDate } = leaveWeekdayRange(today, { week, weekdays });
    expect(weekdayOf(startDate)).toBeGreaterThanOrEqual(1);
    expect(weekdayOf(startDate)).toBeLessThanOrEqual(5);
    expect(isBusinessDayOf(startDate)).toBe(true);
    expect(startDate.slice(0, 4)).toBe(today.slice(0, 4));
    expect(endDate.slice(0, 4)).toBe(today.slice(0, 4));
    expect(businessDaysBetween(startDate, endDate)).toBe(weekdays);
    expect(isBusinessDayOf(endDate)).toBe(true);
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

// 04.1-06(CX-R8): 날짜로 기대값을 만드는 E2E 사례는 서울 날짜가 사례 도중 바뀌어 실패하면 새 날짜로 한 번만
// 다시 돈다. 날짜 함수를 주입한다(벽시계 없음).
describe("onStableSeoulDay", () => {
  function clock(dates: string[]): { today: () => string; calls: () => number } {
    let index = 0;
    return {
      today: () => dates[Math.min(index++, dates.length - 1)] ?? "",
      calls: () => index,
    };
  }

  it("날짜가 그대로이고 body가 통과하면 d0로 한 번만 돈다", async () => {
    const seen: string[] = [];
    const result = await onStableSeoulDay(
      (day) => {
        seen.push(day);
        return Promise.resolve("ok");
      },
      { today: clock(["2026-09-29", "2026-09-29"]).today },
    );
    expect(result).toBe("ok");
    expect(seen).toEqual(["2026-09-29"]);
  });

  it("body가 실패하고 날짜가 그대로면 그 오류를 다시 던지고 한 번만 돈다", async () => {
    const seen: string[] = [];
    const failure = new Error("같은 날 실패");
    let caught: unknown = null;
    try {
      await onStableSeoulDay(
        (day) => {
          seen.push(day);
          return Promise.reject(failure);
        },
        { today: clock(["2026-09-29", "2026-09-29"]).today },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(seen).toEqual(["2026-09-29"]);
  });

  it("body가 실패하는 동안 날짜가 d1로 바뀌면 d1로 한 번 더 불러 그 결과를 돌려준다", async () => {
    const seen: string[] = [];
    const result = await onStableSeoulDay(
      (day) => {
        seen.push(day);
        return day === "2026-12-31" ? Promise.reject(new Error("자정을 넘김")) : Promise.resolve(day);
      },
      { today: clock(["2026-12-31", "2027-01-01", "2027-01-01"]).today },
    );
    expect(result).toBe("2027-01-01");
    expect(seen).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("둘째 실행도 실패하면 던지고 세 번 돌지 않는다", async () => {
    const seen: string[] = [];
    let caught: unknown = null;
    try {
      await onStableSeoulDay(
        (day) => {
          seen.push(day);
          return Promise.reject(new Error(`실패 ${day}`));
        },
        { today: clock(["2026-12-31", "2027-01-01", "2027-01-02"]).today },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("실패 2027-01-01");
    expect(seen).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("body가 통과했으면 날짜가 바뀌었어도 다시 돌지 않는다", async () => {
    const seen: string[] = [];
    const tick = clock(["2026-12-31", "2027-01-01"]);
    await onStableSeoulDay(
      (day) => {
        seen.push(day);
        return Promise.resolve();
      },
      { today: tick.today },
    );
    expect(seen).toEqual(["2026-12-31"]);
  });
});
