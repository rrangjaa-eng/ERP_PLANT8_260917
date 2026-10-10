import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import {
  countLeaveQuarters,
  formatLeaveDays,
  DEFAULT_HALF_PERIOD,
  LEAVE_KIND_EMPTY_ERROR,
  LEAVE_HALF_EMPTY_ERROR,
  leaveYearRange,
  MIN_LEAVE_YEAR,
} from "@/domain/leave/days";

// LEAV-01: 일수는 정수 1/4일(쿼터). 종일 = 기간 안 영업일 × 4, 반차 = 2, 반반차 = 1,
// 재택 = 0. 휴일 판정은 셋째 인자 — 없으면 주말만(06.3 D-6301 · D-6302).

function quarters(input: Parameters<typeof countLeaveQuarters>[0]): number {
  const result = countLeaveQuarters(input);
  if (!result.ok) throw new Error(`거부됨: ${JSON.stringify(result.errors)}`);
  return result.quarters;
}

function errors(input: Parameters<typeof countLeaveQuarters>[0]) {
  const result = countLeaveQuarters(input);
  if (result.ok) throw new Error("거부되어야 한다");
  return result.errors;
}

describe("countLeaveQuarters — 단위", () => {
  it("종일 월~수(2026-09-21~23)는 12쿼터", () => {
    expect(quarters({ kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" })).toBe(12);
  });

  it("종일 금~월(2026-09-25~28)은 주말을 빼 8쿼터", () => {
    expect(quarters({ kind: "full_day", startDate: "2026-09-25", endDate: "2026-09-28", half: "" })).toBe(8);
  });

  it("종일 토~일만(2026-09-26~27)은 거부", () => {
    expect(errors({ kind: "full_day", startDate: "2026-09-26", endDate: "2026-09-27", half: "" })).toEqual([
      { field: "startDate", message: "휴일만 고른 기간 · 평일 넣기" },
    ]);
  });

  it("반차 = 2 · 반반차 = 1 · 재택 3일 = 0", () => {
    expect(quarters({ kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "am" })).toBe(2);
    expect(quarters({ kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "pm" })).toBe(1);
    expect(quarters({ kind: "remote", startDate: "2026-09-21", endDate: "2026-09-23", half: "" })).toBe(0);
  });

  it("0.25 + 0.25 + 0.5 = 정확히 1일(4쿼터)", () => {
    const sum =
      quarters({ kind: "quarter_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "am" }) +
      quarters({ kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "am" }) +
      quarters({ kind: "half_day", startDate: "2026-09-23", endDate: "2026-09-23", half: "pm" });
    expect(sum).toBe(4);
    expect(formatLeaveDays(sum)).toBe("1일");
  });

  it("12-30~01-02는 회계연도를 넘어 거부", () => {
    expect(errors({ kind: "full_day", startDate: "2026-12-30", endDate: "2027-01-02", half: "" })).toEqual([
      { field: "endDate", message: "기간이 회계연도를 넘음 · 12-31과 01-01로 나눠 신청" },
    ]);
  });

  it("종료일 < 시작일은 거부", () => {
    expect(errors({ kind: "full_day", startDate: "2026-09-23", endDate: "2026-09-21", half: "" })).toEqual([
      { field: "endDate", message: "종료일이 시작일보다 빠름 · 종료일 고치기" },
    ]);
  });

  it("반차에 오전/오후가 없으면 칸 half 오류", () => {
    expect(errors({ kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "" })).toEqual([
      { field: "half", message: LEAVE_HALF_EMPTY_ERROR },
    ]);
  });

  it("반반차 시간이 목록 밖(`x`)이면 칸 half 오류", () => {
    expect(errors({ kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "x" })).toEqual([
      { field: "half", message: LEAVE_HALF_EMPTY_ERROR },
    ]);
  });

  it("반차에 시간이 목록 밖(`x`)이면 칸 half 오류", () => {
    expect(errors({ kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "x" })).toEqual([
      { field: "half", message: LEAVE_HALF_EMPTY_ERROR },
    ]);
  });

  it("반차는 하루뿐 — 종료일이 다르면 거부", () => {
    expect(errors({ kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-23", half: "am" })).toEqual([
      { field: "endDate", message: "반차·반반차는 하루뿐 · 날짜 하나만 적기" },
    ]);
  });

  it("종류가 빈 문자열이거나 네 종류 밖이면 칸 kind 오류", () => {
    expect(errors({ kind: "", startDate: "2026-09-22", endDate: "2026-09-22", half: "" })).toEqual([
      { field: "kind", message: LEAVE_KIND_EMPTY_ERROR },
    ]);
    expect(errors({ kind: "sick", startDate: "2026-09-22", endDate: "2026-09-22", half: "" })).toEqual([
      { field: "kind", message: LEAVE_KIND_EMPTY_ERROR },
    ]);
  });

  it("종일 + half: pm은 거부 없이 검증된 half가 null", () => {
    const result = countLeaveQuarters({ kind: "full_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "pm" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.half).toBeNull();
      expect(result.kind).toBe("full_day");
      expect(result.fiscalYear).toBe(2026);
    }
  });

  it("두 문구 상수는 UI-SPEC 원문과 글자가 같고, 시간 처음 값은 오전(am)", () => {
    expect(LEAVE_KIND_EMPTY_ERROR).toBe("종류 비어 있음 · 종류 고르기");
    expect(LEAVE_HALF_EMPTY_ERROR).toBe("시간 비어 있음 · 시간 고르기");
    expect(DEFAULT_HALF_PERIOD).toBe("am");
  });
});

// /review(red-team): 서버에 연도 끝이 없으면 9999년 신청이 저장돼 `/leave` 연도 선택지가 수천 개가 되고, 1999년
// 신청은 목록 연도 해석(2000 미만 거부)에서 빠져 URL로만 닿는다. 서버 입구는 [2000, 올해 + 1]만 받는다.
describe("countLeaveQuarters — 연도 범위", () => {
  const range = leaveYearRange("2026-09-29");

  it("범위는 [MIN_LEAVE_YEAR(2000), 올해 + 1]", () => {
    expect(MIN_LEAVE_YEAR).toBe(2000);
    expect(range).toEqual({ minYear: 2000, maxYear: 2027 });
  });

  it("범위 밖 시작일(9999 · 1999)은 시작일 칸 오류, 범위 안(2027 · 2000)은 통과", () => {
    const message = "연도 범위 밖 · 2000~2027년 날짜 고르기";
    expect(countLeaveQuarters({ kind: "full_day", startDate: "9999-01-04", endDate: "9999-01-04", half: "" }, range)).toEqual({
      ok: false,
      errors: [{ field: "startDate", message }],
    });
    expect(countLeaveQuarters({ kind: "half_day", startDate: "1999-03-02", endDate: "", half: "am" }, range)).toEqual({
      ok: false,
      errors: [{ field: "startDate", message }],
    });
    expect(countLeaveQuarters({ kind: "full_day", startDate: "2027-01-04", endDate: "2027-01-04", half: "" }, range).ok).toBe(true);
    expect(countLeaveQuarters({ kind: "full_day", startDate: "2000-01-03", endDate: "2000-01-03", half: "" }, range).ok).toBe(true);
  });

  it("범위를 넘기지 않으면(화면 계산) 연도를 막지 않는다", () => {
    expect(countLeaveQuarters({ kind: "full_day", startDate: "9999-01-04", endDate: "9999-01-04", half: "" }).ok).toBe(true);
  });
});

// 06.3(D-6301 · D-6304): 2026 공휴일 집합 — 설 · 삼일절 대체 · 어린이날 · 부처님오신날 대체 · 선거일 · 현충일 · 추석 · 개천절 · 한글날 …
const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-01", "2026-05-05",
  "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17", "2026-09-24",
  "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
]);
const lookup2026: HolidayLookup = () => HOLIDAYS_2026;

function withHolidays(input: Parameters<typeof countLeaveQuarters>[0]) {
  return countLeaveQuarters(input, undefined, lookup2026);
}

describe("countLeaveQuarters — 휴일 판정 인자(06.3 D-6301 · D-6304)", () => {
  it("종일 2026-09-23~28은 추석 연휴(09-24~26)와 주말을 빼 영업일 2일 = 8쿼터", () => {
    const result = withHolidays({ kind: "full_day", startDate: "2026-09-23", endDate: "2026-09-28", half: "" });
    expect(result.ok && result.quarters).toBe(8);
  });

  it("종일 2026-09-25~28은 영업일 1일(28일) = 4쿼터", () => {
    const result = withHolidays({ kind: "full_day", startDate: "2026-09-25", endDate: "2026-09-28", half: "" });
    expect(result.ok && result.quarters).toBe(4);
  });

  it("반차 추석 당일 · 반반차 선거일 · 재택 대체공휴일 하루는 `휴일 · 다른 날 고르기`", () => {
    const expected = [{ field: "startDate", message: "휴일 · 다른 날 고르기" }];
    const half = withHolidays({ kind: "half_day", startDate: "2026-09-25", endDate: "2026-09-25", half: "am" });
    const quarter = withHolidays({ kind: "quarter_day", startDate: "2026-06-03", endDate: "2026-06-03", half: "pm" });
    const remote = withHolidays({ kind: "remote", startDate: "2026-10-05", endDate: "2026-10-05", half: "" });
    expect(half).toEqual({ ok: false, errors: expected });
    expect(quarter).toEqual({ ok: false, errors: expected });
    expect(remote).toEqual({ ok: false, errors: expected });
  });

  it("종일 기간 전체가 휴일(추석 낀 09-24~27 · 개천절 연휴 10-03~05)이면 `휴일만 고른 기간 · 평일 넣기`", () => {
    const expected = [{ field: "startDate", message: "휴일만 고른 기간 · 평일 넣기" }];
    expect(withHolidays({ kind: "full_day", startDate: "2026-09-24", endDate: "2026-09-27", half: "" })).toEqual({ ok: false, errors: expected });
    expect(withHolidays({ kind: "full_day", startDate: "2026-10-03", endDate: "2026-10-05", half: "" })).toEqual({ ok: false, errors: expected });
  });

  it("재택 2026-10-02~05(금 하루만 영업일)은 통과하고 0쿼터", () => {
    const result = withHolidays({ kind: "remote", startDate: "2026-10-02", endDate: "2026-10-05", half: "" });
    expect(result.ok && result.quarters).toBe(0);
  });

  it("휴일 인자가 없으면 주말만 뺀다 — 09-25~28은 8쿼터 · 토~일은 휴일만 기간 · 반차 토요일은 휴일 하루", () => {
    expect(quarters({ kind: "full_day", startDate: "2026-09-25", endDate: "2026-09-28", half: "" })).toBe(8);
    expect(errors({ kind: "full_day", startDate: "2026-09-19", endDate: "2026-09-20", half: "" })).toEqual([
      { field: "startDate", message: "휴일만 고른 기간 · 평일 넣기" },
    ]);
    expect(errors({ kind: "half_day", startDate: "2026-09-19", endDate: "2026-09-19", half: "am" })).toEqual([
      { field: "startDate", message: "휴일 · 다른 날 고르기" },
    ]);
  });
});

describe("formatLeaveDays", () => {
  it("12 → 3일 · 2 → 0.5일 · 1 → 0.25일", () => {
    expect(formatLeaveDays(12)).toBe("3일");
    expect(formatLeaveDays(2)).toBe("0.5일");
    expect(formatLeaveDays(1)).toBe("0.25일");
  });
});
