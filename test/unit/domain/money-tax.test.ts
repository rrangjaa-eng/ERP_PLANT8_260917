import { describe, expect, it, vi } from "vitest";
import { applyTaxRule, loadTaxRates, taxRatesReader } from "@/domain/money/tax";
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

  it.each([
    // [공급가, 요율, 절사 기대값, 반올림 기대값] — 끝자리 5 이상이라 방식에 따라 갈린다
    [712_560, 0.088, 62_700, 62_710], // 62,705.28
    [135_700, 0.033, 4_470, 4_480], // 4,478.1
  ])("절사(truncate)는 10원 미만을 버리고 반올림과 갈린다 — 공급가 %s × %s", async (supply, rate, truncated, rounded) => {
    const ctx = { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE };
    const deps = { getSettingValue: fakeGetSettingValue({ "tax.withholding.other_income.rate": rate }) as never };
    expect((await applyTaxRule(supply, { ...WITHHOLDING_RULE, roundingMethod: "truncate" }, ctx, deps)).withholdingKrw).toBe(truncated);
    expect((await applyTaxRule(supply, { ...WITHHOLDING_RULE, roundingMethod: "round" }, ctx, deps)).withholdingKrw).toBe(rounded);
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

  it("E-23 원천징수 712,500 · 8.8% · 10원 절사 → 62,700", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      712_500,
      { ...WITHHOLDING_RULE, roundingMethod: "truncate" },
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 고치기 전 62,690
    expect(result.withholdingKrw).toBe(62_700);
    expect(result.payableKrw).toBe(649_800);
  });

  // 10% 세율 × 정수 공급가는 이 오차가 나지 않아 세율 설정값을 바꿔 부가세 경로를 검증한다.
  it("E-23 부가세 — 세율 설정 8.8% · 10원 절사 · 712,500 → 62,700", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.vat.rate": 0.088, "tax.rounding.vat_unit": 10 });
    const result = await applyTaxRule(
      712_500,
      { ...VAT_RULE, roundingMethod: "truncate" },
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 고치기 전 62,690
    expect(result.vatKrw).toBe(62_700);
    expect(result.payableKrw).toBe(775_200);
  });

  it("E-23 회사 대납(flat) 712,500 · 8.8% · 10원 절사 → 62,700", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      712_500,
      { ...COMPANY_BORNE_RULE, roundingMethod: "truncate" },
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 고치기 전 62,690
    expect(result.companyBorneKrw).toBe(62_700);
    expect(result.payableKrw).toBe(712_500);
  });

  // CSO-9 — 절사 방식 없이 저장된 원천징수 규칙은 시드 규칙처럼 10원 미만 절사한다.
  it("CSO-9 원천징수 절사 방식 없음 · 1,000,300 · 3.3% → 33,000(절사)", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      1_000_300,
      { ruleKind: "withholding", roundingUnit: 10, minWithholdingAmount: 0, basisDate: "payment_date" },
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE, incomeType: "business" },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.withholdingKrw).toBe(33_000);
    expect(result.payableKrw).toBe(967_300);
  });

  it("CSO-9 부가세 절사 방식 없음은 기존대로 반올림한다", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.rounding.vat_unit": 10 });
    const result = await applyTaxRule(
      1_000_060,
      { ruleKind: "vat_surcharge", roundingUnit: 10, minWithholdingAmount: 0, basisDate: "evidence_date" },
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.vatKrw).toBe(100_010);
  });
});

// 06-03 ① — 세율 사전 조회. applyTaxRule이 읽는 설정 키 전부를 한 기준일로 트랜잭션 밖에서 읽어 평범한 객체로 두고,
// 트랜잭션 안에서는 그 객체만 읽는 getSettingValue 대용(taxRatesReader)을 넣는다(06-03 tx 규약).
describe("loadTaxRates · taxRatesReader", () => {
  const ALL_KEYS = Object.keys(SETTING_VALUES);

  it("applyTaxRule이 읽는 키마다 asOf를 넘겨 한 번씩 순서대로 읽고 평범한 객체를 돌려준다", async () => {
    const getSettingValue = fakeGetSettingValue();
    const rates = await loadTaxRates("2026-09-22", { getSettingValue: getSettingValue as never });
    const keys = getSettingValue.mock.calls.map(([def]) => def.key);
    expect([...keys].sort()).toEqual([...ALL_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
    for (const [, opts] of getSettingValue.mock.calls) expect(opts?.asOf?.toISOString().slice(0, 10)).toBe("2026-09-22");
    expect(rates.asOf).toBe("2026-09-22");
    expect(rates.vatRate).toBe(0.1);
    expect(rates.withholdingUnit).toBe(10);
    expect(Object.getPrototypeOf(rates)).toBe(Object.prototype);
  });

  it("사전 조회는 키를 하나씩 순서대로 읽는다(동시에 둘 이상 대기하지 않는다)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const getSettingValue = vi.fn(async (def: { key: string }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return SETTING_VALUES[def.key];
    });
    await loadTaxRates("2026-09-22", { getSettingValue: getSettingValue as never });
    expect(maxInFlight).toBe(1);
  });

  const RULES: [string, TaxRule, Record<string, unknown>?][] = [
    ["없음", NONE_RULE],
    ["부가세", VAT_RULE],
    ["원천징수 기타", WITHHOLDING_RULE],
    ["회사 대납 flat", COMPANY_BORNE_RULE],
    ["회사 대납 gross_up", COMPANY_BORNE_RULE, { "tax.company_borne.method": "gross_up" }],
  ];
  for (const [label, rule, overrides] of RULES) {
    it(`taxRatesReader로 주입한 applyTaxRule이 실제 설정 읽기와 같은 결과다 — ${label}`, async () => {
      const real = fakeGetSettingValue(overrides);
      const date = new Date("2026-09-22T00:00:00.000Z");
      const opts = { paymentDate: date, evidenceDate: date };
      const expected = await applyTaxRule(1_234_567, rule, opts, { getSettingValue: real as never });
      const rates = await loadTaxRates("2026-09-22", { getSettingValue: fakeGetSettingValue(overrides) as never });
      const actual = await applyTaxRule(1_234_567, rule, opts, { getSettingValue: taxRatesReader(rates) });
      expect(actual).toEqual(expected);
    });
  }

  it("taxRatesReader — 사업소득 세율도 같은 결과다", async () => {
    const date = new Date("2026-09-22T00:00:00.000Z");
    const opts = { paymentDate: date, evidenceDate: date, incomeType: "business" as const };
    const expected = await applyTaxRule(1_234_567, WITHHOLDING_RULE, opts, { getSettingValue: fakeGetSettingValue() as never });
    const rates = await loadTaxRates("2026-09-22", { getSettingValue: fakeGetSettingValue() as never });
    expect(await applyTaxRule(1_234_567, WITHHOLDING_RULE, opts, { getSettingValue: taxRatesReader(rates) })).toEqual(expected);
  });

  it("taxRatesReader는 다른 날짜의 이력 키를 물으면 던진다(조용히 전역 db로 새지 않는다)", async () => {
    const rates = await loadTaxRates("2026-09-22", { getSettingValue: fakeGetSettingValue() as never });
    const other = new Date("2026-09-23T00:00:00.000Z");
    await expect(
      applyTaxRule(1_000_000, VAT_RULE, { paymentDate: other, evidenceDate: other }, { getSettingValue: taxRatesReader(rates) }),
    ).rejects.toThrow();
  });

  it("미래 날짜 asOf도 그날 유효한 이력 값을 읽는다(RS-11)", async () => {
    // 2027-01-01부터 부가세율 12% — 적용일 ≤ 기준일 중 가장 늦은 값.
    const getSettingValue = vi.fn((def: { key: string }, opts?: { asOf?: Date }) => {
      if (def.key === "tax.vat.rate") return Promise.resolve((opts?.asOf?.toISOString().slice(0, 10) ?? "") >= "2027-01-01" ? 0.12 : 0.1);
      return Promise.resolve(SETTING_VALUES[def.key]);
    });
    const rates = await loadTaxRates("2027-03-01", { getSettingValue: getSettingValue as never });
    expect(rates.vatRate).toBe(0.12);
    expect(rates.asOf).toBe("2027-03-01");
  });
});
