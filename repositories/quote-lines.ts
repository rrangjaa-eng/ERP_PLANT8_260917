import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { expensePayments, quoteLines, quoteRevisions } from "@/db/schema";
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

// 04-16(D-84 · B-18) — 차수의 견적 합계(보관 제외). node-pg는 bigint를 문자열로 주므로 경계에서 숫자로 바꾼다.
export async function sumQuoteAmountByRevision(viewer: Viewer, revisionId: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}), 0)::bigint`.mapWith(Number) })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return row?.total ?? 0;
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

// D-66 계보 재료 — 프로젝트들의 모든 차수의 보관 안 된 줄(프로젝트 · id · 차수 순번 · 복사 원본)을 한 쿼리로. 제출 tx는 tx로 부른다.
export async function listLineageLinesByProjects(
  viewer: Viewer,
  projectIds: string[],
  tx: DbOrTx = db,
): Promise<
  {
    projectId: string;
    id: string;
    revisionSeq: number;
    copiedFromLineId: string | null;
    executionCurrency: string;
    executionForeignAmount: string | null;
    executionFxRate: string;
    executionAmountKrw: number;
  }[]
> {
  void viewer;
  if (projectIds.length === 0) return [];
  // 06-07(E-13 · N-1) — 실행가 칸을 더해 넓혔다(사슬 현재 줄의 실행가 = 카드 쪽 상한 바탕). 05 호출부는 더한 칸을 읽지 않는다.
  return tx
    .select({
      projectId: quoteRevisions.projectId,
      id: quoteLines.id,
      revisionSeq: quoteRevisions.seq,
      copiedFromLineId: quoteLines.copiedFromLineId,
      executionCurrency: quoteLines.executionCurrency,
      executionForeignAmount: quoteLines.executionForeignAmount,
      executionFxRate: quoteLines.executionFxRate,
      executionAmountKrw: quoteLines.executionAmountKrw,
    })
    .from(quoteLines)
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .where(and(inArray(quoteRevisions.projectId, projectIds), isNull(quoteLines.archivedAt)));
}

// 05 /review A7 — 여러 차수의 보관 안 된 줄을 한 쿼리로(listQuoteLinesByRevision과 같은 순서).
export async function listQuoteLinesByRevisions(viewer: Viewer, revisionIds: string[]): Promise<QuoteLineRow[]> {
  void viewer;
  if (revisionIds.length === 0) return [];
  return db
    .select()
    .from(quoteLines)
    .where(and(inArray(quoteLines.revisionId, revisionIds), isNull(quoteLines.archivedAt)))
    .orderBy(quoteLines.sortOrder, quoteLines.id);
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
    .set({ archivedAt: input.archivedAt, archivedBy: input.archivedBy, version: humanArchiveVersion() })
    .where(and(inArray(quoteLines.id, input.ids), eq(quoteLines.revisionId, input.revisionId), isNull(quoteLines.archivedAt)))
    .returning({ id: quoteLines.id });
  return rows.length;
}

// 06.5 OI-12: 사람이 지운 규칙 줄은 손 편집이다 — version만 올려 `version ≠ source_synced_version`으로 남기고, 재지급이 다시 만들지 않게 한다.
// 연결 없는 줄은 +0(동작 그대로).
function humanArchiveVersion() {
  return sql`${quoteLines.version} + case when ${quoteLines.sourceExpenseId} is null then 0 else 1 end`;
}

// 06.5 EP2-A1: 규칙 줄은 지급이 살아 있고 형제가 없을 때만 사람이 되살린다 — 취소된 지급의 대납 세금 부활 · 부분 유일 색인 23505를 막는다.
// 0행은 호출자의 기존 갈래(restoreQuoteLine 실패 · 보관함 「바뀐 행 없음」)가 받는다.
function restorableByHuman() {
  return or(
    isNull(quoteLines.sourceExpenseId),
    and(
      sql`not exists (select 1 from ${quoteLines} as sibling where sibling.source_expense_id = ${quoteLines.sourceExpenseId} and sibling.archived_at is null)`,
      sql`exists (select 1 from ${expensePayments} where ${expensePayments.expenseId} = ${quoteLines.sourceExpenseId} and ${expensePayments.cancelledAt} is null)`,
    ),
  );
}

// 04-12(A-19 · OV-2) — 보관 해제(도메인 복원 restoreQuoteLine이 잠근 tx로 부른다). 해제한 행이 없으면 null.
export async function restoreQuoteLineRow(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({ archivedAt: null, archivedBy: null })
    .where(and(eq(quoteLines.id, id), isNotNull(quoteLines.archivedAt), restorableByHuman()))
    .returning();
  return row ?? null;
}

// 보관함 등록(repositories/archive.ts)의 범용 보관·해제 — 다른 표와 같은 조건부 UPDATE(멱등).
export async function setQuoteLineArchived(viewer: Viewer, id: string, value: boolean): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await db
        .update(quoteLines)
        .set({ archivedAt: new Date(), archivedBy: viewer.id, version: humanArchiveVersion() })
        .where(and(eq(quoteLines.id, id), isNull(quoteLines.archivedAt)))
        .returning({ id: quoteLines.id })
    : await db
        .update(quoteLines)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(quoteLines.id, id), isNotNull(quoteLines.archivedAt), restorableByHuman()))
        .returning({ id: quoteLines.id });
  return rows.length > 0;
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

// 04-14(D-53 · D-48) — 새 차수가 복사하는 줄: 보관되지 않은 견적 줄·견적 외 비용(조정 줄은 옮긴다).
const COPYABLE_KINDS = ["quote", "out_of_quote"];

// 04-15(CEO 리뷰 B-32) — 프로젝트 복사는 취소 상태 줄을 빼고 센다(`excludeCancelled`). 새 차수는 취소 줄도 센다.
function copyableLineConditions(revisionId: string, excludeCancelled: boolean) {
  const conditions = [eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt), inArray(quoteLines.lineKind, COPYABLE_KINDS)];
  if (excludeCancelled) conditions.push(ne(quoteLines.lineStatus, "cancelled"));
  return and(...conditions);
}

export async function countCopyableLines(
  viewer: Viewer,
  revisionId: string,
  tx: DbOrTx = db,
  opts: { excludeCancelled?: boolean } = {},
): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(quoteLines)
    .where(copyableLineConditions(revisionId, opts.excludeCancelled ?? false));
  return row?.count ?? 0;
}

// 04-14(D-53 · CEO 리뷰 B-32 · 엔지 리뷰 GAP 5b) — INSERT…SELECT 한 문장. 새 id·새 차수·version 1·새 시각만 바꾸고
// 나머지 컬럼은 표 정의 전체를 원본에서 그대로 옮긴다(컬럼이 늘어도 빠지지 않는다). `withLineage`면 계보에 원본 id
// (04-15의 프로젝트 복사는 false · 취소 줄 제외 `excludeCancelled`). 넣은 행 수를 돌려준다.
export async function copyQuoteLines(
  viewer: Viewer,
  input: { fromRevisionId: string; toRevisionId: string; withLineage: boolean; excludeCancelled?: boolean },
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const rows = await tx
    .insert(quoteLines)
    .select(
      tx
        .select({
          ...getTableColumns(quoteLines),
          id: sql`gen_random_uuid()`.as("id"),
          revisionId: sql`${input.toRevisionId}::uuid`.as("revision_id"),
          copiedFromLineId: (input.withLineage ? sql`${quoteLines.id}` : sql`null::uuid`).as("copied_from_line_id"),
          version: sql`1`.as("version"),
          createdAt: sql`now()`.as("created_at"),
          updatedAt: sql`now()`.as("updated_at"),
        })
        .from(quoteLines)
        .where(copyableLineConditions(input.fromRevisionId, input.excludeCancelled ?? false)),
    )
    .returning({ id: quoteLines.id });
  return rows.length;
}

// 04-14(D-87 · 사용자 D19-10 · CEO 리뷰 B-21) — 조정 줄은 복사하지 않고 새 현재 차수로 옮긴다. 보관된 조정 줄까지
// 전부(두고 가면 나중 복원이 이전 차수에 되살린다). 옮긴 행 수를 돌려준다.
export async function moveAdjustmentLines(
  viewer: Viewer,
  input: { fromRevisionId: string; toRevisionId: string },
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const rows = await tx
    .update(quoteLines)
    .set({
      revisionId: input.toRevisionId,
      version: sql`${quoteLines.version} + 1`,
      // 06.5 D-6502 · EP1-5: 차수 이동은 사람의 편집이 아니다 — 규칙 줄의 동기 버전을 version과 함께 올린다(옛은 조정이 행사에 매인
      // 별도 표라 이 문제가 없었다 O: server/src/confirmations.ts:704-707). 손 편집 줄은 불일치 그대로, 연결 없는 줄은 null 그대로.
      sourceSyncedVersion: sql`case when ${quoteLines.sourceSyncedVersion} = ${quoteLines.version} then ${quoteLines.version} + 1 else ${quoteLines.sourceSyncedVersion} end`,
      updatedAt: new Date(),
    })
    .where(and(eq(quoteLines.revisionId, input.fromRevisionId), eq(quoteLines.lineKind, "adjustment")))
    .returning({ id: quoteLines.id });
  return rows.length;
}

// ── 06.5 D-6502: 규칙(지급 완료)이 쓰는 조정 줄 ────────────────────────────
// 사람 편집 경로(권한 · 줄 수 상한 · project.line-edit)를 지나지 않는다. `source_synced_version = version`이 「사람이 고치지 않은 줄」의
// 판정이다(옛에 없는 새 규칙 — 옛은 덮어씀 O: server/src/confirmations.ts:827-837). 잠금은 호출자가 lockQuoteLines로 한다.

export type SourcedAdjustmentValues = Omit<QuoteLineInsertInput, "id" | "lineKind" | "copiedFromLineId" | "source" | "customFields" | "vendorId" | "note"> & {
  sourceExpenseId: string;
};

export async function findLiveLineBySourceExpense(viewer: Viewer, expenseId: string, tx: DbOrTx): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.sourceExpenseId, expenseId), isNull(quoteLines.archivedAt)))
    .limit(1);
  return row ?? null;
}

// OI-12 — 가장 최근에 보관된 연결 줄(같으면 id 내림차순 — 매번 같은 줄). 사람이 지운 줄(version ≠ 동기 버전)이면 재지급이 다시 만들지 않는다.
export async function findLastArchivedLineBySourceExpense(
  viewer: Viewer,
  expenseId: string,
  tx: DbOrTx,
): Promise<Pick<QuoteLineRow, "id" | "version" | "sourceSyncedVersion"> | null> {
  void viewer;
  const [row] = await tx
    .select({ id: quoteLines.id, version: quoteLines.version, sourceSyncedVersion: quoteLines.sourceSyncedVersion })
    .from(quoteLines)
    .where(and(eq(quoteLines.sourceExpenseId, expenseId), isNotNull(quoteLines.archivedAt)))
    .orderBy(desc(quoteLines.archivedAt), desc(quoteLines.id))
    .limit(1);
  return row ?? null;
}

// 도메인이 만든 칸 값을 그대로 넣는다 — 동기 버전은 삽입 행의 version(한 문장).
export async function insertSourcedAdjustmentLine(viewer: Viewer, values: SourcedAdjustmentValues, tx: DbOrTx): Promise<QuoteLineRow> {
  void viewer;
  const [row] = await tx
    .insert(quoteLines)
    .values({ ...values, lineKind: "adjustment", version: 1, sourceSyncedVersion: 1 })
    .returning();
  if (!row) throw new Error("조정 줄을 넣지 못했다");
  return row;
}

// 보관 안 됨 ∧ 읽은 version ∧ 동기 버전 = version일 때만 칸을 바꾸고 version · 동기 버전을 같이 +1. 0행이면 null.
export async function updateSourcedAdjustmentLine(
  viewer: Viewer,
  input: {
    id: string;
    expectedVersion: number;
    itemName: string;
    executionCurrency: string;
    executionForeignAmount: string | null;
    executionFxRate: string;
    executionAmountKrw: number;
    profitKrw: number;
  },
  tx: DbOrTx,
): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({
      itemName: input.itemName,
      executionCurrency: input.executionCurrency,
      executionForeignAmount: input.executionForeignAmount,
      executionFxRate: input.executionFxRate,
      executionAmountKrw: input.executionAmountKrw,
      profitKrw: input.profitKrw,
      version: sql`${quoteLines.version} + 1`,
      sourceSyncedVersion: sql`${quoteLines.version} + 1`,
      updatedAt: new Date(),
    })
    .where(sourcedUnchanged(input.id, input.expectedVersion))
    .returning();
  return row ?? null;
}

// 같은 조건에서 보관 + version · 동기 버전 +1(둘은 같게 남는다 — 규칙이 보관한 줄은 재지급이 새 줄을 만든다). 0행이면 null.
export async function archiveSourcedAdjustmentLine(
  viewer: Viewer,
  input: { id: string; expectedVersion: number; archivedBy: string },
  tx: DbOrTx,
): Promise<QuoteLineRow | null> {
  void viewer;
  const [row] = await tx
    .update(quoteLines)
    .set({
      archivedAt: new Date(),
      archivedBy: input.archivedBy,
      version: sql`${quoteLines.version} + 1`,
      sourceSyncedVersion: sql`${quoteLines.version} + 1`,
      updatedAt: new Date(),
    })
    .where(sourcedUnchanged(input.id, input.expectedVersion))
    .returning();
  return row ?? null;
}

function sourcedUnchanged(id: string, expectedVersion: number) {
  return and(
    eq(quoteLines.id, id),
    isNull(quoteLines.archivedAt),
    eq(quoteLines.version, expectedVersion),
    isNotNull(quoteLines.sourceExpenseId),
    sql`${quoteLines.sourceSyncedVersion} = ${quoteLines.version}`,
  );
}
