import { describe, expect, it } from "vitest";
import {
  annualGrantQuarters,
  buildLeaveGrants,
  formatBalanceLines,
  formatBalanceRow,
  resignationBalanceOf,
} from "@/domain/leave/balance";
import { approved, pending, runBalance, runRequestBalance } from "./balance-fixture";

// 04.1-03 D-96(입사 첫해 월차 — 근속 첫 1년, 사용자 결정 11:42) · D-97(퇴직) · R1(입사 다음 해
// 연차 = 근무 기간 비례, 0.25일 올림) · ENG-4(퇴직 다음 해 연차 0) · ENG-11(D4 월차 줄) ·
// A2-01(1월 입사자의 다음 해 월차) · 사용자 요구 11:43(두 잔고 분리).

function accrualDates(hireDate: string, asOf: string, resignationDate: string | null = null): string[] {
  return buildLeaveGrants({ hireDate, resignationDate, fiscalYears: [], annualDaysByYear: {}, adjustments: [], asOf })
    .filter((grant) => grant.source === "monthly")
    .map((grant) => grant.validFrom);
}

function texts(lines: { text: string }[] | null): string[] {
  return (lines ?? []).map((line) => line.text);
}

describe("월차 적립일 — 입사일 + k개월(k = 1..11), 없는 날은 그달 말일", () => {
  it("입사 2026-01-31 → 02-28 · 03-31 · 04-30 …(2월 말일 보정)", () => {
    expect(accrualDates("2026-01-31", "2026-12-31").slice(0, 3)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("입사 2024-02-29(윤년) → 2024-03-29 … 11번째 2025-01-29", () => {
    const dates = accrualDates("2024-02-29", "2025-12-31");
    expect(dates[0]).toBe("2024-03-29");
    expect(dates).toHaveLength(11);
    expect(dates[10]).toBe("2025-01-29");
  });

  it("입사 2026-10-01 → 11번째 적립 2027-09-01, 소멸 2027-12-31, 2028-01-01 기준 월차 줄 없음", () => {
    const grants = buildLeaveGrants({
      hireDate: "2026-10-01",
      resignationDate: null,
      fiscalYears: [],
      annualDaysByYear: {},
      adjustments: [],
      asOf: "2027-12-31",
    }).filter((grant) => grant.source === "monthly");
    expect(grants).toHaveLength(11);
    expect(grants[10]).toMatchObject({ validFrom: "2027-09-01", expiresOn: "2027-12-31" });
    expect(runBalance({ hireDate: "2026-10-01", fiscalYear: 2028, asOf: "2028-01-01" }).summary.monthly).toBeNull();
  });

  it("입사 전날 · 입사 당일 기준 적립 0, 입사 + 1개월 당일 기준 1", () => {
    expect(accrualDates("2026-03-10", "2026-03-09")).toHaveLength(0);
    expect(accrualDates("2026-03-10", "2026-03-10")).toHaveLength(0);
    expect(accrualDates("2026-03-10", "2026-04-10")).toEqual(["2026-04-10"]);
  });
});

describe("퇴직 — 적립일 ≤ 퇴직일만 센다(D-97 · 계획 가정 7)", () => {
  it("퇴직 2026-06-15 → 3 · 적립일 당일 2026-06-10 → 3 · 전날 2026-06-09 → 2", () => {
    expect(accrualDates("2026-03-10", "2026-09-24", "2026-06-15")).toHaveLength(3);
    expect(accrualDates("2026-03-10", "2026-09-24", "2026-06-10")).toHaveLength(3);
    expect(accrualDates("2026-03-10", "2026-09-24", "2026-06-09")).toHaveLength(2);
  });

  it("입사 + 1개월 전 퇴직(2026-04-01)이면 적립 0이고 잔고는 퇴직 줄 한 줄뿐이다", () => {
    const { summary } = runBalance({
      hireDate: "2026-03-10",
      resignationDate: "2026-04-01",
      fiscalYear: 2026,
      asOf: "2026-09-24",
    });
    expect(accrualDates("2026-03-10", "2026-09-24", "2026-04-01")).toHaveLength(0);
    const resignation = resignationBalanceOf(summary, "2026-04-01");
    const lines = texts(formatBalanceLines({ ...summary, resignation }));
    expect(lines).toEqual(["퇴직 2026-04-01 · 남은 연차 0일 · 월차 0일"]);
    expect(lines.join("\n")).not.toContain("월차 적립");
  });

  it("퇴직 줄은 조회 연도 = 퇴직 연도일 때만 재료가 있다", () => {
    const { summary } = runBalance({ hireDate: null, resignationDate: "2026-10-31", fiscalYear: 2027, asOf: "2027-03-01" });
    expect(resignationBalanceOf(summary, "2026-10-31")).toBeNull();
  });
});

describe("R1 — 입사 다음 해 연차 = 근무 기간 비례(0.25일 올림) · annualGrantQuarters", () => {
  const grant = (hireDate: string | null, fiscalYear: number, annualDays = 15, resignationDate: string | null = null) =>
    annualGrantQuarters({ fiscalYear, hireDate, resignationDate, annualDays });

  it("입사 2026-01-01 → 2027 연차 60쿼터(전액)", () => {
    expect(grant("2026-01-01", 2027)).toBe(60);
  });

  it("입사 2026-10-01(평년) → 근무 92일 → ceil(60×92/365) = 16쿼터(4일)", () => {
    expect(grant("2026-10-01", 2027)).toBe(16);
  });

  it("윤년 입사 2028-07-02 → 근무 183/366일 → 30쿼터(7.5일 — 365로 나누면 31)", () => {
    expect(grant("2028-07-02", 2029)).toBe(30);
  });

  it("윤년 2028-01-01 입사 → 2029 연차 60쿼터(366/366)", () => {
    expect(grant("2028-01-01", 2029)).toBe(60);
  });

  it("입사 2026-12-31 → 근무 1일 → 1쿼터(0.25일)", () => {
    expect(grant("2026-12-31", 2027)).toBe(1);
  });

  it("입사 연도 안 퇴직(입사 2026-03-10 · 퇴직 2026-11-30) → 2027 연차 0 · 부여 목록에 없다", () => {
    expect(grant("2026-03-10", 2027, 15, "2026-11-30")).toBe(0);
    const grants = buildLeaveGrants({
      hireDate: "2026-03-10",
      resignationDate: "2026-11-30",
      fiscalYears: [2026, 2027],
      annualDaysByYear: { 2026: 15, 2027: 15 },
      adjustments: [],
      asOf: "2027-03-01",
    });
    expect(grants.filter((g) => g.source === "annual")).toEqual([]);
  });

  it("경계 — 입사 연도 0 · H+2 전액 · 입사일 없음 매년 전액 · annual_days(H+1)=16이면 17쿼터", () => {
    expect(grant("2026-10-01", 2026)).toBe(0);
    expect(grant("2026-10-01", 2028)).toBe(60);
    expect(grant(null, 2026)).toBe(60);
    expect(grant(null, 2031)).toBe(60);
    expect(grant("2026-10-01", 2027, 16)).toBe(17);
  });
});

describe("ENG-4 — 퇴직 다음 해 연차 부여 없음", () => {
  it("입사일 없음 · 퇴직 2026-10-31 → 2026 60쿼터(깎지 않음) · 2027 0이고 목록에 2027 연차가 없다", () => {
    expect(annualGrantQuarters({ fiscalYear: 2026, hireDate: null, resignationDate: "2026-10-31", annualDays: 15 })).toBe(60);
    expect(annualGrantQuarters({ fiscalYear: 2027, hireDate: null, resignationDate: "2026-10-31", annualDays: 15 })).toBe(0);
    const grants = buildLeaveGrants({
      hireDate: null,
      resignationDate: "2026-10-31",
      fiscalYears: [2026, 2027],
      annualDaysByYear: { 2026: 15, 2027: 15 },
      adjustments: [],
      asOf: "2027-03-01",
    });
    expect(grants.map((g) => g.validFrom)).toEqual(["2026-01-01"]);
  });

  it("입사 2026-10-01 · 퇴직 2027-05-31 → 2027 연차 16쿼터(비례 그대로) · 2028 0", () => {
    const at = (fiscalYear: number) =>
      annualGrantQuarters({ fiscalYear, hireDate: "2026-10-01", resignationDate: "2027-05-31", annualDays: 15 });
    expect(at(2027)).toBe(16);
    expect(at(2028)).toBe(0);
  });
});

describe("ENG-11 · D4 — 월차 줄", () => {
  it("입사 2026-12-15 · 기준 2027-01-05(근속 첫 1년 안, 적립 0) → 월차 0일 줄 · 반차 잔고 행", () => {
    const base = { hireDate: "2026-12-15", fiscalYear: 2027, asOf: "2027-01-05" };
    const { summary } = runBalance(base);
    expect(texts(formatBalanceLines(summary))[1]).toBe("월차 적립 0일 · 사용 0일 · 결재 중 0일 · 남음 0일 · 2027-12-31 소멸");
    expect(summary.annual.grantQuarters).toBe(3);

    const row = runRequestBalance({ ...base, request: pending("r1", "2027-01-05", 2) });
    expect(row.monthlyRemaining).toBe(0);
    expect(row.over).toBe(0);
    expect(texts(formatBalanceRow(row, "half_day"))).toEqual([
      "연차 남음 0.75일 · 월차 남음 0일 · 결재 중 0일 · 이번 신청 0.5일",
      "차감 예정 월차 0일 · 연차 0.5일",
    ]);
  });

  it("같은 사람을 2028-03-15에 보면(근속 1년 지남 · 월차 소멸) 반차 잔고 행에 월차 칸 · 2행이 없다", () => {
    const row = runRequestBalance({
      hireDate: "2026-12-15",
      fiscalYear: 2028,
      asOf: "2028-03-15",
      request: pending("r1", "2028-03-15", 2),
    });
    expect(row.monthlyRemaining).toBeNull();
    expect(texts(formatBalanceRow(row, "half_day"))).toEqual(["연차 남음 15일 · 결재 중 0일 · 이번 신청 0.5일"]);
  });

  it("입사 2026-10-01 · 기준 2027-12-15(근속 1년 지남, 2027 적립 있음) → 월차 줄 있음", () => {
    expect(runBalance({ hireDate: "2026-10-01", fiscalYear: 2027, asOf: "2027-12-15" }).summary.monthly?.status).toBe("active");
  });

  it("입사 2024-06-01 · 기준 2026-09-24(월차 2025-12-31 소멸) → 월차 줄 없음 · 잔고 행에 월차 칸 없음", () => {
    const base = { hireDate: "2024-06-01", fiscalYear: 2026, asOf: "2026-09-24" };
    expect(runBalance(base).summary.monthly).toBeNull();
    const row = runRequestBalance({ ...base, request: pending("r1", "2026-09-25", 4) });
    expect(row.monthlyRemaining).toBeNull();
    expect(texts(formatBalanceRow(row, "full_day")).join("\n")).not.toContain("월차");
  });

  it("입사일 없음 → `월차 계산 불가 · 입사일 없음`, 신청용 monthlyRemaining null", () => {
    const base = { hireDate: null, fiscalYear: 2026, asOf: "2026-09-24" };
    expect(texts(formatBalanceLines(runBalance(base).summary))[1]).toBe("월차 계산 불가 · 입사일 없음");
    expect(runRequestBalance({ ...base, request: pending("r1", "2026-09-25", 4) }).monthlyRemaining).toBeNull();
  });
});

describe("A2-01 — 1월 입사자의 다음 해: 조회 연도에 적립은 없지만 유효한 월차", () => {
  const JAN = { hireDate: "2026-01-01", requests: [approved("a", "2026-06-01", 12)] };

  it("2026-06-01~03 종일 3일은 시작일에 유효한 월차 5에서 월차 3 · 연차 0으로 빠진다", () => {
    const { allocations } = runBalance({ ...JAN, fiscalYear: 2026, asOf: "2026-06-01" });
    expect(allocations[0]).toMatchObject({ monthly: 12, annual: 0, over: 0 });
  });

  it("2027 조회(2027-03-15) — 월차 줄 있음 · 적립 11 · 사용 3 · 남음 8 · 연차 15 · 차감 예정 월차 2일", () => {
    const base = { ...JAN, fiscalYear: 2027, asOf: "2027-03-15" };
    const { summary } = runBalance(base);
    expect(summary.monthly).toEqual({
      status: "active",
      accruedQuarters: 44,
      usedQuarters: 12,
      pendingQuarters: 0,
      remainingQuarters: 32,
      expiresOn: "2027-12-31",
    });
    expect(texts(formatBalanceLines(summary))[1]).toBe("월차 적립 11일 · 사용 3일 · 결재 중 0일 · 남음 8일 · 2027-12-31 소멸");
    expect(summary.annual.grantQuarters).toBe(60);

    const row = runRequestBalance({ ...base, request: pending("b", "2027-03-16", 8) });
    expect(texts(formatBalanceRow(row, "full_day"))).toEqual([
      "연차 남음 15일 · 월차 남음 8일 · 결재 중 0일 · 이번 신청 2일",
      "차감 예정 월차 2일 · 연차 0일",
    ]);
  });

  it("2028 조회(2028-01-05)는 월차 소멸 뒤라 월차 줄이 없다", () => {
    expect(runBalance({ ...JAN, fiscalYear: 2028, asOf: "2028-01-05" }).summary.monthly).toBeNull();
  });
});

describe("입사 다음 해 두 잔고 분리(사용자 요구 11:43 · R1)", () => {
  const OCT = { hireDate: "2026-10-01", fiscalYear: 2027, asOf: "2027-03-15" };

  it("입사 2026-10-01 · 기준 2027-03-15 — 연차 부여 4 · 남음 4와 월차 적립 5 · 남음 5가 따로, 합계 9일은 어디에도 없다", () => {
    const { summary } = runBalance(OCT);
    expect(summary.annual).toMatchObject({ grantQuarters: 16, remainingQuarters: 16 });
    expect(summary.monthly).toMatchObject({ accruedQuarters: 20, remainingQuarters: 20 });
    expect(JSON.stringify(summary)).not.toMatch(/\b36\b/);

    const row = runRequestBalance({ ...OCT, request: pending("r1", "2027-03-15", 24) });
    const lines = [...texts(formatBalanceLines(summary)), ...texts(formatBalanceRow(row, "full_day"))];
    expect(lines).toContain("연차 남음 4일 · 월차 남음 5일 · 결재 중 0일 · 이번 신청 6일");
    expect(lines.join("\n")).not.toContain("9일");
  });

  it("같은 직원의 6일 신청 — 같은 소멸일이라 월차 먼저: 차감 예정 월차 5일 · 연차 1일", () => {
    const row = runRequestBalance({ ...OCT, request: pending("r1", "2027-03-15", 24) });
    expect(row.plannedDeduction).toEqual({ monthly: 20, annual: 4 });
    expect(texts(formatBalanceRow(row, "full_day"))[1]).toBe("차감 예정 월차 5일 · 연차 1일");
  });
});
