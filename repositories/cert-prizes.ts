import { and, asc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certPrizes } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.3-15 — 경품 목록 리포지토리. 경품 줄을 바꾸는 쓰기는 같은 행사 행을 먼저 잠근다
// (repositories/cert-events.ts lockEventRow 규약 — 04.3-10 · 04.3-17이 따른다).

export type CertPrizeRow = InferSelectModel<typeof certPrizes>;

export type InsertCertPrizeInput = {
  eventId: string;
  name: string;
  unitValueKrw: number;
  delivery: "onsite" | "parcel";
  sortOrder: number;
  winnerCount?: number;
};

// 행사의 경품 전체 — 경영관리 입력 순서(sort_order, 같으면 만든 순서).
export async function listPrizesForEvent(viewer: Viewer, eventId: string, tx: DbOrTx = db): Promise<CertPrizeRow[]> {
  void viewer;
  return tx
    .select()
    .from(certPrizes)
    .where(eq(certPrizes.eventId, eventId))
    .orderBy(asc(certPrizes.sortOrder), asc(certPrizes.createdAt));
}

// 공개 흐름 — 반드시 행사 id를 함께 건다(다른 행사의 경품 id로 찾지 못한다).
export async function findPrizeInEvent(
  viewer: Viewer,
  eventId: string,
  prizeId: string,
  tx: DbOrTx = db,
): Promise<CertPrizeRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certPrizes)
    .where(and(eq(certPrizes.id, prizeId), eq(certPrizes.eventId, eventId)))
    .limit(1);
  return row ?? null;
}

export async function insertPrizes(
  viewer: Viewer,
  rows: InsertCertPrizeInput[],
  tx: DbOrTx,
): Promise<CertPrizeRow[]> {
  void viewer;
  if (rows.length === 0) return [];
  return tx.insert(certPrizes).values(rows).returning();
}
