import { describe, expect, it, vi } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { LunarTableRangeError } from "@/domain/holidays/rules";
import { loadLeaveHolidays } from "@/domain/leave/guard";

// 모듈 적재가 DB 클라이언트에 닿지 않게 달력 로더만 막는다 — 로더는 deps 가짜로 주입한다.
vi.mock("@/domain/holidays/calendar", () => ({ loadHolidayLookup: () => Promise.reject(new Error("실제 로더 호출 금지")) }));

// 06.3-01 D-6306(확정 · 카드 2026-10-10): 음력 표(2025~2035) 밖 해는 주말만 — DB(달력 잠금 트랜잭션)를 열지 않는다.
const RANGE = { minYear: 2000, maxYear: 2027 };

function spyLoader(lookup: HolidayLookup, error?: Error) {
  const calls: number[][] = [];
  const loader = (years: number[]) => {
    calls.push(years);
    return error ? Promise.reject(error) : Promise.resolve(lookup);
  };
  return { calls, loader };
}

const HOLIDAYS_2026: HolidayLookup = () => new Set(["2026-09-25"]);

describe("loadLeaveHolidays — 06.3 D-6306", () => {
  it("음력 표 밖 해(2023-05-01)는 로더를 부르지 않고 빈 집합이다", async () => {
    const { calls, loader } = spyLoader(HOLIDAYS_2026);
    const lookup = await loadLeaveHolidays("2023-05-01", RANGE, { loadHolidayLookup: loader });
    expect(calls).toHaveLength(0);
    expect(lookup(2023).size).toBe(0);
  });

  it("표 안 해(2026-09-23)는 로더를 [2026]으로 한 번 부르고 그 조회를 그대로 돌려준다", async () => {
    const { calls, loader } = spyLoader(HOLIDAYS_2026);
    const lookup = await loadLeaveHolidays("2026-09-23", RANGE, { loadHolidayLookup: loader });
    expect(calls).toEqual([[2026]]);
    expect(lookup).toBe(HOLIDAYS_2026);
  });

  it("로더가 LunarTableRangeError(2036)를 던지면(2035 끝자락) 빈 집합이다", async () => {
    const { loader } = spyLoader(HOLIDAYS_2026, new LunarTableRangeError(2036));
    const lookup = await loadLeaveHolidays("2026-09-23", RANGE, { loadHolidayLookup: loader });
    expect(lookup(2026).size).toBe(0);
  });

  it("로더가 일반 Error를 던지면 그대로 다시 던진다", async () => {
    const { loader } = spyLoader(HOLIDAYS_2026, new Error("DB 끊김"));
    await expect(loadLeaveHolidays("2026-09-23", RANGE, { loadHolidayLookup: loader })).rejects.toThrow("DB 끊김");
  });

  it("범위 밖(9999-01-04) · 빈 값 · 형식 오류(2026/09/23)는 로더를 부르지 않고 빈 집합이다", async () => {
    const { calls, loader } = spyLoader(HOLIDAYS_2026);
    for (const startDate of ["9999-01-04", "", "2026/09/23"]) {
      const lookup = await loadLeaveHolidays(startDate, RANGE, { loadHolidayLookup: loader });
      expect(lookup(Number(startDate.slice(0, 4))).size).toBe(0);
    }
    expect(calls).toHaveLength(0);
  });
});
