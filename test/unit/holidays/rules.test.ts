import { describe, expect, it } from "vitest";
import { generateHolidayRules, LunarTableRangeError } from "@/domain/holidays/rules";

// 04.2-02 Task 1(트레이서) — 규정 제2조 법정 공휴일과 제3조 (가) 토·일 대체까지.
// 노동절·제헌절(A1-b)에 기대지 않는 날짜만 단언한다. 전체 목록 대조는 Task 3.
describe("generateHolidayRules", () => {
  it("2026년 결과에 설·추석 연휴 사흘과 3·1절 대체공휴일(03-02)이 있다", () => {
    const rows = generateHolidayRules(2026);
    const dates = rows.map((row) => row.date);

    for (const date of ["2026-02-16", "2026-02-17", "2026-02-18", "2026-09-24", "2026-09-25", "2026-09-26"]) {
      expect(dates).toContain(date);
    }
    expect(rows.find((row) => row.date === "2026-03-02")).toEqual({
      date: "2026-03-02",
      name: "3·1절",
      kind: "substitute",
    });
    expect(dates).toEqual([...dates].sort());
  });

  it("음력 표에 없는 해는 빈 목록 대신 LunarTableRangeError를 던진다", () => {
    expect(() => generateHolidayRules(2036)).toThrow(LunarTableRangeError);
    expect(() => generateHolidayRules(2036)).toThrow(
      "2036년 후보를 만들지 못했습니다 · 음력 표에 없는 해 · 음력 표 갱신 필요",
    );
  });
});
