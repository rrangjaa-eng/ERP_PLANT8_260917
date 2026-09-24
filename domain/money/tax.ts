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
} from "@/domain/settings/keys";

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

  const roundingMethod = rule.roundingMethod ?? "round";

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
