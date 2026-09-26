import { describe, expect, it } from "vitest";
import {
  countLeaveQuarters,
  formatLeaveDays,
  DEFAULT_HALF_PERIOD,
  LEAVE_KIND_EMPTY_ERROR,
  LEAVE_HALF_EMPTY_ERROR,
} from "@/domain/leave/days";

// LEAV-01: 일수는 정수 1/4일(쿼터). 종일 = 평일 수 × 4, 반차 = 2, 반반차 = 1,
// 재택 = 0. 공휴일은 빼지 않는다(UI-SPEC Assumptions #4).

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
      { field: "startDate", message: "주말만 고른 기간입니다 · 평일을 넣어 주세요" },
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
      { field: "endDate", message: "종료일이 시작일보다 빠릅니다 · 종료일을 고쳐 주세요" },
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

describe("formatLeaveDays", () => {
  it("12 → 3일 · 2 → 0.5일 · 1 → 0.25일", () => {
    expect(formatLeaveDays(12)).toBe("3일");
    expect(formatLeaveDays(2)).toBe("0.5일");
    expect(formatLeaveDays(1)).toBe("0.25일");
  });
});
