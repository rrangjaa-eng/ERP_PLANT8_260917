import { and, eq, isNull, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { expensePayments, expenses } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-03(EXP-06): 지급 기록 쓰기 · 살아 있는 기록 조회 · 지출결의 문서 version +1. 살아 있는 지급은 문서당 하나 —
// 06-27 부분 유니크 인덱스 `expense_payments_live_uniq`가 최종 판정한다. 행 잠금은 05 lockExpenseForUpdate를 쓴다(A#8).

export type ExpensePaymentRow = InferSelectModel<typeof expensePayments>;
export type ExpensePaymentInsert = Omit<
  InferInsertModel<typeof expensePayments>,
  "id" | "processedAt" | "cancelledAt" | "cancelledBy" | "cancelReason" | "version"
>;

export async function insertPayment(viewer: Viewer, values: ExpensePaymentInsert, tx: DbOrTx): Promise<ExpensePaymentRow> {
  void viewer;
  const [row] = await tx.insert(expensePayments).values(values).returning();
  if (!row) throw new Error("지급 기록 INSERT 결과 없음");
  return row;
}

// 취소 안 된 지급 기록 하나(없으면 null).
export async function findLivePayment(viewer: Viewer, expenseId: string, tx: DbOrTx = db): Promise<ExpensePaymentRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)))
    .limit(1);
  return row ?? null;
}

// 조건 UPDATE — version이 같을 때만 + 1(R-2 — 일괄 지급 스냅숏이 이 version으로 낡음을 가린다). 0행이면 null(동시성).
export async function bumpExpenseVersion(
  viewer: Viewer,
  input: { expenseId: string; expectedVersion: number; updatedBy?: string },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(expenses)
    .set({ version: sql`${expenses.version} + 1`, updatedAt: new Date(), ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}) })
    .where(and(eq(expenses.id, input.expenseId), eq(expenses.version, input.expectedVersion), isNull(expenses.deletedAt)))
    .returning({ version: expenses.version });
  return row?.version ?? null;
}

// 06-04 — 지급 예정일만 바꾸는 조건 UPDATE(SP-3 ②). version이 같을 때만 예정일 · version + 1. 0행이면 null(동시성).
export async function updateScheduledPaymentDate(
  viewer: Viewer,
  input: { expenseId: string; date: string; expectedVersion: number; updatedBy: string },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(expenses)
    .set({ scheduledPaymentDate: input.date, version: sql`${expenses.version} + 1`, updatedAt: new Date(), updatedBy: input.updatedBy })
    .where(and(eq(expenses.id, input.expenseId), eq(expenses.version, input.expectedVersion), isNull(expenses.deletedAt)))
    .returning({ version: expenses.version });
  return row?.version ?? null;
}

// 06-04 — 지급 취소 표시(D-606). 행을 지우지 않고 취소 칸 셋만 채운다. 살아 있는 행만(이미 취소면 0행 → null).
export async function markPaymentCancelled(
  viewer: Viewer,
  input: { paymentId: string; reason: string; cancelledBy: string },
  tx: DbOrTx,
): Promise<ExpensePaymentRow | null> {
  void viewer;
  const [row] = await tx
    .update(expensePayments)
    .set({ cancelledAt: new Date(), cancelledBy: input.cancelledBy, cancelReason: input.reason })
    .where(and(eq(expensePayments.id, input.paymentId), isNull(expensePayments.cancelledAt)))
    .returning();
  return row ?? null;
}
