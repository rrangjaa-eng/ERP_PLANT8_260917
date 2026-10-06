import { describe, expect, it, vi } from "vitest";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import type { TaxRates } from "@/domain/money/tax";
import { computeExpenseTax, pickTaxDates } from "@/domain/expenses/tax";
import { decidePayable, pickPaymentAmount } from "@/domain/payments";
import { approvalGateDecision, resolveExpenseActionRow } from "@/domain/payments/action-row";

// 06-03 — 지급 총액 · 금액 원천(R-4) · 공급가 역산(R-5) · 결재 게이트 · 「지출결의 상태 → 1차」(P0 · P4 · P6). DB 없이 돈다.

const RATES: TaxRates = {
  asOf: "2026-09-22",
  vatRate: 0.1,
  vatUnit: 1,
  withholdingOtherRate: 0.088,
  withholdingBusinessRate: 0.033,
  withholdingOtherExemptThreshold: 125_000,
  withholdingUnit: 10,
  minWithholding: 0,
  companyBorneRate: 0.088,
  companyBorneMethod: "flat",
  basisWithholding: "payment_date",
  basisVat: "evidence_date",
};

const SETTING_VALUES: Record<string, unknown> = {
  "tax.vat.rate": RATES.vatRate,
  "tax.rounding.vat_unit": RATES.vatUnit,
  "tax.withholding.other_income.rate": RATES.withholdingOtherRate,
  "tax.withholding.business_income.rate": RATES.withholdingBusinessRate,
  "tax.withholding.other_income.exempt_threshold": RATES.withholdingOtherExemptThreshold,
  "tax.rounding.withholding_unit": RATES.withholdingUnit,
  "tax.rounding.min_withholding": RATES.minWithholding,
  "tax.company_borne.rate": RATES.companyBorneRate,
  "tax.company_borne.method": RATES.companyBorneMethod,
  "tax.basis_date.withholding": RATES.basisWithholding,
  "tax.basis_date.vat": RATES.basisVat,
};

const VAT_RULE: TaxRule = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };
const WITHHOLDING_RULE: TaxRule = { ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" };
const COMPANY_BORNE_RULE: TaxRule = { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "payment_date" };
const OPTS = { paymentDate: "2026-09-22", evidenceDate: "2026-09-22" };

function vatInput(amountKrw: number, transferKrw?: number, rule: TaxRule = VAT_RULE) {
  return { amount: { source: "supply" as const, amountKrw }, taxRule: rule, applyOpts: OPTS, incomeType: "other" as const, transferKrw };
}

describe("pickPaymentAmount (R-4 · E-7)", () => {
  it("파일 0 · 증빙 금액만 → 공급가", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: false, evidenceAmountKrw: 900_000, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "supply",
      amountKrw: 1_000_000,
    });
  });

  it("파일 있음 · 증빙 금액 → 증빙 금액", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: 900_000, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "evidence",
      amountKrw: 900_000,
    });
  });

  it("파일 있음 · 증빙 금액 없음 → 공급가", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: null, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "supply",
      amountKrw: 1_000_000,
    });
  });
});

describe("decidePayable", () => {
  it("금액은 pickPaymentAmount 결과만 쓴다 — 증빙 금액 원천이면 증빙 금액으로 셈한다", async () => {
    const amount = pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: 500_000, supplyAmountKrw: 1_000_000 });
    const result = await decidePayable({ amount, taxRule: VAT_RULE, applyOpts: OPTS, incomeType: "other" }, RATES);
    expect(result.payableKrw).toBe(550_000);
  });

  const SAME_AS_05: [string, TaxRule, string][] = [
    ["부가세", VAT_RULE, "tax_invoice"],
    ["원천징수", WITHHOLDING_RULE, "other_income"],
    ["회사 대납", COMPANY_BORNE_RULE, "company_borne"],
  ];
  for (const [label, rule, evidenceType] of SAME_AS_05) {
    it(`같은 입력의 05 computeExpenseTax payable과 같다 — ${label}`, async () => {
      const doc = { evidenceType, supplyAmountKrw: 712_500, scheduledPaymentDate: "2026-09-22", evidenceDate: "2026-09-22", createdAt: new Date("2026-09-01T00:00:00Z") };
      const tax = await computeExpenseTax({ id: "u1" } as never, doc, {
        listCodeItems: vi.fn(() => Promise.resolve([{ value: evidenceType, taxRule: rule }])) as never,
        getSettingValue: vi.fn((def: { key: string }) => Promise.resolve(SETTING_VALUES[def.key])) as never,
        getSettingEntry: vi.fn((def: { key: string }) => Promise.resolve({ value: SETTING_VALUES[def.key], historizedId: null, effectiveFrom: null })) as never,
        now: new Date("2026-09-22T03:00:00Z"),
      });
      if (tax.unavailable) throw new Error("계산 불가");
      const dates = pickTaxDates(doc, { ruleKind: rule.ruleKind, codeBasis: rule.basisDate, basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: "2026-09-22" });
      const result = await decidePayable(
        { amount: { source: "supply", amountKrw: 712_500 }, taxRule: rule, applyOpts: dates.applyOpts, incomeType: evidenceType === "business_income" ? "business" : "other" },
        RATES,
      );
      expect(result.payableKrw).toBe(tax.payableKrw);
    });
  }

  it("vat_surcharge만 공급가 역산 값이 있고 원천징수 · 회사 대납 · 규칙 없음은 null이다(UA-619)", async () => {
    expect((await decidePayable(vatInput(1_000_000), RATES)).grossSupplyKrw).toBe(1_000_000);
    expect((await decidePayable(vatInput(1_000_000, undefined, WITHHOLDING_RULE), RATES)).grossSupplyKrw).toBeNull();
    expect((await decidePayable(vatInput(1_000_000, undefined, COMPANY_BORNE_RULE), RATES)).grossSupplyKrw).toBeNull();
    expect((await decidePayable(vatInput(1_000_000, undefined, { ruleKind: "none" }), RATES)).grossSupplyKrw).toBeNull();
  });

  it("역산 경계 — 이체액 1100 → 1,000 · 1,000,010 → 909,100 · 33 → 30", async () => {
    expect((await decidePayable(vatInput(1_000, 1_100), RATES)).grossSupplyKrw).toBe(1_000);
    expect((await decidePayable(vatInput(909_100, 1_000_010), RATES)).grossSupplyKrw).toBe(909_100);
    expect((await decidePayable(vatInput(30, 33), RATES)).grossSupplyKrw).toBe(30);
  });

  it("역산 경계 — 정방향 절사", async () => {
    const truncateRule: TaxRule = { ...VAT_RULE, roundingMethod: "truncate" };
    const forward = await decidePayable(vatInput(909_096, undefined, truncateRule), RATES);
    // 정방향은 코드표 절사(반올림이었다면 1,000,006), 역산은 "round" 고정 — 1원 차이를 그대로 기대값으로 못박는다(R-5).
    expect(forward.vatKrw).toBe(90_909);
    expect(forward.payableKrw).toBe(1_000_005);
    expect(forward.grossSupplyKrw).toBe(909_095);
    expect((await decidePayable(vatInput(909_096, 1_000_006, truncateRule), RATES)).grossSupplyKrw).toBe(909_096);
  });

  it("이체액을 주지 않으면 이체액 = 지급 총액 · 차이 0이다", async () => {
    const result = await decidePayable(vatInput(1_000_000), RATES);
    expect(result.transferKrw).toBe(1_100_000);
    expect(result.diffKrw).toBe(0);
  });
});

describe("미래 지급일 (RS-11 · Q6)", () => {
  it("pickTaxDates의 payment_date 기준일은 미래 지급일 그대로다", () => {
    const dates = pickTaxDates(
      { paidDate: "2027-03-02", scheduledPaymentDate: "2026-09-30", createdAt: new Date("2026-09-01T00:00:00Z") },
      { ruleKind: "withholding", codeBasis: "payment_date", basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: "2026-09-22" },
    );
    expect(dates.basisDate).toBe("2027-03-02");
  });
});

describe("approvalGateDecision", () => {
  it("approved는 통과한다(자기 승인도 approved로 끝난다 — UA-607)", () => {
    expect(approvalGateDecision({ approvalState: "approved", stepName: null })).toEqual({ allowed: true });
  });

  it("결재 중이면 `결재 통과 전 · {단계} 결재 중`", () => {
    expect(approvalGateDecision({ approvalState: "in_review", stepName: "팀장" })).toEqual({ allowed: false, reason: "결재 통과 전 · 팀장 결재 중" });
    expect(approvalGateDecision({ approvalState: "submitted", stepName: "본부장" })).toEqual({ allowed: false, reason: "결재 통과 전 · 본부장 결재 중" });
  });

  it("반려 · 회수 · 결재 없음은 막힌다", () => {
    expect(approvalGateDecision({ approvalState: "rejected", stepName: null })).toEqual({ allowed: false, reason: "결재 통과 전 · 반려" });
    expect(approvalGateDecision({ approvalState: "withdrawn", stepName: null })).toEqual({ allowed: false, reason: "결재 통과 전 · 회수" });
    expect(approvalGateDecision({ approvalState: null, stepName: null }).allowed).toBe(false);
  });
});

describe("resolveExpenseActionRow", () => {
  const payer = { canPay: true };
  const other = { canPay: false };

  it("결재 통과 전 → P0(버튼 0 · 섹션 없음)", () => {
    expect(resolveExpenseActionRow({ approvalState: "in_review", paid: false }, payer)).toEqual({ row: "P0", primary: null, ownerNote: null });
  });

  it("통과 · 지급 전 → P4(1차 `지급 완료`)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: false }, payer)).toEqual({ row: "P4", primary: "pay", ownerNote: null });
  });

  it("지급 뒤 → P6(1차 없음)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: true }, payer)).toEqual({ row: "P6", primary: null, ownerNote: null });
  });

  it("지급 권한 없음 → 버튼 0 + 담당 표기(지급 전)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: false }, other)).toEqual({ row: "P4", primary: null, ownerNote: "지급은 경영관리" });
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: true }, other)).toEqual({ row: "P6", primary: null, ownerNote: null });
  });
});
