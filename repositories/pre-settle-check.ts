import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, expenses, quoteLines } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-19(PROJ-06 · ENG E-1): 완료 전 점검 읽기 — 전부 `tx`를 받는다(정산 기안 트랜잭션 안에서 부른다). 범위 거르기는 하지 않는다 —
// 막힘 건수는 보는 사람과 무관한 프로젝트 전체 값이다(R-6 — 표시 거르기는 domain).

const EXPENSE_KIND = "expense";

// 결재 중 · 반려 · 결재 통과만(작성 중 · 회수는 미결이 아니다) · 종결 안 됨(C10 — 06-28 종결 판정과 같은 `closed_at IS NULL`).
const OPEN_CANDIDATE_STATUSES = ["submitted", "in_review", "rejected", "approved"];

export type PreSettleExpenseRow = {
  id: string;
  number: string;
  quoteLineId: string | null;
  itemName: string | null;
  supplyAmountKrw: number | null;
  approvalStatus: string;
  prepaid: boolean;
  drafterId: string;
};

export async function listPreSettleExpenseRows(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<PreSettleExpenseRow[]> {
  void viewer;
  const rows = await tx
    .select({
      id: expenses.id,
      number: expenses.number,
      quoteLineId: expenses.quoteLineId,
      itemName: quoteLines.itemName,
      supplyAmountKrw: expenses.supplyAmountKrw,
      approvalStatus: approvalInstances.status,
      prepaid: expenses.prepaid,
      drafterId: expenses.drafterId,
    })
    .from(expenses)
    .innerJoin(approvalInstances, and(eq(approvalInstances.documentKind, EXPENSE_KIND), eq(approvalInstances.documentId, expenses.id)))
    .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
    .where(
      and(
        eq(expenses.projectId, projectId),
        isNotNull(expenses.number),
        isNull(expenses.deletedAt),
        isNull(expenses.closedAt),
        inArray(approvalInstances.status, OPEN_CANDIDATE_STATUSES),
      ),
    )
    .orderBy(asc(expenses.number));
  return rows.flatMap((row) => (row.number ? [{ ...row, number: row.number }] : []));
}
