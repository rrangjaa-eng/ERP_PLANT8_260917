import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type QuoteLineRow = InferSelectModel<typeof quoteLines>;

// 04-12(A-03 · 엔지 리뷰 A §2 P2) — 표시 순서는 sort_order, 같은 값이면 줄 id(두 번 읽어도 같은 순서).
// 잠근 트랜잭션 안(저장 결과 목록)에서는 tx로 부른다. 보관된 줄은 빠진다(A-04).
export async function listQuoteLinesByRevision(viewer: Viewer, revisionId: string, tx: DbOrTx = db): Promise<QuoteLineRow[]> {
  void viewer;
  return tx
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)))
    .orderBy(quoteLines.sortOrder, quoteLines.id);
}

// 04-26(D-86) — 차수의 활성 줄 수(보관 제외 — 취소 줄 포함). 상한 판정은 프로젝트 행을 잠근 tx로 부른다.
export async function countActiveLinesByRevision(viewer: Viewer, revisionId: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return row?.count ?? 0;
}

// 04-04 Task 2 ① — 배치 저장이 쓰기 전에 현재 값·버전을 한 번에 읽는다
// (버전 비교 → 셀 단위 충돌 판정의 입력). db.transaction의 tx로 불러야
// 같은 트랜잭션 안에서 읽고-비교하고-쓴다(격리 수준 안에서 일관된 스냅샷).
// 04-12(B-01 줄 소속) — 그 차수의 줄만 찾는다. 다른 차수·프로젝트의 id는 결과에 없다.
export async function findQuoteLinesByIds(
  viewer: Viewer,
  ids: string[],
  scope: { revisionId: string },
  tx: DbOrTx = db,
): Promise<QuoteLineRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(quoteLines)
    .where(and(inArray(quoteLines.id, ids), eq(quoteLines.revisionId, scope.revisionId)));
}

export async function findQuoteLineById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx.select().from(quoteLines).where(eq(quoteLines.id, id)).limit(1);
  return row ?? null;
}

export type QuoteLineInsertInput = {
  // 04-12(ENG-D10) — 화면이 만든 줄 id. 없으면 DB 기본값.
  id?: string;
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
  // 04-13 — 줄 종류(없으면 DB 기본값 quote). 새 줄에서만 쓴다 — 갱신은 이 칸을 쓰지 않는다.
  lineKind?: string;
  note?: string | null;
  copiedFromLineId?: string | null;
  source?: string;
  customFields?: Record<string, unknown>;
};

// 04-12(ENG-D10) — 새 줄 멱등 삽입. 같은 id가 이미 있으면 아무것도 쓰지 않고 null — 호출자가 그 id를 다시 읽어
// 재전송(같은 값)·불일치·소속을 판정한다.
export async function insertQuoteLineIfAbsent(
  viewer: Viewer,
  input: QuoteLineInsertInput,
  tx: DbOrTx = db,
): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .insert(quoteLines)
    .values({
      ...(input.id ? { id: input.id } : {}),
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
      ...(input.lineKind ? { lineKind: input.lineKind } : {}),
      note: input.note ?? null,
      copiedFromLineId: input.copiedFromLineId ?? null,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .onConflictDoNothing({ target: quoteLines.id })
    .returning();
  return row ?? null;
}

// 04-12(엔지 리뷰 A §2 P2) — 표시 순서만 다시 쓴다. 셀 충돌 판정 대상이 아니라 version을 올리지 않는다.
// 호출자는 값이 바뀐 줄만 넘긴다.
export async function setQuoteLineSortOrders(
  viewer: Viewer,
  revisionId: string,
  pairs: { id: string; sortOrder: number }[],
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  for (const pair of pairs) {
    await tx
      .update(quoteLines)
      .set({ sortOrder: pair.sortOrder })
      .where(and(eq(quoteLines.id, pair.id), eq(quoteLines.revisionId, revisionId)));
  }
}

// 04-12(D-56 · A-04) — 그 차수 소속이고 아직 보관되지 않은 줄만 보관한다. 보관한 행 수를 돌려준다.
export async function archiveQuoteLines(
  viewer: Viewer,
  input: { ids: string[]; revisionId: string; archivedBy: string; archivedAt: Date },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  if (input.ids.length === 0) return 0;
  const rows = await tx
    .update(quoteLines)
    .set({ archivedAt: input.archivedAt, archivedBy: input.archivedBy })
    .where(and(inArray(quoteLines.id, input.ids), eq(quoteLines.revisionId, input.revisionId), isNull(quoteLines.archivedAt)))
    .returning({ id: quoteLines.id });
  return rows.length;
}

// 04-12(A-19 · OV-2) — 보관 해제(도메인 복원 restoreQuoteLine이 잠근 tx로 부른다). 해제한 행이 없으면 null.
export async function restoreQuoteLineRow(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({ archivedAt: null, archivedBy: null })
    .where(and(eq(quoteLines.id, id), isNotNull(quoteLines.archivedAt)))
    .returning();
  return row ?? null;
}

// 보관함 등록(repositories/archive.ts)의 범용 보관·해제 — 다른 표와 같은 조건부 UPDATE(멱등).
export async function setQuoteLineArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(quoteLines)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(quoteLines.id, id), isNull(quoteLines.archivedAt)));
  } else {
    await db
      .update(quoteLines)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(quoteLines.id, id), isNotNull(quoteLines.archivedAt)));
  }
}

// 04-12(A-03) — 순서는 셀 갱신이 쓰지 않는다(기존 줄의 sort_order는 그대로).
export type QuoteLineUpdateInput = Omit<QuoteLineInsertInput, "id" | "revisionId" | "sortOrder" | "lineKind" | "copiedFromLineId" | "source">;

// D-65: 줄 버전 충돌 — 저장 요청이 읽은 버전과 다르면 UPDATE가 0행을
// 돌려준다(WHERE version = expectedVersion). null은 "충돌 또는 존재하지
// 않음" 신호이고, 호출자(domain/quotes/lines)가 구분해 처리한다.
export async function updateQuoteLineIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  scope: { revisionId: string },
  input: QuoteLineUpdateInput,
  tx: DbOrTx = db,
): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({
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
    .where(
      and(eq(quoteLines.id, id), eq(quoteLines.revisionId, scope.revisionId), eq(quoteLines.version, expectedVersion)),
    )
    .returning();
  return row ?? null;
}
