import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, expenses, quoteLines, revenueEntries, vendors } from "@/db/schema";
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

export type PreSettleLineRow = typeof quoteLines.$inferSelect & { vendorName: string | null };

// 차수 하나(부르는 쪽이 같은 tx로 최신 차수 id를 읽어 넘긴다 — X-1)의 보관 안 된 줄 전부 + 거래처 이름(repositories/vendors는 tx 인자가 없어 같은 tx로 함께 읽는다).
// 미매칭 후보 거르기(실행가 · 취소 · 조정)는 domain이 한다 — 표시 번호가 줄 전부의 순서에서 나온다.
export async function listPreSettleLineRows(viewer: Viewer, revisionId: string, tx: DbOrTx = db): Promise<PreSettleLineRow[]> {
  void viewer;
  const rows = await tx
    .select({ line: quoteLines, vendorName: vendors.name })
    .from(quoteLines)
    .leftJoin(vendors, eq(vendors.id, quoteLines.vendorId))
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)))
    .orderBy(asc(quoteLines.sortOrder), asc(quoteLines.id));
  return rows.map((row) => ({ ...row.line, vendorName: row.vendorName }));
}

// 발행 줄(보관 안 됨)의 공급가 원화 — 건수 · 합계는 domain이 domain/money로 센다.
export async function listIssuedAmountsKrw(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<number[]> {
  void viewer;
  const rows = await tx
    .select({ amountKrw: revenueEntries.amountAmountKrw })
    .from(revenueEntries)
    .where(and(eq(revenueEntries.projectId, projectId), eq(revenueEntries.kind, "issue"), isNull(revenueEntries.archivedAt)));
  return rows.map((row) => Number(row.amountKrw ?? 0));
}
