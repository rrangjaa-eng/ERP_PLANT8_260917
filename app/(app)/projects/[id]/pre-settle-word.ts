import type { OpenExpenseState } from "@/domain/pre-settle-check/summary";
import type { StatusWord } from "@/ui/status-tag/status-map";

// 06-19(S18 · O-14): 완료 전 점검 미결 지출결의 행의 상태 낱말. 색은 여기서 고르지 않는다(`ui/status-tag/status-map.ts`가 정한다 — C2).
const WORD: Record<OpenExpenseState, StatusWord> = {
  rejected: "반려",
  prepaid_no_evidence: "선결제 · 증빙 없음",
  no_evidence: "증빙 없음",
  in_review: "결재 중",
};

export function preSettleStatusWord(state: OpenExpenseState): StatusWord {
  return WORD[state];
}
