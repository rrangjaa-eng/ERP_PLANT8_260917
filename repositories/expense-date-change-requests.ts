import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { expenseDateChangeRequests, expenses } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { NotifyTx } from "@/repositories/notifications";

// 07.2-18 X4(D-7291): 희망 지급일 변경 요청 표 읽기 · 쓰기. 모든 질의는 매개변수만 — 글자 이어 붙이기 없음.
// 쓰기는 지출결의 행을 먼저 잠근 트랜잭션 안에서만 부른다(잠금 순서: 지출결의 행 → 요청 행).
export type DateChangeRequestRow = InferSelectModel<typeof expenseDateChangeRequests>;

export async function insertDateChangeRequest(
  viewer: Viewer,
  row: { expenseId: string; requestedBy: string; newDate: string; reason: string; createdAt: Date },
  tx: DbOrTx,
): Promise<DateChangeRequestRow> {
  void viewer;
  const [inserted] = await tx.insert(expenseDateChangeRequests).values(row).returning();
  if (!inserted) throw new Error("요청 행을 만들지 못했다");
  return inserted;
}

export async function findPendingDateChange(viewer: Viewer, expenseId: string, tx: DbOrTx = db): Promise<DateChangeRequestRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenseDateChangeRequests)
    .where(and(eq(expenseDateChangeRequests.expenseId, expenseId), eq(expenseDateChangeRequests.status, "pending")))
    .limit(1);
  return row ?? null;
}

export async function findDateChangeRequestById(viewer: Viewer, requestId: string, tx: DbOrTx = db): Promise<DateChangeRequestRow | null> {
  void viewer;
  const [row] = await tx.select().from(expenseDateChangeRequests).where(eq(expenseDateChangeRequests.id, requestId)).limit(1);
  return row ?? null;
}

// 대기 행만 처리(승인 · 거절 · 철회) — 동시 처리의 둘째는 0행이라 null(`이미 처리됨 · 새로 고침`).
export async function decidePendingDateChange(
  viewer: Viewer,
  input: { requestId: string; status: "approved" | "rejected" | "withdrawn"; decidedBy: string; decidedAt: Date; rejectMemo: string | null },
  tx: DbOrTx,
): Promise<DateChangeRequestRow | null> {
  void viewer;
  const [row] = await tx
    .update(expenseDateChangeRequests)
    .set({ status: input.status, decidedBy: input.decidedBy, decidedAt: input.decidedAt, rejectMemo: input.rejectMemo })
    .where(and(eq(expenseDateChangeRequests.id, input.requestId), eq(expenseDateChangeRequests.status, "pending")))
    .returning();
  return row ?? null;
}

// 승인 되돌리기(디자인 D-F4) — 같은 처리자가 notBefore 이후 승인한 행만 대기로(처리자 · 시각 비움). 0행이면 null.
export async function revertApprovedDateChange(
  viewer: Viewer,
  input: { requestId: string; decidedBy: string; notBefore: Date },
  tx: DbOrTx,
): Promise<DateChangeRequestRow | null> {
  void viewer;
  const [row] = await tx
    .update(expenseDateChangeRequests)
    .set({ status: "pending", decidedBy: null, decidedAt: null })
    .where(
      and(
        eq(expenseDateChangeRequests.id, input.requestId),
        eq(expenseDateChangeRequests.status, "approved"),
        eq(expenseDateChangeRequests.decidedBy, input.decidedBy),
        gte(expenseDateChangeRequests.decidedAt, input.notBefore),
      ),
    )
    .returning();
  return row ?? null;
}

// 문서 하나의 이력(최신 순).
export async function listDateChangeHistory(viewer: Viewer, expenseId: string): Promise<DateChangeRequestRow[]> {
  void viewer;
  return db
    .select()
    .from(expenseDateChangeRequests)
    .where(eq(expenseDateChangeRequests.expenseId, expenseId))
    .orderBy(desc(expenseDateChangeRequests.createdAt), desc(expenseDateChangeRequests.id));
}

// 지급 대상 표 — 문서 id 묶음의 대기 요청 새 희망일을 한 번에(행마다 조회 없음).
export async function listPendingDateChanges(viewer: Viewer, expenseIds: readonly string[]): Promise<Map<string, string>> {
  void viewer;
  if (expenseIds.length === 0) return new Map();
  const rows = await db
    .select({ expenseId: expenseDateChangeRequests.expenseId, newDate: expenseDateChangeRequests.newDate })
    .from(expenseDateChangeRequests)
    .where(and(inArray(expenseDateChangeRequests.expenseId, [...expenseIds]), eq(expenseDateChangeRequests.status, "pending")));
  return new Map(rows.map((row) => [row.expenseId, row.newDate]));
}

// 알림 원천(07.2-18 Task 3) — 지운 문서는 빠진다. 오래된 순 · 상한은 부르는 종류가 NOTIFY_KIND_EVAL_MAX로 준다.
export type DateChangeRequestEventRow = { requestId: string; expenseId: string; number: string | null; requestedBy: string; at: Date };

export async function listDateChangeRequestsSince(viewer: Viewer, since: Date, limit: number, tx?: NotifyTx): Promise<DateChangeRequestEventRow[]> {
  void viewer;
  return (tx ?? db)
    .select({
      requestId: expenseDateChangeRequests.id,
      expenseId: expenseDateChangeRequests.expenseId,
      number: expenses.number,
      requestedBy: expenseDateChangeRequests.requestedBy,
      at: expenseDateChangeRequests.createdAt,
    })
    .from(expenseDateChangeRequests)
    .innerJoin(expenses, eq(expenses.id, expenseDateChangeRequests.expenseId))
    .where(and(eq(expenseDateChangeRequests.status, "pending"), gte(expenseDateChangeRequests.createdAt, since), isNull(expenses.deletedAt)))
    .orderBy(asc(expenseDateChangeRequests.createdAt), asc(expenseDateChangeRequests.id))
    .limit(limit);
}

export type DateChangeDecisionEventRow = {
  requestId: string;
  expenseId: string;
  requestedBy: string;
  decidedBy: string;
  status: "approved" | "rejected";
  newDate: string;
  rejectMemo: string | null;
  at: Date;
};

export async function listDateChangeDecisionsSince(viewer: Viewer, since: Date, limit: number, tx?: NotifyTx): Promise<DateChangeDecisionEventRow[]> {
  void viewer;
  const rows = await (tx ?? db)
    .select({
      requestId: expenseDateChangeRequests.id,
      expenseId: expenseDateChangeRequests.expenseId,
      requestedBy: expenseDateChangeRequests.requestedBy,
      decidedBy: expenseDateChangeRequests.decidedBy,
      status: expenseDateChangeRequests.status,
      newDate: expenseDateChangeRequests.newDate,
      rejectMemo: expenseDateChangeRequests.rejectMemo,
      at: expenseDateChangeRequests.decidedAt,
    })
    .from(expenseDateChangeRequests)
    .innerJoin(expenses, eq(expenses.id, expenseDateChangeRequests.expenseId))
    .where(
      and(
        inArray(expenseDateChangeRequests.status, ["approved", "rejected"]),
        gte(expenseDateChangeRequests.decidedAt, since),
        isNull(expenses.deletedAt),
      ),
    )
    .orderBy(asc(expenseDateChangeRequests.decidedAt), asc(expenseDateChangeRequests.id))
    .limit(limit);
  return rows.flatMap((row) =>
    row.decidedBy && row.at && (row.status === "approved" || row.status === "rejected")
      ? [{ ...row, decidedBy: row.decidedBy, at: row.at, status: row.status }]
      : [],
  );
}
