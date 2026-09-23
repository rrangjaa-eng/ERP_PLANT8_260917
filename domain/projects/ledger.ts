import type { Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { saveQuoteLines, type QuoteLineWriteRow, type SaveQuoteLinesResult } from "@/domain/quotes/lines";
import { saveRevenue, listRevenue, type SaveRevenueInput, type RevenueDto } from "@/domain/revenue";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findQuoteRevisionById } from "@/repositories/quote-revisions";
import { recordAction } from "@/domain/action-log/record";
import { findProject } from "@/domain/projects";

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
  // 볼 수 없는 프로젝트(보기 권한·범위 밖, 권한 없는 보관 프로젝트)에는 쓰지
  // 않는다 — 조회 화면과 같은 findProject로 판정한다(/cso 14b1ae15).
  if (!(await findProject(viewer, projectId))) {
    throw new UserFacingError("존재하지 않는 프로젝트입니다.");
  }

  // 견적 줄의 차수가 이 프로젝트의 것인지 먼저 확인한다 — 아니면 매출·감사
  // 기록은 이 프로젝트로, 견적 줄은 다른 프로젝트로 섞여 저장된다.
  if (input.quoteLines) {
    const revision = await findQuoteRevisionById(viewer, input.quoteLines.revisionId);
    if (!revision || revision.projectId !== projectId) {
      throw new UserFacingError("견적 차수를 찾을 수 없습니다 · 화면을 새로고침해 주세요");
    }
  }

  // 감사 기록은 트랜잭션 밖 커넥션으로 쓰인다 — 안에서 바로 남기면 뒤쪽
  // 저장이 거부돼 롤백돼도 기록만 남는다. 모았다가 커밋 뒤에 남긴다.
  const pendingActions: Parameters<typeof recordAction>[1][] = [];
  const deferRecord = {
    recordAction: (_viewer: Viewer, entry: Parameters<typeof recordAction>[1]): Promise<void> => {
      pendingActions.push(entry);
      return Promise.resolve();
    },
  };

  const { quoteLinesResult } = await withTransaction(async (tx) => {
    const quoteLinesResult = input.quoteLines
      ? await saveQuoteLines(viewer, input.quoteLines.revisionId, input.quoteLines.rows, deferRecord, tx)
      : null;
    if (input.revenue) await saveRevenue(viewer, projectId, input.revenue, deferRecord, tx);
    return { quoteLinesResult };
  });
  for (const entry of pendingActions) await recordAction(viewer, entry);

  // 트랜잭션 커밋 뒤 스냅샷을 새로 읽는다 — saveRevenue가 tx 안에서 커밋
  // 전 listRevenue를 부르면 자기 자신의 쓰기를 보지 못한다(격리).
  const revenueResult = input.revenue ? await listRevenue(viewer, projectId) : null;

  return { quoteLines: quoteLinesResult, revenue: revenueResult };
}
