import { describe, expect, it } from "vitest";
import {
  allocateLeave,
  checkLeaveAdjustment,
  formatBalanceLines,
  formatBalanceRow,
  formatResignationLine,
  requestBalanceOf,
  summarizeLeaveBalance,
  type LeaveGrant,
} from "@/domain/leave/balance";
import { approved, pending, runBalance } from "./balance-fixture";

// 04.1-03 LEAV-01 · 입력 §5 · ENG-12(D3 남음 정의 하나) · ENG-13(조정 계약) · CX-R02(부여 없는 해의
// 초과) · 사용자 요구 11:43(합계 없음) · assumption-delta 불변식(부여 목록 하나).

function texts(lines: { text: string }[] | null): string[] {
  return (lines ?? []).map((line) => line.text);
}

describe("배분 — 소멸 빠른 순 · 같으면 월차 먼저 · 모자라면 그 해 연차로 넘김(초과)", () => {
  it("2027년 신청은 월차(2027-12-31)와 2027 연차(2027-12-31)가 같은 소멸일이라 월차 먼저", () => {
    const { allocations } = runBalance({
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      requests: [pending("r", "2027-03-15", 8)],
    });
    expect(allocations[0]).toMatchObject({ monthly: 8, annual: 0 });
  });

  it("CX-R02 입사 첫해 초과 — 적립 2일에서 월차 2 + 연차 1, 2026 연차 부여가 없어도 자리로 넘겨 over 4 · 남음 -4", () => {
    const { grants, allocations, summary } = runBalance({
      hireDate: "2026-03-10",
      fiscalYear: 2026,
      asOf: "2026-05-20",
      requests: [approved("r", "2026-05-20", 12)],
    });
    expect(grants.filter((g) => g.source === "annual")).toEqual([]);
    expect(allocations).toEqual([
      { id: "r", status: "approved", monthly: 8, annual: 4, annualFiscalYear: 2026, over: 4 },
    ]);
    expect(summary.annual).toEqual({
      grantQuarters: 0,
      adjustmentQuarters: 0,
      usedQuarters: 4,
      pendingQuarters: 0,
      remainingQuarters: -4,
    });
    expect(summary.monthly).toMatchObject({ remainingQuarters: 0 });
  });

  it("CX-R02 연차 설정 0일 — 부여 목록에 2026 연차가 없고 결재 중 1일은 over 4 · 잔고 행 `잔여 초과 1일`", () => {
    const base = { hireDate: null, fiscalYear: 2026, asOf: "2026-03-02", annualDays: { 2026: 0 } };
    const { grants, allocations, summary } = runBalance({ ...base, requests: [pending("r", "2026-03-02", 4)] });
    expect(grants).toEqual([]);
    expect(allocations[0]).toEqual({ id: "r", status: "pending", monthly: 0, annual: 4, annualFiscalYear: 2026, over: 4 });
    expect(summary.annual).toMatchObject({ grantQuarters: 0, usedQuarters: 0, pendingQuarters: 4, remainingQuarters: -4 });

    const row = requestBalanceOf(summary, allocations, "r");
    expect(row).toMatchObject({ annualRemaining: 0, monthlyRemaining: null, over: 4 });
    expect(texts(formatBalanceRow(row, "full_day"))).toEqual(["연차 남음 0일 · 결재 중 0일 · 이번 신청 1일", "잔여 초과 1일"]);
  });
});

describe("정밀 — 정수 1/4일", () => {
  it("반반차 4건 = 1일, 반차 1 + 반반차 2 = 1일, 재택은 어떤 부여에서도 빠지지 않는다", () => {
    const quarters = runBalance({
      hireDate: null,
      fiscalYear: 2026,
      asOf: "2026-09-24",
      requests: ["a", "b", "c", "d"].map((id, i) => approved(id, `2026-09-0${i + 1}`, 1)),
    });
    expect(quarters.summary.annual.usedQuarters).toBe(4);

    const mixed = runBalance({
      hireDate: null,
      fiscalYear: 2026,
      asOf: "2026-09-24",
      requests: [approved("h", "2026-09-01", 2), approved("q1", "2026-09-02", 1), approved("q2", "2026-09-03", 1), approved("w", "2026-09-04", 0)],
    });
    expect(mixed.summary.annual).toMatchObject({ usedQuarters: 4, remainingQuarters: 56 });
    expect(mixed.allocations.find((a) => a.id === "w")).toMatchObject({ monthly: 0, annual: 0, over: 0 });
    expect(formatBalanceRow(requestBalanceOf(mixed.summary, mixed.allocations, "w"), "remote")).toBeNull();
  });
});

describe("이월 없음 · 이력형 연차 일수", () => {
  it("2026 연차 남음 5일이어도 2027 연차는 2027-01-01 시점 설정 값 그대로", () => {
    const requests = [approved("r", "2026-03-02", 40)];
    expect(runBalance({ hireDate: null, fiscalYear: 2026, asOf: "2027-01-05", requests }).summary.annual.remainingQuarters).toBe(20);
    expect(runBalance({ hireDate: null, fiscalYear: 2027, asOf: "2027-01-05", requests }).summary.annual).toMatchObject({
      grantQuarters: 60,
      remainingQuarters: 60,
    });
  });

  it("2027-01-01부터 16일이어도 2026 부여는 15 그대로", () => {
    const annualDays = { 2026: 15, 2027: 16 };
    expect(runBalance({ hireDate: null, fiscalYear: 2026, asOf: "2027-01-05", annualDays }).summary.annual.grantQuarters).toBe(60);
    expect(runBalance({ hireDate: null, fiscalYear: 2027, asOf: "2027-01-05", annualDays }).summary.annual.grantQuarters).toBe(64);
  });
});

describe("조정 — 계약(ENG-13)", () => {
  const check = (input: Partial<Parameters<typeof checkLeaveAdjustment>[0]>) =>
    checkLeaveAdjustment({
      bucket: "annual",
      fiscalYear: 2026,
      amountDays: -1,
      reason: "무단 결근",
      createdOn: "2026-11-02",
      hireDate: null,
      ...input,
    });

  it("연차 -1(무단 결근) → 연차 줄 `조정 -1일`, 월차 +1 → 월차 적립에 합산", () => {
    const annual = runBalance({
      hireDate: null,
      fiscalYear: 2026,
      asOf: "2026-11-02",
      adjustments: [{ id: "a1", bucket: "annual", fiscalYear: 2026, amountQuarters: -4, createdOn: "2026-11-02" }],
    });
    expect(texts(formatBalanceLines(annual.summary))[0]).toBe("연차 15일 · 조정 -1일 · 사용 0일 · 결재 중 0일 · 남음 14일");

    const monthly = runBalance({
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      adjustments: [{ id: "m1", bucket: "monthly", fiscalYear: null, amountQuarters: 4, createdOn: "2026-11-03" }],
    });
    expect(monthly.summary.monthly).toMatchObject({ accruedQuarters: 24, remainingQuarters: 24 });
  });

  it("0 · 0.3 · 사유 공백은 거부, 0.25 단위는 통과", () => {
    expect(check({ amountDays: 0 })).not.toBeNull();
    expect(check({ amountDays: 0.3 })?.message).toBe("일수는 0.25 단위 · 0.5처럼 적어 주세요");
    expect(check({ reason: "   " })?.message).toBe("사유 비어 있음 · 사유 적기");
    expect(check({ amountDays: -1.75 })).toBeNull();
  });

  it("월차 -1(입력 2027-03-01) → 월차 적립 4 · 남음 4, 연차 4 그대로 · 6일 신청은 월차 4일 · 연차 2일", () => {
    const base = {
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      adjustments: [{ id: "m1", bucket: "monthly" as const, fiscalYear: null, amountQuarters: -4, createdOn: "2027-03-01" }],
    };
    const { summary } = runBalance(base);
    expect(summary.monthly).toMatchObject({ accruedQuarters: 16, remainingQuarters: 16 });
    expect(summary.annual.remainingQuarters).toBe(16);

    const withRequest = runBalance({ ...base, requests: [pending("r", "2027-03-15", 24)] });
    const row = requestBalanceOf(withRequest.summary, withRequest.allocations, "r");
    expect(texts(formatBalanceRow(row, "full_day"))[1]).toBe("차감 예정 월차 4일 · 연차 2일");
  });

  it("월차 -6이면 월차 남음 -1일, 연차 남음 4는 그대로(다른 버킷으로 넘어가지 않는다)", () => {
    const { summary } = runBalance({
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      adjustments: [{ id: "m1", bucket: "monthly", fiscalYear: null, amountQuarters: -24, createdOn: "2027-03-01" }],
    });
    expect(texts(formatBalanceLines(summary))[1]).toBe("월차 적립 -1일 · 사용 0일 · 결재 중 0일 · 남음 -1일 · 2027-12-31 소멸");
    expect(summary.annual.remainingQuarters).toBe(16);
  });

  it("소멸 뒤 조정 — 2027-02-01에 넣은 2026 연차 +1은 2026 줄만 +1, 2027 줄은 그대로", () => {
    const adjustments = [{ id: "a1", bucket: "annual" as const, fiscalYear: 2026, amountQuarters: 4, createdOn: "2027-02-01" }];
    expect(runBalance({ hireDate: null, fiscalYear: 2026, asOf: "2027-02-01", adjustments }).summary.annual).toMatchObject({
      adjustmentQuarters: 4,
      remainingQuarters: 64,
    });
    expect(runBalance({ hireDate: null, fiscalYear: 2027, asOf: "2027-02-01", adjustments }).summary.annual).toMatchObject({
      adjustmentQuarters: 0,
      remainingQuarters: 60,
    });
  });

  it("월차 조정 입력일 — 소멸일 당일 2027-12-31 통과, 2028-01-02는 `월차 2027-12-31 소멸 · 연차로 조정하기`", () => {
    const monthly = { bucket: "monthly" as const, fiscalYear: null, amountDays: 1, hireDate: "2026-10-01" };
    expect(check({ ...monthly, createdOn: "2027-12-31" })).toBeNull();
    expect(check({ ...monthly, createdOn: "2028-01-02" })?.message).toBe("월차 2027-12-31 소멸 · 연차로 조정하기");
  });

  it("입사일 없는 사람 — 월차 조정 거부 · 연차 조정 fiscalYear 없음 거부 · 월차 조정 fiscalYear 있음 거부", () => {
    expect(check({ bucket: "monthly", fiscalYear: null, hireDate: null })?.message).toBe("입사일 없음 · 먼저 입사일 넣기");
    expect(check({ bucket: "annual", fiscalYear: null })).not.toBeNull();
    expect(check({ bucket: "monthly", fiscalYear: 2026, hireDate: "2026-10-01" })).not.toBeNull();
    const { summary } = runBalance({ hireDate: null, fiscalYear: 2026, asOf: "2026-11-02" });
    expect(texts(formatBalanceLines(summary))[1]).toBe("월차 계산 불가 · 입사일 없음");
  });
});

describe("ENG-12 · D3 픽스처 — 한 입력으로 요약과 문자열을 같이 단언", () => {
  it("입사 2026-10-01 · 기준 2027-03-15 · A 승인 5일 · B 결재 중 1일 · C 결재 중 반차", () => {
    const { allocations, summary } = runBalance({
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      requests: [approved("A", "2027-02-08", 20), pending("B", "2027-03-16", 4), pending("C", "2027-03-17", 2)],
    });
    expect(summary.annual).toEqual({
      grantQuarters: 16,
      adjustmentQuarters: 0,
      usedQuarters: 4,
      pendingQuarters: 2,
      remainingQuarters: 10,
    });
    expect(summary.monthly).toEqual({
      status: "active",
      accruedQuarters: 20,
      usedQuarters: 16,
      pendingQuarters: 4,
      remainingQuarters: 0,
      expiresOn: "2027-12-31",
    });
    expect(texts(formatBalanceLines(summary))).toEqual([
      "연차 4일 · 사용 1일 · 결재 중 0.5일 · 남음 2.5일",
      "월차 적립 5일 · 사용 4일 · 결재 중 1일 · 남음 0일 · 2027-12-31 소멸",
    ]);

    const row = requestBalanceOf(summary, allocations, "C");
    expect(row).toEqual({
      annualRemaining: 12,
      monthlyRemaining: 0,
      pending: 4,
      thisRequest: 2,
      plannedDeduction: { monthly: 0, annual: 2 },
      over: 0,
    });
    expect(texts(formatBalanceRow(row, "half_day"))).toEqual([
      "연차 남음 3일 · 월차 남음 0일 · 결재 중 1일 · 이번 신청 0.5일",
      "차감 예정 월차 0일 · 연차 0.5일",
    ]);
    // 모든 남음이 부여(+조정) − 사용 − 결재 중으로 재현된다.
    expect(summary.annual.remainingQuarters).toBe(16 + 0 - 4 - 2);
    expect(row.annualRemaining).toBe(16 - 4 - (2 - 2));
  });
});

describe("문자열 — UI-SPEC Copywriting 원문", () => {
  const annual = { grantQuarters: 60, adjustmentQuarters: 0, usedQuarters: 14, pendingQuarters: 4, remainingQuarters: 42 };
  const monthly = {
    status: "active" as const,
    accruedQuarters: 16,
    usedQuarters: 4,
    pendingQuarters: 0,
    remainingQuarters: 12,
    expiresOn: "2027-12-31",
  };
  const row = {
    annualRemaining: 42,
    monthlyRemaining: 12,
    pending: 4,
    thisRequest: 12,
    plannedDeduction: { monthly: 8, annual: 4 },
    over: 6,
  };

  it("잔고 줄 · 조정 · 월차 줄 · 입사일 없음", () => {
    expect(formatBalanceLines({ annual, monthly })).toEqual([
      { text: "연차 15일 · 사용 3.5일 · 결재 중 1일 · 남음 10.5일", tone: "default" },
      { text: "월차 적립 4일 · 사용 1일 · 결재 중 0일 · 남음 3일 · 2027-12-31 소멸", tone: "default" },
    ]);
    expect(texts(formatBalanceLines({ annual: { ...annual, adjustmentQuarters: -4, remainingQuarters: 38 }, monthly: null }))).toEqual([
      "연차 15일 · 조정 -1일 · 사용 3.5일 · 결재 중 1일 · 남음 9.5일",
    ]);
    expect(texts(formatBalanceLines({ annual, monthly: { status: "no_hire_date" } }))[1]).toBe("월차 계산 불가 · 입사일 없음");
  });

  it("잔고 행 세 줄(톤 default · muted · warning) · 월차 줄 없으면 월차 칸과 2행 없음 · 재택이면 null", () => {
    expect(formatBalanceRow(row, "full_day")).toEqual([
      { text: "연차 남음 10.5일 · 월차 남음 3일 · 결재 중 1일 · 이번 신청 3일", tone: "default" },
      { text: "차감 예정 월차 2일 · 연차 1일", tone: "muted" },
      { text: "잔여 초과 1.5일", tone: "warning" },
    ]);
    expect(texts(formatBalanceRow({ ...row, monthlyRemaining: null }, "full_day"))).toEqual([
      "연차 남음 10.5일 · 결재 중 1일 · 이번 신청 3일",
      "잔여 초과 1.5일",
    ]);
    expect(formatBalanceRow(row, "remote")).toBeNull();
  });

  it("퇴직 줄 — 금액 없음", () => {
    const resignation = { resignationDate: "2026-10-31", annualRemainingQuarters: 14, monthlyRemainingQuarters: 0 };
    expect(formatResignationLine(resignation)).toBe("퇴직 2026-10-31 · 남은 연차 3.5일 · 월차 0일");
    expect(formatBalanceLines({ annual, monthly, resignation })).toEqual([
      { text: "퇴직 2026-10-31 · 남은 연차 3.5일 · 월차 0일", tone: "default" },
    ]);
  });
});

describe("불변식(assumption-delta) — 세 출처가 한 부여 목록 경로로 계산된다", () => {
  it("연차 · 월차 · 조정을 부여 목록 리터럴로만 넘겨도 buildLeaveGrants 경로와 같은 요약이 나온다", () => {
    const input = {
      hireDate: "2026-10-01",
      fiscalYear: 2027,
      asOf: "2027-03-15",
      adjustments: [
        { id: "a1", bucket: "annual" as const, fiscalYear: 2027, amountQuarters: -4, createdOn: "2027-02-01" },
        { id: "m1", bucket: "monthly" as const, fiscalYear: null, amountQuarters: 4, createdOn: "2027-01-10" },
      ],
      requests: [approved("A", "2027-02-08", 20), pending("B", "2027-03-16", 8)],
    };
    const built = runBalance(input);
    expect(new Set(built.grants.map((g) => g.source))).toEqual(new Set(["annual", "monthly", "adjustment"]));

    const monthlyAccrual = (validFrom: string): LeaveGrant => ({
      source: "monthly",
      bucket: "monthly",
      amountQuarters: 4,
      validFrom,
      expiresOn: "2027-12-31",
    });
    const literal: LeaveGrant[] = [
      { source: "annual", bucket: "annual", amountQuarters: 16, validFrom: "2027-01-01", expiresOn: "2027-12-31" },
      ...["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"].map(monthlyAccrual),
      { source: "adjustment", bucket: "annual", amountQuarters: -4, validFrom: "2027-01-01", expiresOn: "2027-12-31", id: "a1" },
      { source: "adjustment", bucket: "monthly", amountQuarters: 4, validFrom: "2027-01-10", expiresOn: "2027-12-31", id: "m1" },
    ];
    const allocations = allocateLeave(literal, input.requests);
    const summary = summarizeLeaveBalance({ fiscalYear: 2027, asOf: "2027-03-15", hireDate: "2026-10-01", grants: literal, allocations });
    expect(summary).toEqual(built.summary);
    expect(allocations).toEqual(built.allocations);
  });
});
