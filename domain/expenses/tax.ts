import type { TaxIncomeType } from "@/domain/money/tax";
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
