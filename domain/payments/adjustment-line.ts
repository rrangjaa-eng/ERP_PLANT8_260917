import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { moneyFromRow, moneyToColumns, profit } from "@/domain/money";
import { findLatestQuoteRevision } from "@/repositories/quote-revisions";
import {
  archiveSourcedAdjustmentLine,
  findLastArchivedLineBySourceExpense,
  findQuoteLineById,
  insertSourcedAdjustmentLine,
  listQuoteLinesByRevision,
  updateSourcedAdjustmentLine,
  type QuoteLineRow,
} from "@/repositories/quote-lines";

// 06.5 D-6502(사용자 카드 10/13 19:54 KST): 지급 완료 때 회사 대납 세금을 그 프로젝트 현재 차수의 조정 줄로 장부에 올린다.
// 지급은 이미 나가는 돈이라 완료 · 잠긴 프로젝트도 현재 차수에 넣는다(옛은 잠긴 행사에서 실패 O: server/src/confirmations.ts:718-722 —
// 의도된 차이). 규칙이 만드는 줄이라 `projects.adjustment` 권한을 다시 보지 않는다(옛 O: server/src/confirmations.ts:713-716).
// 세율 기준일 = 지급일 — 세액은 호출자가 트랜잭션 전에 계산한 decidePayable 결과다(트랜잭션 안에서 설정을 읽지 않는다).
// 칸 값은 domain/quotes createOutOfQuoteLine과 같은 꼴(견적가 0 · 수량 1 · 단가 0 · 미착수 · 차익 = profit())이지만 사람 편집 경로
// (권한 · 줄 수 상한)를 지나지 않으려고 리포지토리 저수준 함수로 쓴다.
// 갈래: 세액 0 → 있으면 보관(옛 O: server/src/confirmations.ts:709-711 · :801-815와 같다) / 줄 없음 → 세움 / 사람이 고친 줄
// (`version ≠ source_synced_version`) → 건드리지 않음(옛은 덮어씀 O: server/src/confirmations.ts:827-837 — 의도된 차이) / 그 밖 → 고침.
// 사람이 지운 규칙 줄(OI-12 — 보관 때 version만 +1)은 재지급이 다시 만들지 않는다. 쓰기 0행이면 지급을 실패시키지 않는다(EP2-A2 ③).

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
  const line = input.liveLine;
  if (input.companyBorneKrw === 0) return line ? archiveRuleLine(viewer, line, tx) : NOTHING;
  const itemName = `${TAX_ADJUSTMENT_LINE_PREFIX} · ${input.documentNumber}`;
  if (line) {
    if (handEdited(line)) return HAND_EDITED;
    const updated = await updateSourcedAdjustmentLine(viewer, { id: line.id, expectedVersion: line.version, itemName, ...executionColumns(input.companyBorneKrw) }, tx);
    return updated ? { adjustmentLineId: updated.id, adjustmentKrw: input.companyBorneKrw, handEditedSkip: false } : afterZeroRows(viewer, line.id, tx);
  }
  const lastArchived = await findLastArchivedLineBySourceExpense(viewer, input.expenseId, tx);
  if (lastArchived && handEdited(lastArchived)) return HAND_EDITED;
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
      itemName,
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

// 지급 취소 — 연결 줄을 보관한다(사람이 고친 줄은 그대로). 호출자가 프로젝트 행 → 그 줄 → 문서 행 순서로 잠근 뒤 다시 읽은 줄을 넘긴다.
export async function releaseTaxAdjustmentLine(viewer: Viewer, input: { liveLine: QuoteLineRow | null }, tx: DbOrTx): Promise<AdjustmentSyncResult> {
  return input.liveLine ? archiveRuleLine(viewer, input.liveLine, tx) : NOTHING;
}

const HAND_EDITED: AdjustmentSyncResult = { adjustmentLineId: null, adjustmentKrw: 0, handEditedSkip: true };

function handEdited(line: Pick<QuoteLineRow, "version" | "sourceSyncedVersion">): boolean {
  return line.version !== line.sourceSyncedVersion;
}

async function archiveRuleLine(viewer: Viewer, line: QuoteLineRow, tx: DbOrTx): Promise<AdjustmentSyncResult> {
  if (handEdited(line)) return HAND_EDITED;
  const archived = await archiveSourcedAdjustmentLine(viewer, { id: line.id, expectedVersion: line.version, archivedBy: viewer.id }, tx);
  return archived ? { adjustmentLineId: archived.id, adjustmentKrw: 0, handEditedSkip: false } : afterZeroRows(viewer, line.id, tx);
}

// 쓰기 0행(그사이 보관함이 보관했거나 사람이 고침) — 다시 읽어 손 편집이면 그 사실만, 그 밖(이미 없음)은 아무 일 없음.
async function afterZeroRows(viewer: Viewer, id: string, tx: DbOrTx): Promise<AdjustmentSyncResult> {
  const fresh = await findQuoteLineById(viewer, id, tx);
  return fresh && fresh.archivedAt === null && handEdited(fresh) ? HAND_EDITED : NOTHING;
}
