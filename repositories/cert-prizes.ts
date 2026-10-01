import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certPrizes, certSubmissions } from "@/db/schema";
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

// 04.3-10 — 경품 편집 표 저장(applyPrizeChanges가 부른다). 호출자는 같은 tx에서 lockEventRow를 먼저 잡고 버전을
// 대조한 뒤 부른다 — 모든 경품 쓰기가 행사 행 잠금 아래라 아래 버전 조건이 0행이면 규약 위반이다(던져서 되돌린다).
export type PrizeRowValues = { name: string; unitValueKrw: number; delivery: "onsite" | "parcel"; winnerCount: number };

export type PrizeRowChanges = {
  inserts: Array<PrizeRowValues & { sortOrder: number }>;
  updates: Array<{ id: string; version: number; values: PrizeRowValues }>;
  deletes: Array<{ id: string; version: number }>;
};

export async function applyPrizeRows(
  viewer: Viewer,
  eventId: string,
  changes: PrizeRowChanges,
  userId: string | null,
  tx: DbOrTx,
): Promise<{ inserted: CertPrizeRow[]; updated: CertPrizeRow[]; deleted: CertPrizeRow[] }> {
  void viewer;
  const now = new Date();
  const deleted: CertPrizeRow[] = [];
  for (const target of changes.deletes) {
    const [row] = await tx
      .delete(certPrizes)
      .where(and(eq(certPrizes.id, target.id), eq(certPrizes.eventId, eventId), eq(certPrizes.version, target.version)))
      .returning();
    if (!row) throw new Error(`cert_prizes 삭제 버전 불일치: ${target.id}`);
    deleted.push(row);
  }
  const updated: CertPrizeRow[] = [];
  for (const target of changes.updates) {
    const [row] = await tx
      .update(certPrizes)
      .set({ ...target.values, version: target.version + 1, updatedBy: userId, updatedAt: now })
      .where(and(eq(certPrizes.id, target.id), eq(certPrizes.eventId, eventId), eq(certPrizes.version, target.version)))
      .returning();
    if (!row) throw new Error(`cert_prizes 갱신 버전 불일치: ${target.id}`);
    updated.push(row);
  }
  const inserted =
    changes.inserts.length === 0
      ? []
      : await tx
          .insert(certPrizes)
          .values(changes.inserts.map((values) => ({ ...values, eventId, updatedBy: userId })))
          .returning();
  return { inserted, updated, deleted };
}

export type CertPrizeSummaryRow = CertPrizeRow & {
  submittedCount: number;
  // 수량별 제출 수(대조 제외 뺀 행) — 파기 대상 미리 보기(가액 × 수량 ≤ 50,000)의 재료.
  quantityCounts: Array<{ quantity: number; count: number }>;
};

// 경품 줄마다 제출 수 · 수량별 제출 수. 대조 제외(excluded_at)된 제출은 세지 않는다(E1 b · DR-1).
export async function listPrizeSummaries(viewer: Viewer, eventId: string, tx: DbOrTx = db): Promise<CertPrizeSummaryRow[]> {
  const prizes = await listPrizesForEvent(viewer, eventId, tx);
  if (prizes.length === 0) return [];
  const tallies = await tx
    .select({
      prizeId: certSubmissions.prizeId,
      quantity: certSubmissions.quantity,
      count: sql<number>`count(*)::int`,
    })
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, eventId), isNull(certSubmissions.excludedAt)))
    .groupBy(certSubmissions.prizeId, certSubmissions.quantity)
    .orderBy(asc(certSubmissions.quantity));
  return prizes.map((prize) => {
    const quantityCounts = tallies
      .filter((tally) => tally.prizeId === prize.id)
      .map((tally) => ({ quantity: tally.quantity, count: tally.count }));
    return { ...prize, submittedCount: quantityCounts.reduce((sum, q) => sum + q.count, 0), quantityCounts };
  });
}
