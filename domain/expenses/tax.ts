import type { Viewer } from "@/domain/viewer";
import { applyTaxRule, type TaxIncomeType } from "@/domain/money/tax";
import { taxRuleSchema, type TaxRule, type TaxRuleKind } from "@/domain/code-tables/tax-rule";
import {
  getSettingEntry as defaultGetSettingEntry,
  getSettingValue as defaultGetSettingValue,
  SettingNotFoundError,
  type SettingDef,
} from "@/domain/settings/registry";
import {
  TAX_COMPANY_BORNE_METHOD,
  TAX_COMPANY_BORNE_RATE,
  TAX_VAT_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
  type TaxCompanyBorneMethod,
} from "@/domain/settings/keys";
import { listCodeItems } from "@/repositories/code-tables";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";

// 05-03(Pattern 2) — 지출결의의 세금 호출자. 계산은 domain/money/tax.ts의 applyTaxRule 하나이고, 이 파일은 그 함수에
// 넘길 날짜 · 소득 종류 · 세율 행을 고른다. 06-03이 같은 파일 · 같은 이름을 확장한다.

// D-101 대체 사슬: 지급 쪽(원천징수 · 회사 대납) = 지급일(Phase 6 전에는 없음) → 지급 예정일 → 서울 오늘,
// 증빙 쪽(부가세) = 증빙일(이 페이즈에 칸 없음) → 작성일(문서 created_at의 서울 날짜).
export type TaxDateSource = {
  paidDate?: string | null;
  scheduledPaymentDate: string | null;
  evidenceDate?: string | null;
  createdAt: Date;
};

export function pickTaxDates(doc: TaxDateSource, opts: { todayKst: string }): { paymentDate: string; evidenceDate: string } {
  return {
    paymentDate: doc.paidDate ?? doc.scheduledPaymentDate ?? opts.todayKst,
    evidenceDate: doc.evidenceDate ?? kstDateOf(doc.createdAt),
  };
}

// 사업소득 증빙만 사업소득 세율(3.3%) — 그 밖은 기타소득(applyTaxRule 기본).
export function incomeTypeFor(evidenceType: string | null): TaxIncomeType {
  return evidenceType === "business_income" ? "business" : "other";
}

export type ExpenseTaxDeps = {
  getSettingEntry: typeof defaultGetSettingEntry;
  getSettingValue: typeof defaultGetSettingValue;
  listCodeItems: typeof listCodeItems;
  now: Date;
};

export type AppliedRate = {
  key: string;
  rate: number;
  historizedId: string | null;
  effectiveFrom: string | null;
  method?: TaxCompanyBorneMethod;
  // 세율을 읽은 기준일(서울 날짜) — 부가세는 증빙 쪽, 원천징수 · 회사 대납은 지급 쪽(domain/money/tax.ts와 같은 선택).
  basisDate: string;
};

type RatedRuleKind = Exclude<TaxRuleKind, "none">;

function rateDefFor(ruleKind: RatedRuleKind, incomeType: TaxIncomeType): SettingDef<number> {
  if (ruleKind === "vat_surcharge") return TAX_VAT_RATE;
  if (ruleKind === "withholding") return incomeType === "business" ? TAX_WITHHOLDING_BUSINESS_INCOME_RATE : TAX_WITHHOLDING_OTHER_INCOME_RATE;
  return TAX_COMPANY_BORNE_RATE;
}

// 세금 계산이 그 규칙에서 읽는 세율 키 하나를 같은 기준일로 다시 읽어 이력 행 id · 적용일과 함께 돌려준다(스냅숏 재료).
// 규칙 없음(none)이면 null.
export async function resolveAppliedRate(
  rule: TaxRule,
  dates: { paymentDate: string; evidenceDate: string; incomeType: TaxIncomeType },
  deps?: Partial<ExpenseTaxDeps>,
): Promise<AppliedRate | null> {
  if (rule.ruleKind === "none") return null;
  const getEntry = deps?.getSettingEntry ?? defaultGetSettingEntry;
  const basisDate = rule.ruleKind === "vat_surcharge" ? dates.evidenceDate : dates.paymentDate;
  const asOf = seoulDateToUtcDate(basisDate);
  const def = rateDefFor(rule.ruleKind, dates.incomeType);
  const entry = await getEntry(def, { asOf });
  const applied: AppliedRate = { key: def.key, rate: entry.value, historizedId: entry.historizedId, effectiveFrom: entry.effectiveFrom, basisDate };
  if (rule.ruleKind === "company_borne") {
    applied.method = await (deps?.getSettingValue ?? defaultGetSettingValue)(TAX_COMPANY_BORNE_METHOD, { asOf });
  }
  return applied;
}

export type ExpenseTaxSource = TaxDateSource & { evidenceType: string | null; supplyAmountKrw: number | null };

export type ExpenseTaxResult =
  | {
      unavailable?: false;
      ruleKind: TaxRuleKind;
      rate: number | null;
      historizedId: string | null;
      rateEffectiveFrom: string | null;
      method: TaxCompanyBorneMethod | null;
      basisDate: string | null;
      vatKrw: number;
      withholdingKrw: number;
      companyBorneKrw: number;
      payableKrw: number;
    }
  | { unavailable: true };

// 증빙 종류 코드 항목의 세금 규칙 → 기준일 · 소득 종류 · 세율 행 → 세금 계산 한 번. 증빙 종류 · 공급가액이 비었거나
// 규칙이 없거나 세율이 없으면 unavailable.
export async function computeExpenseTax(
  viewer: Viewer,
  doc: ExpenseTaxSource,
  deps?: Partial<ExpenseTaxDeps>,
): Promise<ExpenseTaxResult> {
  if (!doc.evidenceType || doc.supplyAmountKrw === null) return { unavailable: true };
  const items = await (deps?.listCodeItems ?? listCodeItems)(viewer, {
    tableKey: "evidence_type",
    scope: { rows: "all", includeArchived: true },
    includeInactive: true,
  });
  const parsed = taxRuleSchema.safeParse(items.find((item) => item.value === doc.evidenceType)?.taxRule);
  if (!parsed.success) return { unavailable: true };
  const rule = parsed.data;

  const dates = pickTaxDates(doc, { todayKst: seoulToday(deps?.now) });
  const incomeType = incomeTypeFor(doc.evidenceType);
  try {
    const applied = await resolveAppliedRate(rule, { ...dates, incomeType }, deps);
    const amounts = await applyTaxRule(
      doc.supplyAmountKrw,
      rule,
      { paymentDate: seoulDateToUtcDate(dates.paymentDate), evidenceDate: seoulDateToUtcDate(dates.evidenceDate), incomeType },
      deps?.getSettingValue ? { getSettingValue: deps.getSettingValue } : undefined,
    );
    return {
      ruleKind: rule.ruleKind,
      rate: applied?.rate ?? null,
      historizedId: applied?.historizedId ?? null,
      rateEffectiveFrom: applied?.effectiveFrom ?? null,
      method: applied?.method ?? null,
      basisDate: applied?.basisDate ?? null,
      ...amounts,
    };
  } catch (error) {
    if (error instanceof SettingNotFoundError) return { unavailable: true };
    throw error;
  }
}
