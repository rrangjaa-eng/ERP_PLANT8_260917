import { quoteAmount, sumKrw, type Money } from "@/domain/money";
import type { QuoteLineKind } from "@/domain/quotes/edit-scope";

// 07.2 PU3(D-7223 · UI-SPEC S5) — 「계산」 옆 패널의 기준 합. 율은 저장하지 않는다 — 패널이 이 합 × 율을 수수료 줄 단가로 채울 뿐이다.
// 기준은 견적 줄(quote)만이다(수수료 · 견적 외 비용 · 조정 줄과 취소 줄은 0). 대분류는 저장값이 있으면 그 값, 없으면 소분류 이름표
// (표 그룹 머리글과 같은 파생 — quoteLineGroupHeader). 견적가는 서버가 마지막에 돌려준 값이 아니라 지금 표의 값(저장 전 편집 포함)으로
// 수량 × 단가 × 일수를 다시 계산한다.

export type CommissionBasis = { kind: "all" } | { kind: "only"; major: string } | { kind: "except"; major: string };

export type CommissionBaseRow = {
  lineKind: QuoteLineKind;
  lineStatus: string;
  subcategory: string;
  majorCategory?: string | null;
  quantity: number;
  days: number;
  unitPriceAmountKrw: number;
};

type SubcategoryLabel = (value: string) => string;

const sameValue: SubcategoryLabel = (value) => value;

function counted(row: CommissionBaseRow): boolean {
  return row.lineKind === "quote" && row.lineStatus !== "cancelled";
}

function majorOf(row: CommissionBaseRow, label: SubcategoryLabel): string {
  return row.majorCategory || label(row.subcategory);
}

function rowQuoteAmount(row: CommissionBaseRow): number {
  const unitPrice: Money = { __brand: "Money", currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1, amountKrw: row.unitPriceAmountKrw };
  return quoteAmount(row.quantity, unitPrice, row.days);
}

export function commissionBase(rows: readonly CommissionBaseRow[], basis: CommissionBasis, label: SubcategoryLabel = sameValue): number {
  const inBasis = (row: CommissionBaseRow) =>
    basis.kind === "all" ? true : basis.kind === "only" ? majorOf(row, label) === basis.major : majorOf(row, label) !== basis.major;
  return sumKrw(rows.filter((row) => counted(row) && inBasis(row)).map(rowQuoteAmount));
}

// 기준 select 후보 — 견적 줄의 실제 대분류 이름을 처음 나온 순서로 한 번씩.
export function commissionMajors(rows: readonly CommissionBaseRow[], label: SubcategoryLabel = sameValue): string[] {
  return [...new Set(rows.filter(counted).map((row) => majorOf(row, label)))];
}
