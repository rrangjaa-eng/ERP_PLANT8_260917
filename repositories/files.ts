import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { files } from "@/db/schema";
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

// 삭제되지 않은 행 전부 — 무효 행도 싣는다(화면이 취소선 · 배지로 그린다). 올린 순.
export async function listActiveByOwner(viewer: Viewer, ownerKind: string, ownerId: string): Promise<FileRow[]> {
  void viewer;
  return db
    .select()
    .from(files)
    .where(and(eq(files.ownerKind, ownerKind), eq(files.ownerId, ownerId), isNull(files.removedAt)))
    .orderBy(asc(files.createdAt), asc(files.id));
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
