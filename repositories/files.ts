import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { files, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 05-04(EVID-01): 증빙 파일 표. 「살아 있는 파일」 = 삭제되지 않았고(removed_at) 무효 처리되지 않은(voided_at) 행 —
// 게이트 ⑧ 개수와 중복 검사는 이 조건만 센다. 이 모듈은 domain을 import하지 않는다(06-11 X-4).

export type FileRow = InferSelectModel<typeof files>;
export type FileInsert = Omit<InferInsertModel<typeof files>, "createdAt" | "removedAt" | "removedBy" | "voidedAt" | "voidedBy" | "voidReason">;

const alive = () => and(isNull(files.removedAt), isNull(files.voidedAt));

export async function insertFile(viewer: Viewer, values: FileInsert, tx: DbOrTx): Promise<FileRow> {
  void viewer;
  const [row] = await tx.insert(files).values(values).returning();
  if (!row) throw new Error("files insert returned no row");
  return row;
}

export async function findFileById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<FileRow | null> {
  void viewer;
  const [row] = await tx.select().from(files).where(eq(files.id, id)).limit(1);
  return row ?? null;
}

// 같은 sha256의 살아 있는 파일 — 주인 종류 목록 안에서만(06-11이 기다리는 모양: 중복은 같은 종류 주인끼리).
export async function findActiveBySha(
  viewer: Viewer,
  sha256: string,
  ownerKinds: readonly string[],
  tx: DbOrTx = db,
): Promise<Pick<FileRow, "id" | "ownerKind" | "ownerId">[]> {
  void viewer;
  if (ownerKinds.length === 0) return [];
  return tx
    .select({ id: files.id, ownerKind: files.ownerKind, ownerId: files.ownerId })
    .from(files)
    .where(and(eq(files.sha256, sha256), inArray(files.ownerKind, [...ownerKinds]), alive()))
    .orderBy(asc(files.createdAt), asc(files.id));
}

export async function countActiveByOwner(viewer: Viewer, ownerKind: string, ownerId: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.ownerKind, ownerKind), eq(files.ownerId, ownerId), alive()));
  return row?.count ?? 0;
}

// 삭제되지 않은 행 전부 — 무효 행도 싣는다(화면이 취소선 · 배지로 그린다). 올린 순. 05-09: 무효 처리한 사람 이름을 붙인다.
export async function listActiveByOwner(viewer: Viewer, ownerKind: string, ownerId: string): Promise<(FileRow & { voidedByName: string | null })[]> {
  void viewer;
  const rows = await db
    .select({ file: files, voidedByName: users.name })
    .from(files)
    .leftJoin(users, eq(users.id, files.voidedBy))
    .where(and(eq(files.ownerKind, ownerKind), eq(files.ownerId, ownerId), isNull(files.removedAt)))
    .orderBy(asc(files.createdAt), asc(files.id));
  return rows.map((row) => ({ ...row.file, voidedByName: row.voidedByName }));
}

// 아직 지워지지 않은 행만 — 0행이면 false(이미 지워짐).
export async function markRemoved(viewer: Viewer, input: { id: string; removedBy: string }, tx: DbOrTx): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(files)
    .set({ removedAt: new Date(), removedBy: input.removedBy })
    .where(and(eq(files.id, input.id), isNull(files.removedAt)))
    .returning({ id: files.id });
  return rows.length > 0;
}

// 05-09: 살아 있는 행에만 무효 세 칸을 쓴다 — 0행이면 null(이미 무효 · 지워짐). 시각은 주입이 없으면 DB now() — 올린 시각(files.created_at
// 기본값)과 같은 시계라 무효 뒤 신호의 순서 비교가 어긋나지 않는다.
export async function markVoided(
  viewer: Viewer,
  input: { id: string; voidedBy: string; reason: string; at?: Date },
  tx: DbOrTx,
): Promise<FileRow | null> {
  void viewer;
  const [row] = await tx
    .update(files)
    .set({ voidedAt: input.at ?? sql`now()`, voidedBy: input.voidedBy, voidReason: input.reason })
    .where(and(eq(files.id, input.id), alive()))
    .returning();
  return row ?? null;
}

// 05-09(G1): 무효 뒤 아직 새 증빙이 없는 주인 — 지워지지 않은 행 가운데 가장 늦은 무효가 있고, 살아 있는 행이 없거나 가장 늦은
// 무효가 가장 늦게 올린 살아 있는 행보다 늦다. 한 쿼리(GROUP BY · HAVING).
export async function findUnresolvedVoidOwnerIds(
  viewer: Viewer,
  input: { ownerKind: string; ownerIds: readonly string[] },
  tx: DbOrTx = db,
): Promise<string[]> {
  void viewer;
  if (input.ownerIds.length === 0) return [];
  const lastVoid = sql`max(${files.voidedAt})`;
  const lastLive = sql`max(${files.createdAt}) filter (where ${files.voidedAt} is null)`;
  const rows = await tx
    .select({ ownerId: files.ownerId })
    .from(files)
    .where(and(eq(files.ownerKind, input.ownerKind), inArray(files.ownerId, [...input.ownerIds]), isNull(files.removedAt)))
    .groupBy(files.ownerId)
    .having(sql`${lastVoid} is not null and (${lastLive} is null or ${lastVoid} > ${lastLive})`);
  return rows.map((row) => row.ownerId);
}
