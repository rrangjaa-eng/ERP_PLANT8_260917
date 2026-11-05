import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { setupExpenseProject } from "./fixtures/expenses";

// 07.2-01(R1) — 07.2 새 칸 · 표 · CHECK가 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 쓰는 길은 뒤 플랜이 만든다.
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

type LineInsert = typeof quoteLines.$inferInsert;

async function lineRow(revisionId: string, patch: Partial<LineInsert> = {}): Promise<LineInsert> {
  return {
    revisionId,
    subcategory: (await firstSelectableSubcategory()).value,
    itemName: "무대 설치",
    unitPriceAmountKrw: 100_000,
    executionAmountKrw: 80_000,
    quoteAmountKrw: 100_000,
    profitKrw: 20_000,
    ...patch,
  };
}

async function insertLine(revisionId: string, patch: Partial<LineInsert> = {}): Promise<string> {
  const [row] = await db.insert(quoteLines).values(await lineRow(revisionId, patch)).returning({ id: quoteLines.id });
  if (!row) throw new Error("줄 없음");
  return row.id;
}

describe("07.2 스키마 — 견적 줄 일수(PU6 · D-7230 · D-7231)", () => {
  it("일수를 주지 않은 줄은 days = 1.00이다(기존 견적가가 바뀌지 않는다)", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    const result = await db.execute<{ days: string }>(sql`SELECT days FROM quote_lines WHERE id = ${id}`);
    expect(result.rows[0]?.days).toBe("1.00");
  });

  it("일수 0 · −1은 quote_lines_days_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    for (const days of ["0", "-1"]) {
      await expectPgError(
        () => db.execute(sql`UPDATE quote_lines SET days = ${days}::numeric WHERE id = ${id}`),
        "23514",
        "quote_lines_days_check",
      );
    }
  });
});
