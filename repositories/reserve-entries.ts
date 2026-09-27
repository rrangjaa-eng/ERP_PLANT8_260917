import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { reserveEntries, vendors, projects } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type ReserveEntryRow = InferSelectModel<typeof reserveEntries>;

// 04-07(사용자 D5 · 엔지니어링 리뷰 B §1) — 리저브 쓰기의 직렬화 지점. 관련 클라이언트(vendors) 행을 **id 오름차순**
// `FOR NO KEY UPDATE`로 잠근다: 한 배치가 여러 클라이언트를 건드려도 교착이 없고, 리저브 쓰기끼리는 한 줄로 서지만
// 그 거래처를 가리키는 무관한 FK 쓰기(`FOR KEY SHARE`)는 막지 않는다. 잠근 id만 돌려준다 — 없는 클라이언트는 빠진다.
export async function lockReserveClients(viewer: Viewer, clientIds: string[], tx: DbOrTx): Promise<string[]> {
  void viewer;
  if (clientIds.length === 0) return [];
  const rows = await tx
    .select({ id: vendors.id })
    .from(vendors)
    .where(inArray(vendors.id, clientIds))
    .orderBy(vendors.id)
    .for("no key update");
  return rows.map((row) => row.id);
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
export async function findEntriesByIds(viewer: Viewer, ids: string[], tx: DbOrTx): Promise<ReserveEntryRow[]> {
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

export async function findProjectClientIds(viewer: Viewer, projectIds: string[], tx: DbOrTx): Promise<Map<string, string>> {
  void viewer;
  if (projectIds.length === 0) return new Map();
  const rows = await tx.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(inArray(projects.id, projectIds));
  return new Map(rows.map((row) => [row.id, row.clientId]));
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

export async function setEntryArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx): Promise<void> {
  await tx
    .update(reserveEntries)
    .set(value ? { archivedAt: new Date(), archivedBy: viewer.id, updatedAt: new Date() } : { archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(reserveEntries.id, id));
}
