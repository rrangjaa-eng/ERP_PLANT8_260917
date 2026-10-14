import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { setupExpenseProject } from "./fixtures/expenses";

// 06.5-01 — 06.5 새 칸 · 제약 · 색인이 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
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

describe("06.5 스키마 — 조정 줄 연결 칸(D-6502)", () => {
  type LineInsert = typeof quoteLines.$inferInsert;

  async function lineRow(revisionId: string, patch: Partial<LineInsert> = {}): Promise<LineInsert> {
    return {
      revisionId,
      subcategory: (await firstSelectableSubcategory()).value,
      itemName: "기타소득세 대납",
      lineKind: "adjustment",
      unitPriceAmountKrw: 14_100,
      executionAmountKrw: 14_100,
      quoteAmountKrw: 14_100,
      profitKrw: 0,
      ...patch,
    };
  }

  // source_expense_id에는 FK가 없다 — 실제 지출결의 행이 아닌 임의 uuid로도 들어간다.
  it("보관 안 된 조정 줄에 source_expense_id · source_synced_version을 넣을 수 있다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = randomUUID();
    const [row] = await db
      .insert(quoteLines)
      .values(await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 }))
      .returning({ sourceExpenseId: quoteLines.sourceExpenseId, sourceSyncedVersion: quoteLines.sourceSyncedVersion });
    expect(row).toEqual({ sourceExpenseId: expenseId, sourceSyncedVersion: 1 });
  });

  it("같은 지출결의의 보관 안 된 둘째 연결 줄은 quote_lines_source_expense_live_uniq로 거부되고 첫 줄을 보관하면 들어간다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = randomUUID();
    const [first] = await db
      .insert(quoteLines)
      .values(await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 }))
      .returning({ id: quoteLines.id });
    if (!first) throw new Error("줄 없음");
    const second = await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 });
    await expectPgError(() => db.insert(quoteLines).values(second), "23505", "quote_lines_source_expense_live_uniq");
    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, first.id));
    await expect(db.insert(quoteLines).values(second).returning({ id: quoteLines.id })).resolves.toHaveLength(1);
  });

  it("견적 줄(quote)에 source_expense_id를 넣으면 quote_lines_source_expense_kind_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const row = await lineRow(fx.revisionId, { lineKind: "quote", sourceExpenseId: randomUUID(), sourceSyncedVersion: 1 });
    await expectPgError(() => db.insert(quoteLines).values(row), "23514", "quote_lines_source_expense_kind_check");
  });

  it("source_expense_id만 있고 source_synced_version이 비면 quote_lines_source_synced_pair_check로 거부되고 둘 다 빈 줄은 들어간다", async () => {
    const fx = await setupExpenseProject();
    const half = await lineRow(fx.revisionId, { sourceExpenseId: randomUUID(), sourceSyncedVersion: null });
    await expectPgError(() => db.insert(quoteLines).values(half), "23514", "quote_lines_source_synced_pair_check");
    await expect(
      db
        .insert(quoteLines)
        .values(await lineRow(fx.revisionId, { sourceExpenseId: null, sourceSyncedVersion: null }))
        .returning({ id: quoteLines.id }),
    ).resolves.toHaveLength(1);
  });
});
