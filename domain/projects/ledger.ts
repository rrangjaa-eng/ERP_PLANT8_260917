import type { Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { saveQuoteLines, type QuoteLineWriteRow, type SaveQuoteLinesResult } from "@/domain/quotes/lines";
import { saveRevenue, listRevenue, type SaveRevenueInput, type RevenueDto } from "@/domain/revenue";

// 04-02 Task 2 ⑥ — 상세 화면의 1차 「일괄 저장」 하나가 견적 줄 + 매출
// 섹션(계약 금액·발행 줄·입금 줄)의 dirty 전부를 **같은 트랜잭션**으로
// 저장한다(§7-3 "전부 저장 또는 전부 거부", §7-15 "화면의 1차에 합류").
// 두 domain 함수(saveQuoteLines·saveRevenue)는 각자 독립 실행도 가능하도록
// 남겨 두고, 여기서는 tx를 넘겨 하나로 묶기만 한다 — 계산·권한 판정 로직은
// 중복하지 않는다.
export type SaveProjectLedgerInput = {
  quoteLines?: { revisionId: string; rows: QuoteLineWriteRow[] };
  revenue?: SaveRevenueInput;
};

export type SaveProjectLedgerResult = {
  quoteLines: SaveQuoteLinesResult | null;
  revenue: RevenueDto | null;
};

export async function saveProjectLedger(
  viewer: Viewer,
  projectId: string,
  input: SaveProjectLedgerInput,
): Promise<SaveProjectLedgerResult> {
  const { quoteLinesResult } = await withTransaction(async (tx) => {
    const quoteLinesResult = input.quoteLines
      ? await saveQuoteLines(viewer, input.quoteLines.revisionId, input.quoteLines.rows, undefined, tx)
      : null;
    if (input.revenue) await saveRevenue(viewer, projectId, input.revenue, undefined, tx);
    return { quoteLinesResult };
  });

  // 트랜잭션 커밋 뒤 스냅샷을 새로 읽는다 — saveRevenue가 tx 안에서 커밋
  // 전 listRevenue를 부르면 자기 자신의 쓰기를 보지 못한다(격리).
  const revenueResult = input.revenue ? await listRevenue(viewer, projectId) : null;

  return { quoteLines: quoteLinesResult, revenue: revenueResult };
}
