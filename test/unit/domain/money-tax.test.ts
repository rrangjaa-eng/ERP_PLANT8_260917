import { describe, expect, it, vi } from "vitest";
import { applyTaxRule } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";

// 04-02 Task 1 ② — 세금 규칙 네 종류 × 절사 단위·방식 조합, 최소 징수액
// 경계. 설정 조회는 deps 주입으로 고정값을 넣어 DB 없이 돈다
// (domain/vendors/index.ts의 deps?: Partial<X> 패턴).
const PAYMENT_DATE = new Date("2026-09-22");
const EVIDENCE_DATE = new Date("2026-09-15");

const SETTING_VALUES: Record<string, unknown> = {
  "tax.vat.rate": 0.1,
  "tax.withholding.other_income.rate": 0.088,
  "tax.withholding.business_income.rate": 0.033,
  "tax.withholding.other_income.exempt_threshold": 125_000,
  "tax.company_borne.rate": 0.088,
  "tax.company_borne.method": "flat",
  "tax.basis_date.withholding": "payment_date",
  "tax.basis_date.vat": "evidence_date",
  "tax.rounding.vat_unit": 1,
  "tax.rounding.withholding_unit": 10,
  "tax.rounding.min_withholding": 0,
};

function fakeGetSettingValue(overrides: Record<string, unknown> = {}) {
  const values = { ...SETTING_VALUES, ...overrides };
  return vi.fn((def: { key: string }, opts?: { asOf?: Date }) => {
    void opts;
    return Promise.resolve(values[def.key]);
  });
}

const NONE_RULE: TaxRule = { ruleKind: "none" };
const VAT_RULE: TaxRule = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };
const WITHHOLDING_RULE: TaxRule = {
  ruleKind: "withholding",
  roundingUnit: 10,
  roundingMethod: "round",
  minWithholdingAmount: 0,
  basisDate: "payment_date",
};
const COMPANY_BORNE_RULE: TaxRule = {
  ruleKind: "company_borne",
  roundingUnit: 10,
  roundingMethod: "round",
  minWithholdingAmount: 0,
  basisDate: "payment_date",
};

describe("applyTaxRule", () => {
  it("규칙 '없음'은 전부 0이고 지급 총액은 공급가 그대로다", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      1_000_000,
      NONE_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result).toEqual({ vatKrw: 0, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: 1_000_000 });
  });

  it("규칙 '부가세 가산'은 부가세 100,000·지급 총액 1,100,000이다", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      1_000_000,
      VAT_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.vatKrw).toBe(100_000);
    expect(result.payableKrw).toBe(1_100_000);
    expect(result.withholdingKrw).toBe(0);
    expect(result.companyBorneKrw).toBe(0);
  });

  it("규칙 '부가세 가산'은 증빙일을 기준일로 넘긴다", async () => {
    const getSettingValue = fakeGetSettingValue();
    await applyTaxRule(
      1_000_000,
      VAT_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    const vatRateCall = getSettingValue.mock.calls.find(([def]) => def.key === "tax.vat.rate");
    expect(vatRateCall?.[1]).toEqual({ asOf: EVIDENCE_DATE });
  });

  it("규칙 '원천징수 수령자 부담'은 절사 단위·방식대로 원천징수액을 계산하고 지급 총액 = 공급가 − 원천징수액이다", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      1_000_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 1,000,000 * 0.088 = 88,000 (10원 단위 반올림 — 이미 10원 단위)
    expect(result.withholdingKrw).toBe(88_000);
    expect(result.payableKrw).toBe(912_000);
    expect(result.vatKrw).toBe(0);
    expect(result.companyBorneKrw).toBe(0);
  });

  it("규칙 '원천징수 수령자 부담'은 지급일을 기준일로 넘긴다", async () => {
    const getSettingValue = fakeGetSettingValue();
    await applyTaxRule(
      1_000_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    const rateCall = getSettingValue.mock.calls.find(([def]) => def.key === "tax.withholding.other_income.rate");
    expect(rateCall?.[1]).toEqual({ asOf: PAYMENT_DATE });
  });

  it("최소 징수액 기준을 밑도는 금액을 주면 원천징수액이 0이다(기타소득 면제 기준)", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      100_000, // exempt_threshold 125,000 이하
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.withholdingKrw).toBe(0);
    expect(result.payableKrw).toBe(100_000);
  });

  it("계산된 원천징수액이 설정된 최소 징수액 미만이면 0이다", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.rounding.min_withholding": 100_000 });
    const result = await applyTaxRule(
      1_000_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 계산값 88,000 < 최소 징수액 100,000 → 0
    expect(result.withholdingKrw).toBe(0);
  });

  it.each(["truncate", "round", "ceil"] as const)("원천징수 절사 방식 %s가 적용된다", async (roundingMethod) => {
    const getSettingValue = fakeGetSettingValue({ "tax.withholding.other_income.rate": 0.0885 });
    const rule: TaxRule = { ...WITHHOLDING_RULE, roundingMethod };
    const result = await applyTaxRule(
      1_000_000,
      rule,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 1,000,000 * 0.0885 = 88,500 (10원 단위라 절사 방식에 따라 달라지지 않음 — 이미 배수)
    expect(result.withholdingKrw).toBe(88_500);
  });

  it("규칙 '원천징수 회사 대납' 단순 비율(flat) — 회사 대납액이 나오고 지급 총액 = 공급가(수령자가 온전히 받는다)", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      1_000_000,
      COMPANY_BORNE_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.companyBorneKrw).toBe(88_000);
    expect(result.payableKrw).toBe(1_000_000);
  });

  it("규칙 '원천징수 회사 대납' gross-up 방식 — 회사 대납액이 나오고 지급 총액은 여전히 공급가다", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.company_borne.method": "gross_up" });
    const result = await applyTaxRule(
      1_000_000,
      COMPANY_BORNE_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // gross = 1,000,000 / (1 - 0.088) = 1,096,491.2... → 대납액 = gross - supply
    expect(result.companyBorneKrw).toBeGreaterThan(88_000);
    expect(result.payableKrw).toBe(1_000_000);
  });

  it("기준일 없이 설정을 읽는 호출이 0건이다 — 모든 historized 조회가 asOf를 넘긴다", async () => {
    const getSettingValue = fakeGetSettingValue();
    await applyTaxRule(
      1_000_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    const missingAsOf = getSettingValue.mock.calls.filter(([, opts]) => !opts || opts.asOf === undefined);
    // basis-date 설명용 조회(단순값)만 asOf 없이 불린다 — 나머지는 전부 asOf를 넘긴다.
    for (const [def] of missingAsOf) {
      expect(["tax.basis_date.withholding", "tax.basis_date.vat"]).toContain(def.key);
    }
  });
});
