import { describe, expect, it, vi } from "vitest";
import { applyTaxRule, companyBorneExempt, loadTaxRates, taxRatesReader } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { RETIRED_SETTING_KEYS } from "@/domain/settings/keys";

// 04-02 Task 1 ② — 세금 규칙 네 종류 × 절사 단위·방식 조합, 최소 징수액
// 경계. 설정 조회는 deps 주입으로 고정값을 넣어 DB 없이 돈다
// (domain/vendors/index.ts의 deps?: Partial<X> 패턴).
const PAYMENT_DATE = new Date("2026-09-22");
const EVIDENCE_DATE = new Date("2026-09-15");

const SETTING_VALUES: Record<string, unknown> = {
  "tax.vat.rate": 0.1,
  "tax.withholding.business_income.rate": 0.033,
  "tax.company_borne.rate": 0.088,
  "tax.company_borne.exempt_threshold": 50_000,
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
    // 06.5 D-6501 — 원천징수는 사업소득 세율 하나: 1,000,000 * 0.033 = 33,000 (10원 단위 반올림 — 이미 10원 단위)
    expect(result.withholdingKrw).toBe(33_000);
    expect(result.payableKrw).toBe(967_000);
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
    const rateCall = getSettingValue.mock.calls.find(([def]) => def.key === "tax.withholding.business_income.rate");
    expect(rateCall?.[1]).toEqual({ asOf: PAYMENT_DATE });
  });

  // 06.5 D-6501 — 기타소득 8.8% 원천징수 경로와 그 면제 기준(125,000)이 없다. 사업소득 원천징수에는 면제 기준이 없다.
  it("원천징수(사업소득)에는 면제 기준이 없다 — 100,000 × 3.3% = 3,300", async () => {
    const getSettingValue = fakeGetSettingValue();
    const result = await applyTaxRule(
      100_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    expect(result.withholdingKrw).toBe(3_300);
    expect(result.payableKrw).toBe(96_700);
  });

  it("계산된 원천징수액이 설정된 최소 징수액 미만이면 0이다", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.rounding.min_withholding": 100_000 });
    const result = await applyTaxRule(
      1_000_000,
      WITHHOLDING_RULE,
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
      { getSettingValue: getSettingValue as never },
    );
    // 계산값 33,000 < 최소 징수액 100,000 → 0
    expect(result.withholdingKrw).toBe(0);
  });

  it.each(["truncate", "round", "ceil"] as const)("원천징수 절사 방식 %s가 적용된다", async (roundingMethod) => {
    const getSettingValue = fakeGetSettingValue({ "tax.withholding.business_income.rate": 0.0885 });
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
    const deps = { getSettingValue: fakeGetSettingValue({ "tax.withholding.business_income.rate": rate }) as never };
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

  // 06.5 D-6501 — 8.8%는 기타소득 기본값이 아니라 세율 설정을 바꿔 부동소수 경계를 검증한다(부가세 E-23과 같은 꼴).
  it("E-23 원천징수 — 세율 설정 8.8% · 712,500 · 10원 절사 → 62,700", async () => {
    const getSettingValue = fakeGetSettingValue({ "tax.withholding.business_income.rate": 0.088 });
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
      { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE },
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
    ["원천징수(사업소득)", WITHHOLDING_RULE],
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

  it("taxRatesReader는 06.5 D-6501에서 지운 기타소득 두 키를 물으면 「세율 사전 조회에 없는 키」로 던진다", async () => {
    const rates = await loadTaxRates("2026-09-22", { getSettingValue: fakeGetSettingValue() as never });
    const read = taxRatesReader(rates);
    const asOf = new Date("2026-09-22T00:00:00.000Z");
    expect(RETIRED_SETTING_KEYS).toHaveLength(2);
    for (const key of RETIRED_SETTING_KEYS) {
      expect(() => read({ key, kind: "historized" } as never, { asOf })).toThrow(`세율 사전 조회에 없는 키: ${key}`);
    }
    expect(rates.companyBorneExemptThreshold).toBe(50_000);
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

// 06.5 D-6501 · 카드 ① · 카드 ⓪(사용자 카드 10/13 23:29 · 23:30 KST) — 기타소득은 회사 대납 22% 역산 한 가지이고, 면제는 받는 사람
// 한 명 몫 공급가의 세전 금액(공급가 ÷ (1 − 세율)) ≤ 기준(50,000)이다. 기대값은 식으로 셈한 값이다(코드 실행 결과를 옮겨 적지 않는다).
describe("회사 대납 면제 — 한 사람 몫 세전 5만원 이하(06.5 D-6501)", () => {
  const GROSS_UP = { "tax.company_borne.rate": 0.22, "tax.company_borne.method": "gross_up" };
  const RULE: TaxRule = { ...COMPANY_BORNE_RULE, roundingMethod: "truncate" };
  const at = { paymentDate: PAYMENT_DATE, evidenceDate: EVIDENCE_DATE };
  const run = (supply: number, overrides: Record<string, unknown> = GROSS_UP, recipientCount?: number) =>
    applyTaxRule(supply, RULE, { ...at, ...(recipientCount === undefined ? {} : { recipientCount }) }, { getSettingValue: fakeGetSettingValue(overrides) as never });

  it.each([
    // [공급가, 회사 대납 세금] — 세금 = (공급가 ÷ 0.78 − 공급가)를 10원 미만 절사, 세전 ≤ 50,000이면 0
    [100_000, 28_200], // 128,205.1 − 100,000 = 28,205.1
    [39_000, 0], // 세전 50,000 — 경계 포함 면제
    [39_010, 11_000], // 세전 50,012.8 → 11,002.8
    [45_000, 12_690], // 57,692.3 − 45,000 = 12,692.3
    [0, 0],
  ])("gross_up · 받는 인원 1 · 공급가 %s → 회사 대납 세금 %s · 지급 총액 = 공급가", async (supply, tax) => {
    expect(await run(supply)).toEqual({ vatKrw: 0, withholdingKrw: 0, companyBorneKrw: tax, payableKrw: supply });
  });

  it.each([
    [195_000, 5, 0], // 한 사람 몫 39,000 = 세전 50,000
    [195_005, 5, 55_000], // 한 사람 몫 39,001 — 사람별 11,000.28 → 11,000 × 5
    [150_000, 1, 42_300], // 192,307.7 − 150,000 = 42,307.7
  ])("받는 인원 곱 — 공급가 %s · %s명 → 회사 대납 세금 %s", async (supply, recipientCount, tax) => {
    expect((await run(supply, GROSS_UP, recipientCount)).companyBorneKrw).toBe(tax);
  });

  // 06.5 D-6521(사용자 카드 10/15 11:37 KST): 세액은 사람별로 셈해 더한다 — 공급가를 받는 인원으로 나눈 한 사람 몫마다 역산 ·
  // 10원 미만 절사 · 면제 판정을 하고 합한다. 나머지 원은 앞사람부터 1원씩 얹는다(몫 합 = 공급가).
  it.each([
    // [공급가, 인원, 세금, 식]
    [120_060, 3, 33_840], // 40,020 × 3 — 사람별 11,287.7 → 11,280 × 3 (합계 한 번이면 33,863.1 → 33,860)
    [117_000, 3, 0], // 39,000 × 3 — 모두 세전 50,000 경계 면제
    [117_003, 3, 33_000], // 39,001 × 3 — 사람별 11,000.28 → 11,000 × 3
    [117_001, 3, 11_000], // 39,001 · 39,000 · 39,000 — 첫 사람만 과세(합계 한 번이면 33,000)
    [120_061, 3, 33_840], // 40,021 · 40,020 · 40,020 — 11,287.97 → 11,280 · 11,280 · 11,280
    [2, 3, 0], // 1 · 1 · 0 — 모두 면제
  ])("사람별 셈 — 공급가 %s · %s명 → 회사 대납 세금 %s", async (supply, recipientCount, tax) => {
    expect(await run(supply, GROSS_UP, recipientCount)).toEqual({ vatKrw: 0, withholdingKrw: 0, companyBorneKrw: tax, payableKrw: supply });
  });

  it("사람별 셈 — flat도 한 사람 몫마다 절사해 더한다", async () => {
    // 40,045 × 3 — 8,809.9 → 8,800 × 3 = 26,400 (합계 한 번이면 26,429.7 → 26,420)
    expect((await run(120_135, { "tax.company_borne.rate": 0.22, "tax.company_borne.method": "flat" }, 3)).companyBorneKrw).toBe(26_400);
  });

  it("사람별 셈 — 받는 인원이 아주 커도 몫 두 값으로 바로 센다", async () => {
    // 2,147,483,647명 · 공급가 2,147,483,647 × 40,020 — 모두 40,020 몫이라 11,280 × 인원
    const n = 2_147_483_647;
    expect((await run(n * 40_020, GROSS_UP, n)).companyBorneKrw).toBe(n * 11_280);
  });

  it.each([
    // [공급가, 세금] — 면제 잣대는 계산 방식과 무관하게 세전 금액, 세금은 공급가 × 22% 절사
    [39_000, 0],
    [39_010, 8_580], // 8,582.2
    [100_000, 22_000],
  ])("flat에서도 면제 잣대는 세전 금액 — 공급가 %s → %s", async (supply, tax) => {
    expect((await run(supply, { "tax.company_borne.rate": 0.22, "tax.company_borne.method": "flat" })).companyBorneKrw).toBe(tax);
  });

  it("면제 기준은 지급일 기준으로 읽는다", async () => {
    const getSettingValue = fakeGetSettingValue(GROSS_UP);
    await applyTaxRule(39_000, RULE, at, { getSettingValue: getSettingValue as never });
    const call = getSettingValue.mock.calls.find(([def]) => def.key === "tax.company_borne.exempt_threshold");
    expect(call?.[1]).toEqual({ asOf: PAYMENT_DATE });
  });

  it("companyBorneExempt는 큰 금액에서도 정수로 판정한다(부동소수 없음)", () => {
    // 9조 ÷ 0.78 = 11,538,461,538,461.5… — 기준이 그 위면 면제, 아래면 과세.
    expect(companyBorneExempt({ supplyKrw: 9_000_000_000_000, rate: 0.22, thresholdKrw: 11_538_461_538_462, recipientCount: 1 })).toBe(true);
    expect(companyBorneExempt({ supplyKrw: 9_000_000_000_000, rate: 0.22, thresholdKrw: 11_538_461_538_461, recipientCount: 1 })).toBe(false);
    expect(companyBorneExempt({ supplyKrw: 9_000_000_000_000, rate: 0.22, thresholdKrw: 50_000, recipientCount: 1 })).toBe(false);
  });
});
