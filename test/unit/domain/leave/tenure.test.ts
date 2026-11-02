import { describe, expect, it } from "vitest";
import { legalAnnualDays } from "@/domain/leave/tenure";

// 07.2-04 PU8(D-7247 · D-7248 · D-7249) — 260907 020_functions.sql:2937-2952 leave_days_for 경계표.
// 근속년 = 회계연도 − 입사연도. 3년 미만 기본, 이상 max(기본, min(기본 + ((년−3) 정수나눗셈 2) + 1, 25)).

const at = (tenure: number, baseDays = 15) => legalAnnualDays({ baseDays, fiscalYear: 2000 + tenure, hireYear: 2000 });

describe("legalAnnualDays — 근속 가산 경계표", () => {
  it.each([
    [0, 15],
    [1, 15],
    [2, 15],
    [3, 16],
    [4, 16],
    [5, 17],
    [6, 17],
    [7, 18],
    [21, 25],
    [22, 25],
    [23, 25],
    [40, 25],
  ])("기본 15 · 근속 %i년 → %i일", (tenure, expected) => {
    expect(at(tenure)).toBe(expected);
  });

  it("기본이 상한 25보다 크면 깎지 않는다 — 기본 26 · 근속 10 → 26", () => {
    expect(at(10, 26)).toBe(26);
  });

  it("음수 근속(입사 전 연도)은 기본", () => {
    expect(legalAnnualDays({ baseDays: 15, fiscalYear: 1999, hireYear: 2000 })).toBe(15);
  });
});
