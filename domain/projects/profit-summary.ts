import type { ProfitBasis } from "@/domain/projects/list-view";

// 07-18(SC-19 · U16) — 프로젝트 상세 정보 면 `손익` 섹션의 숫자. 정의는 목록과 하나다(repositories/projects.ts rowMoneyExpressions):
// 기준 = 정산·완료에 발행 줄이 있으면 발행 합계, 아니면 견적 합계 · 수익금 = 기준 − 실행가 · 수익률 = 수익금 ÷ 기준.
// 기준이 0 이하면 수익률을 못 구해 `계산 불가`다(이유는 hover / 폰 탭 `계산 불가 · {이유}`).
// 07.4 D-7402: 정산서 손익 칸의 매출 기준 — 같은 SQL의 기준액을 싣기만 한다.
export type ProjectProfitInput = { profitBasis: ProfitBasis; basisKrw: number; profitKrw: number; profitRate: number | null };
export type ProjectProfitSummary = { kind: "ok"; basisKrw: number; profitKrw: number; ratePct: number } | { kind: "unavailable"; basisKrw: number; reason: string };

export function summarizeProjectProfit(input: ProjectProfitInput): ProjectProfitSummary {
  if (input.basisKrw <= 0 || input.profitRate === null) {
    return { kind: "unavailable", basisKrw: input.basisKrw, reason: input.profitBasis === "issued" ? "발행액 없음" : "견적 없음" };
  }
  return { kind: "ok", basisKrw: input.basisKrw, profitKrw: input.profitKrw, ratePct: input.profitRate * 100 };
}
