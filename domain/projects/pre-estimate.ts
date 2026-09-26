import type { Currency } from "@/domain/money";

// 04-44(DR-28 · DR-37 · 계약 8 · S17) — 상세 총 매출 예상가 칸의 검증. 화면(칸 아래 Form.Error)과 서버(합성
// 저장)가 같은 함수를 부른다 — domain/money 밖을 import하지 않는다. 문구는 UI-SPEC rev 5 Copywriting
// `Error — 총 매출 예상가 칸` 원문이다. KRW는 환율 1로 보므로 환율 칸을 보지 않는다.
export type PreEstimateFieldError = { field: "amount" | "fxRate"; reason: string };

export function validatePreEstimateChange(input: {
  currency: Currency;
  amount: number;
  fxRate: number | null;
}): PreEstimateFieldError[] {
  const errors: PreEstimateFieldError[] = [];
  if (!Number.isFinite(input.amount)) {
    errors.push({ field: "amount", reason: "숫자 형식 오류 · 12,400,000처럼" });
  } else if (input.amount < 0) {
    errors.push({ field: "amount", reason: "총 매출 예상가는 0 이상 · 금액 수정" });
  }
  if (input.currency !== "KRW") {
    if (input.fxRate === null || !Number.isFinite(input.fxRate)) {
      errors.push({ field: "fxRate", reason: `환율이 없습니다 · ${input.currency} 환율을 적어 주세요` });
    } else if (input.fxRate <= 0) {
      errors.push({ field: "fxRate", reason: "환율 0 이하 · 환율 수정" });
    }
  }
  return errors;
}
