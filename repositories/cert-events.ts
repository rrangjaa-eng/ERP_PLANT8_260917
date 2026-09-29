import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { certEvents, certWinners, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type CertEventRow = InferSelectModel<typeof certEvents>;

export type InsertCertEventInput = {
  name: string;
  wonOn: string; // YYYY-MM-DD
  tokenHash: string;
  tokenEncrypted: string;
  expiresAt: Date;
  contactPhone: string;
  createdBy: string | null;
  createRequestId?: string | null;
};

export async function insertEvent(
  viewer: Viewer,
  input: InsertCertEventInput,
  tx: DbOrTx = db,
): Promise<CertEventRow> {
  void viewer;
  const [row] = await tx.insert(certEvents).values(input).returning();
  if (!row) throw new Error("cert_events insert가 행을 반환하지 않았습니다.");
  return row;
}

// 공개 흐름 진입점 — 토큰 해시로만 찾는다(행사 id를 추측할 수 없다).
export async function findEventByTokenHash(viewer: Viewer, tokenHash: string): Promise<CertEventRow | null> {
  void viewer;
  const [row] = await db.select().from(certEvents).where(eq(certEvents.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

// 04.3-02 Task 2 ⑩ — 제출 트랜잭션이 행사 행을 잠근다(FOR UPDATE). 호출자가
// 연 트랜잭션 안에서만 부른다(tx 필수).
export async function lockEventForUpdate(viewer: Viewer, eventId: string, tx: DbOrTx): Promise<CertEventRow | null> {
  void viewer;
  const [row] = await tx.select().from(certEvents).where(eq(certEvents.id, eventId)).for("update");
  return row ?? null;
}

// 04.3-04 Task 2 ④ — 내부 목록 · 상세. 범위 서술자: createdBy가 undefined면
// 전부, 값이면 그 사람이 만든 행사만(null = 시스템이 만든 행사).
export type CertEventScope = { createdBy?: string | null };

export type CertEventSummaryRow = {
  id: string;
  name: string;
  wonOn: string;
  expiresAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
  tokenEncrypted: string;
  ownerName: string | null;
  closerName: string | null;
  totalCount: number;
  submittedCount: number;
};

function scopeWhere(scope: CertEventScope): SQL | undefined {
  if (scope.createdBy === undefined) return undefined;
  return scope.createdBy === null ? isNull(certEvents.createdBy) : eq(certEvents.createdBy, scope.createdBy);
}

// 목록 · 상세 머리 공용 — 만든 사람 · 닫은 사람 이름과 제출 수 집계를 한 쿼리로.
export async function listEventSummaries(
  viewer: Viewer,
  scope: CertEventScope,
  eventId?: string,
): Promise<CertEventSummaryRow[]> {
  void viewer;
  const owner = alias(users, "cert_event_owner");
  const closer = alias(users, "cert_event_closer");
  const tally = db
    .select({
      eventId: certWinners.eventId,
      total: sql<number>`count(*)::int`.as("total"),
      submitted: sql<number>`count(${certWinners.submittedAt})::int`.as("submitted"),
    })
    .from(certWinners)
    .groupBy(certWinners.eventId)
    .as("cert_event_tally");

  return db
    .select({
      id: certEvents.id,
      name: certEvents.name,
      wonOn: certEvents.wonOn,
      expiresAt: certEvents.expiresAt,
      closedAt: certEvents.closedAt,
      closedReason: certEvents.closedReason,
      tokenEncrypted: certEvents.tokenEncrypted,
      ownerName: owner.name,
      closerName: closer.name,
      totalCount: sql<number>`coalesce(${tally.total}, 0)`,
      submittedCount: sql<number>`coalesce(${tally.submitted}, 0)`,
    })
    .from(certEvents)
    .leftJoin(owner, eq(owner.id, certEvents.createdBy))
    .leftJoin(closer, eq(closer.id, certEvents.closedBy))
    .leftJoin(tally, eq(tally.eventId, certEvents.id))
    .where(and(scopeWhere(scope), eventId === undefined ? undefined : eq(certEvents.id, eventId)));
}

// E3-22 — 만들기 멱등 키로 한 행. 만든 사람으로 묶어 남의 키로 남의 링크를 받지 못한다.
export async function findEventByCreateRequest(
  viewer: Viewer,
  input: { requestId: string; createdBy: string | null },
  tx: DbOrTx = db,
): Promise<CertEventRow | null> {
  void viewer;
  const createdBy = input.createdBy === null ? isNull(certEvents.createdBy) : eq(certEvents.createdBy, input.createdBy);
  const [row] = await tx
    .select()
    .from(certEvents)
    .where(and(eq(certEvents.createRequestId, input.requestId), createdBy))
    .limit(1);
  return row ?? null;
}
