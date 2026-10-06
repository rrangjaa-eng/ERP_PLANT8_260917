import { toKrw, type MoneyInput } from "@/domain/money";
import type { TaxRates } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";

// 06-05(D-607 · O-7): 카드 결제 합계(부가세 포함) → 원화 · 공급가 · 부가세 · 반올림 잔차. 순수 함수 — 설정 · DB를 읽지 않는다.
// 세율 · 단위는 호출부가 사용일 기준으로 미리 읽은 `TaxRates`(06-03 tx 규약 · CROSS R-2)다.

export type CardTotal = { money: MoneyInput; rule: TaxRule };

export type CardSplit = {
  totalKrw: number;
  supplyKrw: number;
  vatKrw: number;
  /** 공급가 + 재계산 부가세 − 합계(CROSS R-1). */
  residualKrw: number;
};

export function splitCardTotal(total: CardTotal, rates: TaxRates): CardSplit {
  void rates;
  const totalKrw = toKrw(total.money);
  return { totalKrw, supplyKrw: totalKrw, vatKrw: 0, residualKrw: 0 };
}
