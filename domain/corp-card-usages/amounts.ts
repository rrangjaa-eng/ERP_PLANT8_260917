import { diffKrw, grossFromTotal, remainingForInstallments, round, sumKrw, toKrw, type Money, type MoneyInput, type RoundingUnit } from "@/domain/money";
import type { TaxRates } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";

// 06-05(D-607 · O-7): 카드 결제 합계(부가세 포함) → 원화 · 공급가 · 부가세 · 반올림 잔차. 순수 함수 — 설정 · DB를 읽지 않는다.
// 세율 · 단위는 호출부가 사용일 기준으로 미리 읽은 `TaxRates`(06-03 tx 규약 · CROSS R-2)다. 반올림 방식은 `TaxRates`에 없어
// 06-03 `applyTaxRule`과 같이 `rule.roundingMethod ?? "round"`를 쓴다.

export type CardTotal = { money: MoneyInput; rule: TaxRule };

export type CardSplit = {
  totalKrw: number;
  supplyKrw: number;
  vatKrw: number;
  /** 공급가 + 재계산 부가세 − 합계(CROSS R-1). 저장 부가세로 셈하지 않는다 — 그러면 늘 0이다. */
  residualKrw: number;
};

export function splitCardTotal(total: CardTotal, rates: TaxRates): CardSplit {
  const totalKrw = toKrw(total.money);
  if (total.rule.ruleKind !== "vat_surcharge") return { totalKrw, supplyKrw: totalKrw, vatKrw: 0, residualKrw: 0 };
  const unit = rates.vatUnit as RoundingUnit;
  const method = total.rule.roundingMethod ?? "round";
  const supplyKrw = grossFromTotal(totalKrw, rates.vatRate, unit, method);
  const recomputedVatKrw = round(supplyKrw * rates.vatRate, unit, method);
  return {
    totalKrw,
    supplyKrw,
    vatKrw: diffKrw(totalKrw, supplyKrw),
    residualKrw: diffKrw(sumKrw([supplyKrw, recomputedVatKrw]), totalKrw),
  };
}

// 카드에 쓰는 증빙 종류 = 규칙이 부가세 별도(vat_surcharge) · 없음(none)인 것. 원천징수 · 회사 대납은 카드 결제와 맞지 않는다.
export function isCardEvidenceRule(rule: TaxRule): boolean {
  return rule.ruleKind === "vat_surcharge" || rule.ruleKind === "none";
}

export const CARD_RECEIPT_CODE = "card_receipt";

// 가맹점(거래처) 기본 증빙 종류 → 카드 폼 자동 채움. 옵션 밖이면 `카드 전표`로 떨어지되 그것도 옵션 안에 있을 때만(UI-SPEC S9).
// `outsideDefault`는 옵션 밖이라 바꿔 채운 거래처 기본 종류(힌트 `기본 증빙 {종류} · 카드에 없음`).
export function cardEvidenceDefault(
  vendorDefault: string | null,
  options: readonly string[],
): { code: string | null; outsideDefault: string | null } {
  if (vendorDefault && options.includes(vendorDefault)) return { code: vendorDefault, outsideDefault: null };
  return { code: options.includes(CARD_RECEIPT_CODE) ? CARD_RECEIPT_CODE : null, outsideDefault: vendorDefault };
}

export const USED_ON_FUTURE = "사용일 미래 · 오늘까지 날짜로";

// 사용일 상한(Q6) — 오늘(서울 날짜, 호출부가 서버에서 정한다)까지. 날짜 글자(YYYY-MM-DD)는 사전순이 날짜순이다.
export function cardUsedOnError(usedOn: string, today: string): string | null {
  return usedOn > today ? USED_ON_FUTURE : null;
}

export type CardCapSource = "entry" | "reconciliation" | "settled";

// 카드 쪽 실행가 상한(Q3 · U-8 · Q-E · CF-3): 남은 실행가 = 줄 실행가 − 호출부가 모은 다른 공급가들. 사람이 적은 금액(entry)만
// 초과를 막고, 6.1 대사 덮기(reconciliation) · 완료 프로젝트 줄의 구매 완료(settled)는 초과만 돌려준다. 고정 상한 · 여유 없음.
export function cardExecutionCap(input: {
  execution: Money;
  otherSupplies: readonly Money[];
  supply: MoneyInput;
  source: CardCapSource;
}): { remaining: Money; exceeds: boolean; blocked: boolean } {
  const { remaining, exceeds } = remainingForInstallments(input.execution, input.otherSupplies, input.supply);
  return { remaining, exceeds, blocked: exceeds && input.source === "entry" };
}
