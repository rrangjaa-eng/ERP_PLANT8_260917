import type { ProjectProfitSummary } from "@/domain/projects/profit-summary";
import { formatKrw, formatPercent } from "@/lib/format-number";

// 07.4-03 D-7402 · 디자인 검토 B3: 정산서 손익 네 칸 값 글자 한 곳. 값은 loadProjectProfit이 준 그대로(다시 세지 않는다).
// 계산 불가면 수익금 · 수익률 칸이 「계산 불가 · {이유}」(note — 12px) — 「—」는 값이 없을 때만 쓰므로 여기서는 돌려주지 않는다.
export type ProfitCell = { label: "매출 기준" | "확정 실행가" | "수익금" | "수익률"; text: string; note: boolean };

export function profitCells(profit: ProjectProfitSummary, executionTotalKrw: number): ProfitCell[] {
  const known: ProfitCell[] = [
    { label: "매출 기준", text: formatKrw(profit.basisKrw), note: false },
    { label: "확정 실행가", text: formatKrw(executionTotalKrw), note: false },
  ];
  if (profit.kind === "unavailable") {
    const text = `계산 불가 · ${profit.reason}`;
    return [...known, { label: "수익금", text, note: true }, { label: "수익률", text, note: true }];
  }
  return [...known, { label: "수익금", text: formatKrw(profit.profitKrw), note: false }, { label: "수익률", text: formatPercent(profit.ratePct), note: false }];
}
