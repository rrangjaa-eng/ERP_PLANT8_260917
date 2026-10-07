// domain/money/tax.ts — 04-02 Task 1 ②. 증빙 종류별 세금 규칙 계산. 규칙
// 종류 네 값과 필드 이름의 정본은 domain/code-tables/tax-rule.ts의
// taxRuleSchema다 — 여기서 새로 정의하지 않는다. 이 파일은 domain/money의
// 일부라 `plant8/money-boundary` 경계 안이다.
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { round, type RoundingUnit } from "@/domain/money";
import {
  getSettingValue as defaultGetSettingValue,
  type SettingDef,
} from "@/domain/settings/registry";
import {
  TAX_VAT_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD,
  TAX_COMPANY_BORNE_RATE,
  TAX_COMPANY_BORNE_METHOD,
  TAX_BASIS_DATE_WITHHOLDING,
  TAX_BASIS_DATE_VAT,
  TAX_ROUNDING_VAT_UNIT,
  TAX_ROUNDING_WITHHOLDING_UNIT,
  TAX_ROUNDING_MIN_WITHHOLDING,
  type TaxBasisDate,
  type TaxCompanyBorneMethod,
} from "@/domain/settings/keys";
import { seoulDateToUtcDate } from "@/lib/dates";

export type TaxIncomeType = "other" | "business";

// ARCHITECTURE §4-2: 원천징수·회사 대납은 지급일, 부가세는 증빙일이
// 기준일이다 — **어느 날짜를 넘길지는 호출자의 책임**이다. 이 두 날짜가
// 그 규약의 구현이다.
export type ApplyTaxRuleOpts = {
  paymentDate: Date;
  evidenceDate: Date;
  /** 원천징수(withholding) 규칙에서만 쓴다. 기본 "other"(기타소득). */
  incomeType?: TaxIncomeType;
};

export type TaxRuleResult = {
  vatKrw: number;
  withholdingKrw: number;
  companyBorneKrw: number;
  payableKrw: number;
};

export type TaxRuleDeps = {
  getSettingValue: typeof defaultGetSettingValue;
};

async function readSetting<T>(
  getValue: typeof defaultGetSettingValue,
  def: SettingDef<T>,
  asOf?: Date,
): Promise<T> {
  return getValue(def, asOf ? { asOf } : {});
}

// 세율은 이력형 설정이 정본이다(taxRuleSchema에 세율 필드가 없다) — 반드시
// 기준일을 넘겨 조회한다. 절사 단위·최소 징수액도 설정에서 읽고, 절사
// 방식만 코드표의 rule.roundingMethod를 쓴다(설정에 절사 방식 키가 없다).
export async function applyTaxRule(
  supplyKrw: number,
  rule: TaxRule,
  opts: ApplyTaxRuleOpts,
  deps?: Partial<TaxRuleDeps>,
): Promise<TaxRuleResult> {
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;

  // 기준일 종류 설정 — 값 자체는 읽되(설정 화면에 뜨는 값이 실제로 쓰인다는
  // 것을 고정), 실제 날짜 선택은 위 ApplyTaxRuleOpts 문서화대로 호출자가
  // 넘긴 두 날짜(paymentDate/evidenceDate)를 따른다. 이 두 조회는 simple
  // kind라 기준일이 없다 — "기준일 없이 읽는 호출 0건" 기준은 historized
  // 키(세율·절사 단위·최소 징수액)에 적용된다.
  await readSetting(getValue, TAX_BASIS_DATE_WITHHOLDING);
  await readSetting(getValue, TAX_BASIS_DATE_VAT);

  if (rule.ruleKind === "none") {
    return { vatKrw: 0, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: supplyKrw };
  }

  // 절사 방식이 없으면 원천징수는 시드 규칙처럼 절사, 나머지는 반올림이다(CSO-9).
  const roundingMethod = rule.roundingMethod ?? (rule.ruleKind === "withholding" ? "truncate" : "round");

  if (rule.ruleKind === "vat_surcharge") {
    const vatRate = await readSetting(getValue, TAX_VAT_RATE, opts.evidenceDate);
    const unit = (await readSetting(getValue, TAX_ROUNDING_VAT_UNIT, opts.evidenceDate)) as RoundingUnit;
    const vatKrw = round(supplyKrw * vatRate, unit, roundingMethod);
    return { vatKrw, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: supplyKrw + vatKrw };
  }

  if (rule.ruleKind === "withholding") {
    const incomeType = opts.incomeType ?? "other";
    const rateDef = incomeType === "business" ? TAX_WITHHOLDING_BUSINESS_INCOME_RATE : TAX_WITHHOLDING_OTHER_INCOME_RATE;
    const rate = await readSetting(getValue, rateDef, opts.paymentDate);
    const unit = (await readSetting(getValue, TAX_ROUNDING_WITHHOLDING_UNIT, opts.paymentDate)) as RoundingUnit;
    const minWithholding = await readSetting(getValue, TAX_ROUNDING_MIN_WITHHOLDING, opts.paymentDate);

    if (incomeType === "other") {
      const exemptThreshold = await readSetting(
        getValue,
        TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD,
        opts.paymentDate,
      );
      if (supplyKrw <= exemptThreshold) {
        return { vatKrw: 0, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: supplyKrw };
      }
    }

    let withholdingKrw = round(supplyKrw * rate, unit, roundingMethod);
    if (withholdingKrw < minWithholding) withholdingKrw = 0;

    return { vatKrw: 0, withholdingKrw, companyBorneKrw: 0, payableKrw: supplyKrw - withholdingKrw };
  }

  // company_borne — 수령자는 공급가를 온전히 받고, 회사가 그 위에 세금을
  // 대신 부담한다. flat = 공급가 × 세율. gross-up = 세후 실수령액이
  // 공급가가 되도록 역산한 총액에서 공급가를 뺀 값.
  const rate = await readSetting(getValue, TAX_COMPANY_BORNE_RATE, opts.paymentDate);
  const method = await readSetting(getValue, TAX_COMPANY_BORNE_METHOD, opts.paymentDate);
  const unit = (await readSetting(getValue, TAX_ROUNDING_WITHHOLDING_UNIT, opts.paymentDate)) as RoundingUnit;

  let companyBorneKrw: number;
  if (method === "flat") {
    companyBorneKrw = round(supplyKrw * rate, unit, roundingMethod);
  } else {
    const gross = supplyKrw / (1 - rate);
    companyBorneKrw = round(gross - supplyKrw, unit, roundingMethod);
  }

  return { vatKrw: 0, withholdingKrw: 0, companyBorneKrw, payableKrw: supplyKrw };
}

// ── 06-03 ① 세율 사전 조회 ──────────────────────────────────────────────
// applyTaxRule이 readSetting으로 읽는 설정 키 전부를 한 기준일(서울 날짜)로 읽은 평범한 객체. 전역 풀을 읽으므로
// 트랜잭션 **밖**에서만 부른다(06-03 tx 규약 — 트랜잭션 안에서 설정을 읽으면 풀 고갈 교착, PR #75).
// 절사 방식은 코드표 rule.roundingMethod라 담지 않는다. 06-05 카드가 같은 TaxRates를 쓴다.
export type TaxRates = {
  asOf: string;
  vatRate: number;
  vatUnit: number;
  withholdingOtherRate: number;
  withholdingBusinessRate: number;
  withholdingOtherExemptThreshold: number;
  withholdingUnit: number;
  minWithholding: number;
  companyBorneRate: number;
  companyBorneMethod: TaxCompanyBorneMethod;
  basisWithholding: TaxBasisDate;
  basisVat: TaxBasisDate;
};

// 키를 하나씩 순서대로 읽는다 — 사전 조회가 풀 커넥션을 하나만 잡게(CROSS-R1 R-4).
export async function loadTaxRates(asOf: string, deps?: Partial<TaxRuleDeps>): Promise<TaxRates> {
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const at = { asOf: seoulDateToUtcDate(asOf) };
  const vatRate = await getValue(TAX_VAT_RATE, at);
  const vatUnit = await getValue(TAX_ROUNDING_VAT_UNIT, at);
  const withholdingOtherRate = await getValue(TAX_WITHHOLDING_OTHER_INCOME_RATE, at);
  const withholdingBusinessRate = await getValue(TAX_WITHHOLDING_BUSINESS_INCOME_RATE, at);
  const withholdingOtherExemptThreshold = await getValue(TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD, at);
  const withholdingUnit = await getValue(TAX_ROUNDING_WITHHOLDING_UNIT, at);
  const minWithholding = await getValue(TAX_ROUNDING_MIN_WITHHOLDING, at);
  const companyBorneRate = await getValue(TAX_COMPANY_BORNE_RATE, at);
  const companyBorneMethod = await getValue(TAX_COMPANY_BORNE_METHOD, at);
  const basisWithholding = await getValue(TAX_BASIS_DATE_WITHHOLDING, at);
  const basisVat = await getValue(TAX_BASIS_DATE_VAT, at);
  return {
    asOf,
    vatRate,
    vatUnit,
    withholdingOtherRate,
    withholdingBusinessRate,
    withholdingOtherExemptThreshold,
    withholdingUnit,
    minWithholding,
    companyBorneRate,
    companyBorneMethod,
    basisWithholding,
    basisVat,
  };
}

// applyTaxRule의 deps.getSettingValue 자리에 넣는 읽기 함수 — rates만 읽고 DB를 읽지 않는다. 이력 키는 넘어온 asOf의
// 날짜가 rates.asOf와 같을 때만 주고(날짜는 getSettingValue와 같은 `toISOString().slice(0, 10)` — seoulDateToUtcDate의
// 역), 다르거나 없으면 던진다. 모르는 키도 던진다(조용히 전역 db로 새지 않는다).
export function taxRatesReader(rates: TaxRates): typeof defaultGetSettingValue {
  const values: Record<string, unknown> = {
    [TAX_VAT_RATE.key]: rates.vatRate,
    [TAX_ROUNDING_VAT_UNIT.key]: rates.vatUnit,
    [TAX_WITHHOLDING_OTHER_INCOME_RATE.key]: rates.withholdingOtherRate,
    [TAX_WITHHOLDING_BUSINESS_INCOME_RATE.key]: rates.withholdingBusinessRate,
    [TAX_WITHHOLDING_OTHER_INCOME_EXEMPT_THRESHOLD.key]: rates.withholdingOtherExemptThreshold,
    [TAX_ROUNDING_WITHHOLDING_UNIT.key]: rates.withholdingUnit,
    [TAX_ROUNDING_MIN_WITHHOLDING.key]: rates.minWithholding,
    [TAX_COMPANY_BORNE_RATE.key]: rates.companyBorneRate,
    [TAX_COMPANY_BORNE_METHOD.key]: rates.companyBorneMethod,
    [TAX_BASIS_DATE_WITHHOLDING.key]: rates.basisWithholding,
    [TAX_BASIS_DATE_VAT.key]: rates.basisVat,
  };
  return (def, opts) => {
    if (!Object.hasOwn(values, def.key)) throw new Error(`세율 사전 조회에 없는 키: ${def.key}`);
    if (def.kind === "historized") {
      const asked = opts?.asOf ? opts.asOf.toISOString().slice(0, 10) : null;
      if (asked !== rates.asOf) throw new Error(`세율 사전 조회 기준일(${rates.asOf})과 다른 날짜(${asked ?? "없음"})로 읽음: ${def.key}`);
    }
    return Promise.resolve(def.schema.parse(values[def.key]));
  };
}
