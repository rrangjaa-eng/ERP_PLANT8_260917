import { and, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { certEvents, certSubmissions, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 행사 행 잠금 규약(04.3-15 — eng-review newflow E13): 경품 줄 · 행사 상태를 바꾸는 모든 쓰기와 수령자 제출은
// 같은 행사 행을 lockEventRow로 먼저 잡는다. lockEventRow가 null이면(행이 지워짐 — 04.3-17 신청 취소, N16 a)
// 호출자는 아무것도 쓰지 않고 notFound로 끝낸다 — 04.3-10 generateQr · savePrizes · 04.3-17 closeEvent ·
// cancelRequest와 submitCertificate가 따른다.

export type CertEventRow = InferSelectModel<typeof certEvents>;

// 토큰 · 마감 · QR 생성 시각이 없으면 신청됨(QR 없음)이다 — 셋은 함께 채운다(cert_events_qr_state_check).
export type InsertCertEventInput = {
  name: string;
  wonOn: string; // YYYY-MM-DD
  tokenHash?: string;
  tokenEncrypted?: string;
  expiresAt?: Date | null;
  qrCreatedAt?: Date;
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

// 행사 행 FOR UPDATE(tx 안) — 위 규약의 잠금. 행이 없으면 null.
export async function lockEventRow(viewer: Viewer, eventId: string, tx: DbOrTx): Promise<CertEventRow | null> {
  void viewer;
  const [row] = await tx.select().from(certEvents).where(eq(certEvents.id, eventId)).for("update");
  return row ?? null;
}

// 04.3-10 — 「QR 생성 신청」 멱등 키로 찾는다(같은 사람 · 같은 키만 — 다른 사람의 키를 넘겨받지 않는다).
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

// 04.3-10 「QR 생성」 — 잠근 행(lockEventRow)에 토큰 · 해시 · 암호문 · 마감 · 생성 시각 · 생성자 · 요청 키를 함께 채우고
// 문의 전화 사본을 지금 설정값으로 다시 찍는다(신청과 공개가 며칠 떨어진다 — eng-review newflow E28).
export async function setQrGenerated(
  viewer: Viewer,
  eventId: string,
  input: {
    tokenHash: string;
    tokenEncrypted: string;
    expiresAt: Date;
    at: Date;
    by: string | null;
    requestId: string;
    contactPhone: string;
  },
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  await tx
    .update(certEvents)
    .set({
      tokenHash: input.tokenHash,
      tokenEncrypted: input.tokenEncrypted,
      expiresAt: input.expiresAt,
      qrCreatedAt: input.at,
      qrCreatedBy: input.by,
      qrRequestId: input.requestId,
      contactPhone: input.contactPhone,
      updatedAt: input.at,
    })
    .where(eq(certEvents.id, eventId));
}

// 04.3-17 「링크 닫기」 — 잠근 행(lockEventRow)에 닫힌 시각 · 사유(manual) · 닫은 사람을 채운다. 아직 닫히지 않았을 때만(조건부).
export async function closeEventManual(
  viewer: Viewer,
  eventId: string,
  input: { at: Date; by: string | null },
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const rows = await tx
    .update(certEvents)
    .set({ closedAt: input.at, closedReason: "manual", closedBy: input.by, updatedAt: input.at })
    .where(and(eq(certEvents.id, eventId), isNull(certEvents.closedAt)))
    .returning({ id: certEvents.id });
  return rows.length;
}

// 04.3-17(E21) — 닫은 행사 제출의 속도 제한용 IP 가명(submit_ip_hash)을 비운다. 15분 셈에만 쓰는 가명이라 닫히면 쓸 일이 없다
// (보호법 제21조①). 마감으로 닫힌 행사는 04.3-12 파기 Job이 비운다. version은 올리지 않는다(I4 낙관적 잠금과 무관).
export async function clearEventIpHashes(viewer: Viewer, eventId: string, tx: DbOrTx): Promise<number> {
  void viewer;
  const rows = await tx
    .update(certSubmissions)
    .set({ submitIpHash: null })
    .where(and(eq(certSubmissions.eventId, eventId), isNotNull(certSubmissions.submitIpHash)))
    .returning({ id: certSubmissions.id });
  return rows.length;
}

// 04.3-17 「신청 취소」 — 신청됨(토큰 없음) 행사 행을 지운다(N16 a — 보관함 규약 예외). 호출자가 잠근 뒤 경품 0을 확인했다.
export async function deleteRequestedEvent(viewer: Viewer, eventId: string, tx: DbOrTx): Promise<number> {
  void viewer;
  const rows = await tx
    .delete(certEvents)
    .where(and(eq(certEvents.id, eventId), isNull(certEvents.tokenHash)))
    .returning({ id: certEvents.id });
  return rows.length;
}

// 04.3-17 「신청 취소」 권한 판정 재료 — 신청자(created_by). 행이 없으면 undefined. 잠그지 않는다(트랜잭션 전 판정).
export async function findEventCreator(viewer: Viewer, eventId: string): Promise<string | null | undefined> {
  void viewer;
  const [row] = await db.select({ createdBy: certEvents.createdBy }).from(certEvents).where(eq(certEvents.id, eventId)).limit(1);
  return row ? row.createdBy : undefined;
}

// 04.3-04 Task 2 ④ — 내부 목록 · 상세. 범위 서술자: createdBy가 undefined면
// 전부, 값이면 그 사람이 만든 행사만(null = 시스템이 만든 행사).
export type CertEventScope = { createdBy?: string | null };

export type CertEventSummaryRow = {
  id: string;
  name: string;
  wonOn: string;
  createdAt: Date;
  expiresAt: Date | null;
  closedAt: Date | null;
  closedReason: string | null;
  tokenEncrypted: string | null;
  // 04.3-17 — 「신청 취소」 신청자 갈래(H-2) 판정 재료.
  createdBy: string | null;
  ownerName: string | null;
  closerName: string | null;
  submittedCount: number;
};

function scopeWhere(scope: CertEventScope): SQL | undefined {
  if (scope.createdBy === undefined) return undefined;
  return scope.createdBy === null ? isNull(certEvents.createdBy) : eq(certEvents.createdBy, scope.createdBy);
}

// 목록 · 상세 머리 공용 — 만든 사람 · 닫은 사람 이름과 제출 건수(대조 제외 뺀 수 — E1 b)를 한 쿼리로.
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
      eventId: certSubmissions.eventId,
      submitted: sql<number>`count(*)::int`.as("submitted"),
    })
    .from(certSubmissions)
    .where(isNull(certSubmissions.excludedAt))
    .groupBy(certSubmissions.eventId)
    .as("cert_event_tally");

  return db
    .select({
      id: certEvents.id,
      name: certEvents.name,
      wonOn: certEvents.wonOn,
      createdAt: certEvents.createdAt,
      expiresAt: certEvents.expiresAt,
      closedAt: certEvents.closedAt,
      closedReason: certEvents.closedReason,
      tokenEncrypted: certEvents.tokenEncrypted,
      createdBy: certEvents.createdBy,
      ownerName: owner.name,
      closerName: closer.name,
      submittedCount: sql<number>`coalesce(${tally.submitted}, 0)`,
    })
    .from(certEvents)
    .leftJoin(owner, eq(owner.id, certEvents.createdBy))
    .leftJoin(closer, eq(closer.id, certEvents.closedBy))
    .leftJoin(tally, eq(tally.eventId, certEvents.id))
    .where(and(scopeWhere(scope), eventId === undefined ? undefined : eq(certEvents.id, eventId)));
}
