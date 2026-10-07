import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { corpCardUsages, expenseEvidenceReviews, expenses, quoteLines, quoteRevisions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-06(EVID-02 · EVID-03 · D-602): 증빙 확인 기록(06-27 expense_evidence_reviews — 문서당 한 줄) 읽기 · upsert와
// 경영관리 금액 고침의 증빙 금액 칸 갱신. 확인 해제(줄 지움) · 증빙 금액 지움은 06-11 — 05 증빙 경로 두 곳에 붙는 훅이 한다(B-3 · C4).

export type EvidenceReviewRow = InferSelectModel<typeof expenseEvidenceReviews>;
export type EvidenceReviewStatus = "confirmed" | "waived";

export async function findReviewByExpense(viewer: Viewer, expenseId: string, tx: DbOrTx = db): Promise<EvidenceReviewRow | null> {
  void viewer;
  const [row] = await tx.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId)).limit(1);
  return row ?? null;
}

// 문서당 한 줄 — `ON CONFLICT (expense_id) DO UPDATE`(expense_evidence_reviews_expense_uniq). 다시 쓰면 사람 · 시각 · 금액 전후를 새 값으로,
// 기록 version + 1. 면제 사유는 면제일 때만(06-10 waiveEvidence), 확인이면 null.
export async function upsertReview(
  viewer: Viewer,
  values: {
    expenseId: string;
    status: EvidenceReviewStatus;
    amountBeforeKrw: number | null;
    amountAfterKrw: number | null;
    waiveReason: string | null;
    reviewedBy: string;
  },
  tx: DbOrTx,
): Promise<EvidenceReviewRow> {
  void viewer;
  const now = new Date();
  const set = {
    status: values.status,
    amountBeforeKrw: values.amountBeforeKrw,
    amountAfterKrw: values.amountAfterKrw,
    waiveReason: values.status === "waived" ? values.waiveReason : null,
    reviewedBy: values.reviewedBy,
    reviewedAt: now,
  };
  const [row] = await tx
    .insert(expenseEvidenceReviews)
    .values({ expenseId: values.expenseId, ...set })
    .onConflictDoUpdate({ target: expenseEvidenceReviews.expenseId, set: { ...set, version: sql`${expenseEvidenceReviews.version} + 1` } })
    .returning();
  if (!row) throw new Error("증빙 확인 기록 upsert 결과 없음");
  return row;
}

// 경영관리 금액 고침(D-602 — 고친 값이 새 원본) — expenses.evidence_amount 그 칸만. version · 다른 칸은 건드리지 않는다
// (version + 1은 호출자가 bumpExpenseVersion으로). 05 기안자 저장 · 05 증빙 경로를 거치지 않는다(B-3).
export async function updateEvidenceAmount(viewer: Viewer, input: { expenseId: string; amountKrw: number }, tx: DbOrTx): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(expenses)
    .set({ evidenceAmount: input.amountKrw })
    .where(and(eq(expenses.id, input.expenseId), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });
  return rows.length > 0;
}

// 06-11(C4) — 결재 통과 문서의 증빙 추가 · 무효가 확인 기록 줄을 지운다(확인 전으로 돌아감). 지운 줄의 status를 돌려준다(없으면 null).
// version + 1은 호출자가 bumpExpenseVersion으로 — 05 증빙 경로 트랜잭션 안에서만 부른다(기본값 없음).
export async function deleteReviewByExpense(viewer: Viewer, expenseId: string, tx: DbOrTx): Promise<EvidenceReviewStatus | null> {
  void viewer;
  const [row] = await tx.delete(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId)).returning({ status: expenseEvidenceReviews.status });
  return row ? (row.status as EvidenceReviewStatus) : null;
}

// 06-11(EVID-04) — 마지막 증빙이 무효가 되면 증빙 금액 · 증빙일 두 칸만 지운다. version은 건드리지 않는다.
export async function clearEvidenceValues(viewer: Viewer, expenseId: string, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx
    .update(expenses)
    .set({ evidenceAmount: null, evidenceDate: null })
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)));
}

// 목록 · 집계용 묶음 읽기(06-19 D-611 · 06-23 기안자 신호) — 문서마다 따로 읽지 않는다. 빈 배열이면 쿼리 없이 빈 Map.
export async function listReviewStatusByExpenses(viewer: Viewer, expenseIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, EvidenceReviewStatus>> {
  void viewer;
  if (expenseIds.length === 0) return new Map();
  const rows = await tx
    .select({ expenseId: expenseEvidenceReviews.expenseId, status: expenseEvidenceReviews.status })
    .from(expenseEvidenceReviews)
    .where(inArray(expenseEvidenceReviews.expenseId, [...expenseIds]));
  return new Map(rows.map((row) => [row.expenseId, row.status as EvidenceReviewStatus]));
}

// [Q-F 계보] 프로젝트(모든 차수) 견적 줄에 이은 보관 안 된 카드 사용의 공급가 — 남은 실행가 재료(06-06 loadEvidenceOverrun).
// 06-07 repositories/corp-card-usages.ts · quote-line-links.ts는 같은 웨이브라 쓰지 않는다.
export async function listAliveCardUsageSuppliesByProject(
  viewer: Viewer,
  projectId: string,
  tx: DbOrTx = db,
): Promise<{ quoteLineId: string; supplyKrw: number }[]> {
  void viewer;
  const rows = await tx
    .select({ quoteLineId: corpCardUsages.quoteLineId, supplyKrw: corpCardUsages.supplyKrw })
    .from(corpCardUsages)
    .innerJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .where(and(eq(quoteRevisions.projectId, projectId), eq(corpCardUsages.linkKind, "quote_line"), isNull(corpCardUsages.archivedAt)));
  return rows.flatMap((row) => (row.quoteLineId ? [{ quoteLineId: row.quoteLineId, supplyKrw: row.supplyKrw }] : []));
}
