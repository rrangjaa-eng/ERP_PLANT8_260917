import { sumKrw } from "@/domain/money";

// 06-06 EA-1(사용자 결정 10/6 11:57 채팅 — 저장 막기): 증빙 금액이 승인 공급가 + 부가세와 정확히 같으면 부가세 포함 금액으로 보고 막는다.
// 근사 · 비율 판정 없음. 값 import는 @/domain/money 하나 — 06-10이 domain/expenses/index.ts에서 import해도 순환이 없다.

export const EVIDENCE_AMOUNT_TAX_INCLUSIVE = "부가세 포함 금액 · 공급가로 입력";

export function isTaxInclusiveEvidenceAmount(input: { evidenceAmountKrw: number | null; supplyKrw: number; vatKrw: number }): boolean {
  return input.vatKrw > 0 && input.evidenceAmountKrw !== null && input.evidenceAmountKrw === sumKrw([input.supplyKrw, input.vatKrw]);
}
