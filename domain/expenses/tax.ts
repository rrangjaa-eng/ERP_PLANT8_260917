import type { Viewer } from "@/domain/viewer";
import { applyTaxRule, type TaxIncomeType } from "@/domain/money/tax";
import { taxRuleSchema, type TaxRule, type TaxRuleBasisDate, type TaxRuleKind } from "@/domain/code-tables/tax-rule";
import {
  getSettingEntry as defaultGetSettingEntry,
  getSettingValue as defaultGetSettingValue,
  SettingNotFoundError,
  type SettingDef,
} from "@/domain/settings/registry";
import {
  TAX_BASIS_DATE_VAT,
  TAX_BASIS_DATE_WITHHOLDING,
  TAX_COMPANY_BORNE_METHOD,
  TAX_COMPANY_BORNE_RATE,
  TAX_VAT_RATE,
  TAX_WITHHOLDING_BUSINESS_INCOME_RATE,
  TAX_WITHHOLDING_OTHER_INCOME_RATE,
  type TaxBasisDate,
  type TaxCompanyBorneMethod,
} from "@/domain/settings/keys";
import { listCodeItems } from "@/repositories/code-tables";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { formatKrw } from "@/lib/format-number";
import { formatRatePercent, type Money } from "@/domain/money";

// 05-03(Pattern 2) — 지출결의의 세금 호출자. 계산은 domain/money/tax.ts의 applyTaxRule 하나이고, 이 파일은 그 함수에
// 넘길 날짜 · 소득 종류 · 세율 행을 고른다. 06-03이 같은 파일 · 같은 이름을 확장한다.

// D-101 대체 사슬(05-06 전 사슬): 기준일 종류 = 증빙 종류 코드 항목의 taxRule.basisDate가 있으면 그것, 없으면 규칙 종류의 설정
// (원천징수 · 회사 대납 → tax.basis_date.withholding, 부가세 → tax.basis_date.vat). 날짜 사슬은 D-101 기본값 —
// 지급일(Phase 6 전에는 없음) → 지급 예정일 → 서울 오늘 / 증빙일 · 발행일(이 페이즈에 칸 없음) → 작성일(created_at의 서울 날짜).
// 고른 날짜는 applyTaxRule이 그 규칙에서 읽는 슬롯(원천징수 · 회사 대납 = paymentDate, 부가세 = evidenceDate — domain/money/tax.ts
// 규약)에 들어간다 — 두 슬롯에 같은 날짜를 넣으므로 규칙이 어느 슬롯을 읽어도 같은 기준일이다.
export type TaxDateSource = {
  paidDate?: string | null;
  scheduledPaymentDate: string | null;
  evidenceDate?: string | null;
  createdAt: Date;
};

export type TaxBasisKind = TaxRuleBasisDate | TaxBasisDate;

export type PickedTaxDates = { basisKind: TaxBasisKind; basisDate: string; applyOpts: { paymentDate: string; evidenceDate: string } };

export function pickTaxDates(
  doc: TaxDateSource,
  opts: { ruleKind: TaxRuleKind; codeBasis: TaxRuleBasisDate | undefined; basisWithholding: TaxBasisDate; basisVat: TaxBasisDate; todayKst: string },
): PickedTaxDates {
  const basisKind: TaxBasisKind = opts.codeBasis ?? (opts.ruleKind === "vat_surcharge" ? opts.basisVat : opts.basisWithholding);
  const documentDate = kstDateOf(doc.createdAt);
  const scheduled = doc.scheduledPaymentDate ?? opts.todayKst;
  const byKind: Record<TaxBasisKind, string> = {
    payment_date: doc.paidDate ?? scheduled,
    scheduled_payment_date: scheduled,
    evidence_date: doc.evidenceDate ?? documentDate,
    issue_date: documentDate,
    document_date: documentDate,
  };
  const basisDate = byKind[basisKind];
  return { basisKind, basisDate, applyOpts: { paymentDate: basisDate, evidenceDate: basisDate } };
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
  dates: { basisDate: string; incomeType: TaxIncomeType },
  deps?: Partial<ExpenseTaxDeps>,
): Promise<AppliedRate | null> {
  if (rule.ruleKind === "none") return null;
  const getEntry = deps?.getSettingEntry ?? defaultGetSettingEntry;
  const { basisDate } = dates;
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

  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const [basisWithholding, basisVat] = await Promise.all([getValue(TAX_BASIS_DATE_WITHHOLDING), getValue(TAX_BASIS_DATE_VAT)]);
  const dates = pickTaxDates(doc, { ruleKind: rule.ruleKind, codeBasis: rule.basisDate, basisWithholding, basisVat, todayKst: seoulToday(deps?.now) });
  const incomeType = incomeTypeFor(doc.evidenceType);
  try {
    const applied = await resolveAppliedRate(rule, { basisDate: dates.basisDate, incomeType }, deps);
    // 세율 키는 위에서 읽은 행의 값을 그대로 쓴다 — 스냅숏 세율과 금액이 한 번의 읽기에서 나온다(05-06 돈 검토 m1).
    const getValueOnce: typeof defaultGetSettingValue = (def, opts) =>
      applied && def.key === applied.key ? Promise.resolve(def.schema.parse(applied.rate)) : getValue(def, opts);
    const amounts = await applyTaxRule(
      doc.supplyAmountKrw,
      rule,
      { paymentDate: seoulDateToUtcDate(dates.applyOpts.paymentDate), evidenceDate: seoulDateToUtcDate(dates.applyOpts.evidenceDate), incomeType },
      { getSettingValue: getValueOnce },
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

// ── 계산 한 줄 문자열 ────────────────────────────────────────────────────────
// 05-05(UI-SPEC Copywriting 「표시 — 계산 한 줄」 · S5): 세금 결과 → 한 줄 글자. 계산은 위 applyTaxRule 하나이고 이 함수는 글자만 만든다.
// `emphasis` 조각(세율 · 금액)만 화면이 `Num` 700으로 그린다 — 조각을 이어 붙인 결과가 text와 같다. 05-06이 즉시 재계산 · 세율 바뀜을 더한다.

export type TaxLinePart = { text: string; emphasis: boolean };

const SEP: TaxLinePart = { text: " · ", emphasis: false };

export function taxLineText(result: ExpenseTaxResult, supply: Money, ruleLabel: string): { text: string; parts: TaxLinePart[] } {
  const label = (text: string, ...numbers: string[]): TaxLinePart[] => [
    { text, emphasis: false },
    ...numbers.flatMap((number): TaxLinePart[] => [{ text: " ", emphasis: false }, { text: number, emphasis: true }]),
  ];
  const segments: TaxLinePart[][] = [];
  if (result.unavailable) {
    segments.push([{ text: "계산 불가 · 세율 없음", emphasis: false }]);
  } else {
    if (supply.currency !== "KRW") segments.push(label("원화", formatKrw(supply.amountKrw)));
    const rate = result.rate === null ? null : formatRatePercent(result.rate);
    if (result.ruleKind === "vat_surcharge") {
      segments.push(label("부가세", ...(rate ? [rate] : []), formatKrw(result.vatKrw)), label("지급 총액", formatKrw(result.payableKrw)));
    } else if (result.ruleKind === "withholding") {
      if (result.withholdingKrw === 0) {
        segments.push(label("원천징수", "0"), [{ text: "면제 기준 이하", emphasis: false }]);
      } else {
        segments.push(label("원천징수", ...(rate ? [rate] : []), formatKrw(result.withholdingKrw)));
      }
      segments.push(label("실지급액", formatKrw(result.payableKrw)));
    } else if (result.ruleKind === "company_borne") {
      segments.push(label("회사 대납 세금", ...(rate ? [rate] : []), formatKrw(result.companyBorneKrw)), label("지급 총액", formatKrw(result.payableKrw)));
    } else {
      segments.push(label("지급 총액", formatKrw(result.payableKrw)));
    }
    segments.push([{ text: ruleLabel, emphasis: false }]);
  }
  const parts = segments.flatMap((segment, index) => (index === 0 ? segment : [SEP, ...segment]));
  return { text: parts.map((part) => part.text).join(""), parts };
}

// ── 세율 바뀜 ────────────────────────────────────────────────────────────
// 05-06(기준 7 · UI-SPEC Copywriting 「표시 — 세율 바뀜」 · B1 Round 2): 저장 스냅숏으로 만든 결과 대 지금 설정 · 기준일로 다시 계산한
// 결과 — 세율 · 세액 · 지급 총액이 모두 같으면 null. 스냅숏의 이력 행 id로 설정 이력을 다시 읽지 않는다(값 비교만 — 예정 세율이
// 취소돼 행이 없어도 한 줄이 그대로 나온다). 지금 계산이 불가면 비교할 값이 없어 null. 조각 모양은 taxLineText와 같다.
const DRIFT_LABELS: Record<Exclude<TaxRuleKind, "none">, { tax: string; payable: string }> = {
  vat_surcharge: { tax: "부가세", payable: "지급 총액" },
  withholding: { tax: "원천징수", payable: "실지급액" },
  company_borne: { tax: "회사 대납 세금", payable: "지급 총액" },
};

type ComputedTax = Exclude<ExpenseTaxResult, { unavailable: true }>;

function taxAmountOf(result: ComputedTax): number {
  if (result.ruleKind === "vat_surcharge") return result.vatKrw;
  if (result.ruleKind === "withholding") return result.withholdingKrw;
  if (result.ruleKind === "company_borne") return result.companyBorneKrw;
  return 0;
}

export function taxDriftText(stored: ExpenseTaxResult, recomputed: ExpenseTaxResult): { text: string; parts: TaxLinePart[] } | null {
  if (stored.unavailable || recomputed.unavailable) return null;
  // 저장 세율은 소수 6자리(numeric(7,6))라 같은 자리로 맞춰 비교한다(05-06 돈 검토 m2).
  const sameRate = stored.rate?.toFixed(6) === recomputed.rate?.toFixed(6);
  const sameTax = taxAmountOf(stored) === taxAmountOf(recomputed);
  const samePayable = stored.payableKrw === recomputed.payableKrw;
  if (sameRate && sameTax && samePayable) return null;

  const change = (from: string, to: string): TaxLinePart[] =>
    from === to ? [{ text: from, emphasis: true }] : [{ text: from, emphasis: true }, { text: " → ", emphasis: false }, { text: to, emphasis: true }];
  const rateText = (result: ComputedTax) => (result.rate === null ? null : formatRatePercent(result.rate));
  const segments: TaxLinePart[][] = [[{ text: "세율 바뀜", emphasis: false }]];
  const labels = stored.ruleKind === "none" ? { tax: null, payable: "지급 총액" } : DRIFT_LABELS[stored.ruleKind];
  if (labels.tax) {
    const taxSegment: TaxLinePart[] = [{ text: `${labels.tax} `, emphasis: false }];
    const [fromRate, toRate] = [rateText(stored), rateText(recomputed)];
    if (fromRate !== null && toRate !== null) taxSegment.push(...change(fromRate, toRate));
    if (sameRate && !sameTax) {
      if (fromRate !== null) taxSegment.push({ text: " ", emphasis: false });
      taxSegment.push(...change(formatKrw(taxAmountOf(stored)), formatKrw(taxAmountOf(recomputed))));
    }
    segments.push(taxSegment);
  }
  segments.push([{ text: `${labels.payable} `, emphasis: false }, ...change(formatKrw(stored.payableKrw), formatKrw(recomputed.payableKrw))]);
  const parts = segments.flatMap((segment, index) => (index === 0 ? segment : [SEP, ...segment]));
  return { text: parts.map((part) => part.text).join(""), parts };
}

// 제출 때 저장한 스냅숏 열 → 세금 결과(세율 바뀜 비교 · 저장값 한 줄). 규칙 종류가 없으면 아직 계산 전이라 null.
export function storedTaxResult(row: {
  taxRuleKind: string | null;
  taxRate: string | null;
  vatKrw: number | null;
  withholdingKrw: number | null;
  companyBorneKrw: number | null;
  payableKrw: number | null;
}): ExpenseTaxResult | null {
  if (row.taxRuleKind === null || row.payableKrw === null) return null;
  return {
    ruleKind: row.taxRuleKind as TaxRuleKind,
    rate: row.taxRate === null ? null : Number(row.taxRate),
    historizedId: null,
    rateEffectiveFrom: null,
    method: null,
    basisDate: null,
    vatKrw: row.vatKrw ?? 0,
    withholdingKrw: row.withholdingKrw ?? 0,
    companyBorneKrw: row.companyBorneKrw ?? 0,
    payableKrw: row.payableKrw,
  };
}
