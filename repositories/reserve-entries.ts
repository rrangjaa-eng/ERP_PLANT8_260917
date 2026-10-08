import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { reserveEntries, vendors, projects } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { RowScope } from "@/domain/permissions/scope-for";
import { rowScopeCondition } from "@/repositories/row-scope";
import type { DbOrTx } from "@/repositories/document-counters";
import type { VendorKind } from "@/domain/vendors/kind";

export type ReserveEntryRow = InferSelectModel<typeof reserveEntries>;

// 04-07(사용자 D5 · 엔지니어링 리뷰 B §1) — 리저브 쓰기의 직렬화 지점. 관련 클라이언트(vendors) 행을 **id 오름차순**
// `FOR NO KEY UPDATE`로 잠근다: 한 배치가 여러 클라이언트를 건드려도 교착이 없고, 리저브 쓰기끼리는 한 줄로 서지만
// 그 거래처를 가리키는 무관한 FK 쓰기(`FOR KEY SHARE`)는 막지 않는다. 잠근 행만 돌려준다 — 없는 클라이언트는 빠진다.
// 묶음 ④ /review R10 — 새 줄이 고를 수 있는 거래처인지(보관·숨김 아님) 잠근 값으로 판정하도록 `selectable`을 싣는다.
// 261006 「바뀔 때만 막기」 — 새 줄 클라이언트의 갈래 판정도 잠근 값으로 하도록 `kind`를 싣는다.
export async function lockReserveClients(
  viewer: Viewer,
  clientIds: string[],
  tx: DbOrTx,
): Promise<{ id: string; selectable: boolean; kind: VendorKind }[]> {
  void viewer;
  if (clientIds.length === 0) return [];
  const rows = await tx
    .select({ id: vendors.id, archivedAt: vendors.archivedAt, hidden: vendors.hidden, kind: vendors.kind })
    .from(vendors)
    .where(inArray(vendors.id, clientIds))
    .orderBy(vendors.id)
    .for("no key update");
  return rows.map((row) => ({ id: row.id, selectable: row.archivedAt === null && !row.hidden, kind: row.kind }));
}

export async function listActiveEntriesByClients(viewer: Viewer, clientIds: string[], tx: DbOrTx = db): Promise<ReserveEntryRow[]> {
  void viewer;
  if (clientIds.length === 0) return [];
  return tx
    .select()
    .from(reserveEntries)
    .where(and(inArray(reserveEntries.clientId, clientIds), isNull(reserveEntries.archivedAt)));
}

export async function listAllActiveEntries(viewer: Viewer, tx: DbOrTx = db): Promise<ReserveEntryRow[]> {
  void viewer;
  return tx.select().from(reserveEntries).where(isNull(reserveEntries.archivedAt));
}

// 보관된 줄도 포함한다 — 재전송 판정·보관 줄 수정 거부가 보관 여부를 본다.
export async function findEntriesByIds(viewer: Viewer, ids: string[], tx: DbOrTx = db): Promise<ReserveEntryRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  return tx.select().from(reserveEntries).where(inArray(reserveEntries.id, ids));
}

export async function findClientNames(viewer: Viewer, clientIds: string[], tx: DbOrTx = db): Promise<Map<string, string>> {
  void viewer;
  if (clientIds.length === 0) return new Map();
  const rows = await tx.select({ id: vendors.id, name: vendors.name }).from(vendors).where(inArray(vendors.id, clientIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// Codex #5 · CEO-D18 — 보관 여부를 싣고 판정은 domain이 한다.
export async function findProjectClientIds(viewer: Viewer, projectIds: string[], tx: DbOrTx): Promise<Map<string, { clientId: string; archived: boolean }>> {
  void viewer;
  if (projectIds.length === 0) return new Map();
  const rows = await tx.select({ id: projects.id, clientId: projects.clientId, archivedAt: projects.archivedAt }).from(projects).where(inArray(projects.id, projectIds));
  return new Map(rows.map((row) => [row.id, { clientId: row.clientId, archived: row.archivedAt !== null }]));
}

// 04-42 리뷰 B1 · S1 — 대장 줄이 가리키는 프로젝트 이름(보관된 프로젝트도 — 저장된 값을 그대로 보인다).
// 06.2(M8): 보는 범위 안 프로젝트만 — 범위 밖 줄은 이름 없이(잔액 · 고객사는 그대로).
export async function findProjectNames(viewer: Viewer, scope: RowScope, projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0 || scope.rows === "none") return new Map();
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(inArray(projects.id, projectIds), rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId })));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// 04-42 — 리저브 대장 프로젝트 칸의 선택지(보관 제외). 클라이언트별로 거르는 일은 화면이 한다.
// 06.2(M8): 보는 범위 안 프로젝트만.
export async function listProjectOptions(viewer: Viewer, scope: RowScope): Promise<{ id: string; name: string; clientId: string }[]> {
  if (scope.rows === "none") return [];
  return db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
    .from(projects)
    .where(and(isNull(projects.archivedAt), rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId })))
    .orderBy(projects.name);
}

export type ReserveEntryPayload = {
  entryDate: string;
  direction: string;
  amountCurrency: string;
  amountForeignAmount: string | null;
  amountFxRate: string;
  amountAmountKrw: number;
  projectId: string | null;
  evidenceType: string | null;
  taxInvoiceNumber: string | null;
  note: string | null;
};

// 화면이 만든 uuid로 멱등 삽입한다(ENG-D10) — 이미 있으면 넣지 않고 null.
export async function insertEntry(
  viewer: Viewer,
  input: ReserveEntryPayload & { id: string; clientId: string; createdAt?: Date },
  tx: DbOrTx,
): Promise<ReserveEntryRow | null> {
  void viewer;
  const [row] = await tx
    .insert(reserveEntries)
    .values({ ...input })
    .onConflictDoNothing({ target: reserveEntries.id })
    .returning();
  return row ?? null;
}

// 낙관적 잠금 — id·version·client_id가 모두 맞고 보관되지 않은 줄만 고친다. 0행이면 null(충돌).
export async function updateEntryIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  clientId: string,
  input: ReserveEntryPayload,
  tx: DbOrTx,
): Promise<ReserveEntryRow | null> {
  void viewer;
  const [row] = await tx
    .update(reserveEntries)
    .set({ ...input, version: sql`${reserveEntries.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(reserveEntries.id, id),
        eq(reserveEntries.version, expectedVersion),
        eq(reserveEntries.clientId, clientId),
        isNull(reserveEntries.archivedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function setEntryArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx = db): Promise<void> {
  await tx
    .update(reserveEntries)
    .set(value ? { archivedAt: new Date(), archivedBy: viewer.id, updatedAt: new Date() } : { archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(reserveEntries.id, id));
}

// 보관함 목록(repositories/archive.ts) — 이름은 금액 없는 `{날짜} {클라이언트} {구분}`이다. 보관함은 admin.archive 화면이라
// 리저브 노출 게이트(reserve.amount) 밖이므로 금액을 싣지 않는다.
export async function listArchivedEntryNames(viewer: Viewer): Promise<{ id: string; name: string; archivedAt: Date; archivedBy: string | null }[]> {
  void viewer;
  const rows = await db
    .select({
      id: reserveEntries.id,
      entryDate: reserveEntries.entryDate,
      direction: reserveEntries.direction,
      clientName: vendors.name,
      archivedAt: reserveEntries.archivedAt,
      archivedBy: reserveEntries.archivedBy,
    })
    .from(reserveEntries)
    .innerJoin(vendors, eq(vendors.id, reserveEntries.clientId))
    .where(isNotNull(reserveEntries.archivedAt));
  return rows.map((row) => ({
    id: row.id,
    name: `${row.entryDate} ${row.clientName} ${row.direction === "deposit" ? "입금" : "출금"}`,
    archivedAt: row.archivedAt as Date,
    archivedBy: row.archivedBy,
  }));
}
