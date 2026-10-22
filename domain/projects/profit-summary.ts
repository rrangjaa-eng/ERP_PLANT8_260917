// 07-18(SC-19 · U16) — 프로젝트 상세 정보 면 `손익` 섹션의 숫자. 견적 줄의 차익(견적가 − 실행가)을 더한다.
// 취소한 줄은 뺀다. 견적 합이 0이면 비율을 못 구해 `계산 불가`다(이유는 hover / 폰 탭 `계산 불가 · {이유}`).
export type ProfitLineInput = { lineStatus: string; quoteAmountKrw: number; profitKrw: number };
export type ProjectProfitSummary = { kind: "ok"; profitKrw: number; ratePct: number } | { kind: "unavailable"; reason: string };

export function summarizeProjectProfit(lines: readonly ProfitLineInput[]): ProjectProfitSummary {
  const active = lines.filter((line) => line.lineStatus !== "cancelled");
  const quoteKrw = active.reduce((sum, line) => sum + line.quoteAmountKrw, 0);
  if (quoteKrw <= 0) return { kind: "unavailable", reason: "견적 없음" };
  const profitKrw = active.reduce((sum, line) => sum + line.profitKrw, 0);
  return { kind: "ok", profitKrw, ratePct: Math.round((profitKrw / quoteKrw) * 1000) / 10 };
}
