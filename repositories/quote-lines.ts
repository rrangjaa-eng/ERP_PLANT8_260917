import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type QuoteLineRow = InferSelectModel<typeof quoteLines>;

export async function listQuoteLinesByRevision(viewer: Viewer, revisionId: string): Promise<QuoteLineRow[]> {
  void viewer;
  return db
    .select()
    .from(quoteLines)
    .where(eq(quoteLines.revisionId, revisionId))
    .orderBy(quoteLines.sortOrder);
}

// 04-04 Task 2 ① — 배치 저장이 쓰기 전에 현재 값·버전을 한 번에 읽는다
// (버전 비교 → 셀 단위 충돌 판정의 입력). db.transaction의 tx로 불러야
// 같은 트랜잭션 안에서 읽고-비교하고-쓴다(격리 수준 안에서 일관된 스냅샷).
export async function findQuoteLinesByIds(viewer: Viewer, ids: string[], tx: DbOrTx = db): Promise<QuoteLineRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  return tx.select().from(quoteLines).where(inArray(quoteLines.id, ids));
}

export async function findQuoteLineById(viewer: Viewer, id: string): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id)).limit(1);
  return row ?? null;
}

export type QuoteLineInsertInput = {
  revisionId: string;
  sortOrder: number;
  subcategory: string;
  itemName: string;
  vendorId?: string | null;
  quantity: string;
  unitPriceCurrency: string;
  unitPriceForeignAmount: string | null;
  unitPriceFxRate: string;
  unitPriceAmountKrw: number;
  executionCurrency: string;
  executionForeignAmount: string | null;
  executionFxRate: string;
  executionAmountKrw: number;
  quoteAmountKrw: number;
  profitKrw: number;
  lineStatus: string;
  note?: string | null;
  copiedFromLineId?: string | null;
  source?: string;
  customFields?: Record<string, unknown>;
};

export async function insertQuoteLine(
  viewer: Viewer,
  input: QuoteLineInsertInput,
  tx: DbOrTx = db,
): Promise<QuoteLineRow> {
  void viewer;
  const [row] = await tx
    .insert(quoteLines)
    .values({
      revisionId: input.revisionId,
      sortOrder: input.sortOrder,
      subcategory: input.subcategory,
      itemName: input.itemName,
      vendorId: input.vendorId ?? null,
      quantity: input.quantity,
      unitPriceCurrency: input.unitPriceCurrency,
      unitPriceForeignAmount: input.unitPriceForeignAmount,
      unitPriceFxRate: input.unitPriceFxRate,
      unitPriceAmountKrw: input.unitPriceAmountKrw,
      executionCurrency: input.executionCurrency,
      executionForeignAmount: input.executionForeignAmount,
      executionFxRate: input.executionFxRate,
      executionAmountKrw: input.executionAmountKrw,
      quoteAmountKrw: input.quoteAmountKrw,
      profitKrw: input.profitKrw,
      lineStatus: input.lineStatus,
      note: input.note ?? null,
      copiedFromLineId: input.copiedFromLineId ?? null,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("quote_lines insert가 행을 반환하지 않았습니다.");
  return row;
}

export type QuoteLineUpdateInput = Omit<QuoteLineInsertInput, "revisionId" | "copiedFromLineId" | "source">;

// D-65: 줄 버전 충돌 — 저장 요청이 읽은 버전과 다르면 UPDATE가 0행을
// 돌려준다(WHERE version = expectedVersion). null은 "충돌 또는 존재하지
// 않음" 신호이고, 호출자(domain/quotes/lines)가 구분해 처리한다.
export async function updateQuoteLineIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  input: QuoteLineUpdateInput,
  tx: DbOrTx = db,
): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({
      sortOrder: input.sortOrder,
      subcategory: input.subcategory,
      itemName: input.itemName,
      vendorId: input.vendorId ?? null,
      quantity: input.quantity,
      unitPriceCurrency: input.unitPriceCurrency,
      unitPriceForeignAmount: input.unitPriceForeignAmount,
      unitPriceFxRate: input.unitPriceFxRate,
      unitPriceAmountKrw: input.unitPriceAmountKrw,
      executionCurrency: input.executionCurrency,
      executionForeignAmount: input.executionForeignAmount,
      executionFxRate: input.executionFxRate,
      executionAmountKrw: input.executionAmountKrw,
      quoteAmountKrw: input.quoteAmountKrw,
      profitKrw: input.profitKrw,
      lineStatus: input.lineStatus,
      note: input.note ?? null,
      version: sql`${quoteLines.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(quoteLines.id, id), eq(quoteLines.version, expectedVersion)))
    .returning();
  return row ?? null;
}
