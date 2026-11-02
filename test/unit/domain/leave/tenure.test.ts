import { describe, expect, it } from "vitest";
import { legalAnnualDays, legalTotalQuartersByHireDate } from "@/domain/leave/tenure";

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

// 07.2-04 PU14(D-7264) — 260907 leave.ts:3040-3058 입사일 기준 법정 합 = (첫 해 월차 min(만 개월, 11) + Σ 만 근속년 n의 법정 연차) × 4.
describe("legalTotalQuartersByHireDate — 퇴직 시점 법정 합(쿼터)", () => {
  it("입사 2023-03-02 · 퇴직 2026-06-30 → 11 + 15 + 15 + 16 = 57일", () => {
    expect(legalTotalQuartersByHireDate({ hireDate: "2023-03-02", resignationDate: "2026-06-30", baseDays: 15 })).toBe(57 * 4);
  });

  it("만 3년 하루 전(2026-03-01)은 만 2년 — 11 + 15 + 15 = 41일", () => {
    expect(legalTotalQuartersByHireDate({ hireDate: "2023-03-02", resignationDate: "2026-03-01", baseDays: 15 })).toBe(41 * 4);
  });

  it("만 3년 당일(2026-03-02)은 만 3년 — 57일", () => {
    expect(legalTotalQuartersByHireDate({ hireDate: "2023-03-02", resignationDate: "2026-03-02", baseDays: 15 })).toBe(57 * 4);
  });

  it("첫 해 월차는 만 개월 수 — 입사 2026-01-15 · 퇴직 2026-05-14 → 3개월 = 3일", () => {
    expect(legalTotalQuartersByHireDate({ hireDate: "2026-01-15", resignationDate: "2026-05-14", baseDays: 15 })).toBe(3 * 4);
  });

  it("퇴직이 입사보다 앞서도 음수가 되지 않는다", () => {
    expect(legalTotalQuartersByHireDate({ hireDate: "2026-05-14", resignationDate: "2026-01-15", baseDays: 15 })).toBe(0);
  });
});
