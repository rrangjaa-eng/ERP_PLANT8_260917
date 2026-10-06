import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, expensePayments } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";

// 06-27 — Phase 6 표 · 제약이 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

async function expectPgError(run: () => Promise<unknown>, code: string, constraint: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect({ code: cause?.code, constraint: cause?.constraint }).toEqual({ code, constraint });
}

async function makeDraftExpense(): Promise<{ expenseId: string; userId: string }> {
  const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, null);
  const [row] = await db.insert(expenses).values({ drafterId: drafter.id }).returning({ id: expenses.id });
  if (!row) throw new Error("지출결의 없음");
  return { expenseId: row.id, userId: drafter.id };
}

function paymentRow(expenseId: string, userId: string, extra: Partial<typeof expensePayments.$inferInsert> = {}) {
  return {
    expenseId,
    payDate: "2026-10-06",
    transferKrw: 1_100_000,
    payableKrw: 1_100_000,
    diffKrw: 0,
    paymentMethod: "transfer",
    processedBy: userId,
    ...extra,
  } satisfies typeof expensePayments.$inferInsert;
}

describe("expense_payments", () => {
  it("같은 문서에 살아 있는 지급 둘째 행은 expense_payments_live_uniq로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await db.insert(expensePayments).values(paymentRow(expenseId, userId));
    await expectPgError(() => db.insert(expensePayments).values(paymentRow(expenseId, userId)), "23505", "expense_payments_live_uniq");
  });

  it("첫 지급을 취소한 뒤에는 같은 문서에 새 살아 있는 지급이 들어간다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    const [first] = await db.insert(expensePayments).values(paymentRow(expenseId, userId)).returning({ id: expensePayments.id });
    if (!first) throw new Error("지급 없음");
    await db
      .update(expensePayments)
      .set({ cancelledAt: new Date(), cancelledBy: userId, cancelReason: "금액 착오" })
      .where(eq(expensePayments.id, first.id));
    await expect(db.insert(expensePayments).values(paymentRow(expenseId, userId)).returning({ id: expensePayments.id })).resolves.toHaveLength(1);
  });

  it("차이가 있는데 사유가 없거나 공백뿐이면 expense_payments_diff_reason_check로 거부되고 사유가 있으면 들어간다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: null })),
      "23514",
      "expense_payments_diff_reason_check",
    );
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: "   " })),
      "23514",
      "expense_payments_diff_reason_check",
    );
    await expect(
      db
        .insert(expensePayments)
        .values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: "계좌 수수료" }))
        .returning({ id: expensePayments.id }),
    ).resolves.toHaveLength(1);
  });

  it("취소 칸 중 취소 시각만 채우면 expense_payments_cancel_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { cancelledAt: new Date() })),
      "23514",
      "expense_payments_cancel_check",
    );
  });
});
