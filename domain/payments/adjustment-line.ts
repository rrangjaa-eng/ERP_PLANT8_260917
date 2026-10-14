import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { moneyFromRow, moneyToColumns, profit } from "@/domain/money";
import { findLatestQuoteRevision } from "@/repositories/quote-revisions";
import { insertSourcedAdjustmentLine, listQuoteLinesByRevision, type QuoteLineRow } from "@/repositories/quote-lines";

// 06.5 D-6502(사용자 카드 10/13 19:54 KST): 지급 완료 때 회사 대납 세금을 그 프로젝트 현재 차수의 조정 줄로 장부에 올린다.
// 지급은 이미 나가는 돈이라 완료 · 잠긴 프로젝트도 현재 차수에 넣는다(옛은 잠긴 행사에서 실패 O: server/src/confirmations.ts:718-722 —
// 의도된 차이). 규칙이 만드는 줄이라 `projects.adjustment` 권한을 다시 보지 않는다(옛 O: server/src/confirmations.ts:713-716).
// 세율 기준일 = 지급일 — 세액은 호출자가 트랜잭션 전에 계산한 decidePayable 결과다(트랜잭션 안에서 설정을 읽지 않는다).
// 칸 값은 domain/quotes createOutOfQuoteLine과 같은 꼴(견적가 0 · 수량 1 · 단가 0 · 미착수 · 차익 = profit())이지만 사람 편집 경로
// (권한 · 줄 수 상한)를 지나지 않으려고 리포지토리 저수준 함수로 쓴다.

export const TAX_ADJUSTMENT_LINE_PREFIX = "기타소득세 대납";

export type AdjustmentSyncResult = { adjustmentLineId: string | null; adjustmentKrw: number; handEditedSkip: boolean };

const NOTHING: AdjustmentSyncResult = { adjustmentLineId: null, adjustmentKrw: 0, handEditedSkip: false };

function executionColumns(companyBorneKrw: number) {
  const execution = moneyToColumns({ currency: "KRW", amount: companyBorneKrw, fxRate: 1 });
  return {
    executionCurrency: execution.currency,
    executionForeignAmount: execution.foreignAmount,
    executionFxRate: execution.fxRate,
    executionAmountKrw: execution.amountKrw,
    profitKrw: profit(0, moneyFromRow({ currency: execution.currency, foreignAmount: execution.foreignAmount, fxRate: execution.fxRate, amountKrw: execution.amountKrw })),
  };
}

export async function syncTaxAdjustmentLine(
  viewer: Viewer,
  input: {
    projectId: string | null;
    expenseId: string;
    documentNumber: string | null;
    companyBorneKrw: number;
    // 잠금 뒤 다시 읽은 연결 줄(보관됐으면 null).
    liveLine: QuoteLineRow | null;
  },
  tx: DbOrTx,
): Promise<AdjustmentSyncResult> {
  if (!input.projectId || !input.documentNumber) return NOTHING;
  if (input.liveLine || input.companyBorneKrw === 0) return NOTHING;
  const revision = await findLatestQuoteRevision(viewer, input.projectId, tx);
  // 프로젝트 생성이 차수 1을 늘 만든다(domain/projects createProject) — 없으면 지급을 되돌린다.
  if (!revision) throw new Error(`프로젝트 차수 없음: ${input.projectId}`);
  const active = await listQuoteLinesByRevision(viewer, revision.id, tx);
  const sortOrder = active.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const zero = moneyToColumns({ currency: "KRW", amount: 0, fxRate: 1 });
  const row = await insertSourcedAdjustmentLine(
    viewer,
    {
      revisionId: revision.id,
      sortOrder,
      subcategory: "adjustment",
      itemName: `${TAX_ADJUSTMENT_LINE_PREFIX} · ${input.documentNumber}`,
      quantity: "1",
      unitPriceCurrency: zero.currency,
      unitPriceForeignAmount: zero.foreignAmount,
      unitPriceFxRate: zero.fxRate,
      unitPriceAmountKrw: zero.amountKrw,
      ...executionColumns(input.companyBorneKrw),
      quoteAmountKrw: 0,
      lineStatus: "not_started",
      sourceExpenseId: input.expenseId,
    },
    tx,
  );
  return { adjustmentLineId: row.id, adjustmentKrw: input.companyBorneKrw, handEditedSkip: false };
}
