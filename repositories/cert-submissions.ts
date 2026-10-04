import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certPrizes, certSignatureUploads, certSubmissions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type CertSubmissionRow = InferSelectModel<typeof certSubmissions>;

export type InsertCertSubmissionInput = {
  eventId: string;
  prizeId: string;
  quantity: number;
  submitIpHash: string;
  certNo: string;
  name: string;
  rrnEncrypted: string;
  rrnMasked: string;
  phone: string;
  address: string | null;
  consentAt: Date;
  consentVersion: string;
  retentionYears: number;
  signatureKey: string;
  idempotencyKeyHash: string;
  submittedAt: Date;
};

export async function insertSubmission(
  viewer: Viewer,
  input: InsertCertSubmissionInput,
  tx: DbOrTx,
): Promise<CertSubmissionRow> {
  void viewer;
  const [row] = await tx
    .insert(certSubmissions)
    .values(input)
    .returning();
  if (!row) throw new Error("cert_submissions insert가 행을 반환하지 않았습니다.");
  return row;
}

// 04.3-15 — 같은 멱등 키 재전송(잠금 전 · 잠근 뒤). 행사 id를 함께 건다.
export async function findSubmissionByIdempotency(
  viewer: Viewer,
  eventId: string,
  keyHash: string,
  tx: DbOrTx = db,
): Promise<CertSubmissionRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, eventId), eq(certSubmissions.idempotencyKeyHash, keyHash)))
    .limit(1);
  return row ?? null;
}

// 04.3-15 속도 제한(설계 /cso E10) — 창 안에 저장된 제출 행 수. 대조 제외 · 파기 칸과 무관하게 센다.
export async function countRecentSubmissionsByIp(
  viewer: Viewer,
  input: { eventId: string; ipHash: string; since: Date },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(certSubmissions)
    .where(
      and(
        eq(certSubmissions.eventId, input.eventId),
        eq(certSubmissions.submitIpHash, input.ipHash),
        gte(certSubmissions.submittedAt, input.since),
      ),
    );
  return row?.count ?? 0;
}

export async function countRecentSubmissionsByEvent(
  viewer: Viewer,
  input: { eventId: string; since: Date },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, input.eventId), gte(certSubmissions.submittedAt, input.since)));
  return row?.count ?? 0;
}

// 04.3-10(설계 /cso E10) — 행사 누적 제출 수(대조 제외 뺀 행). 제출 한도 알림 조건일 뿐 제출을 막지 않는다.
export async function countActiveSubmissionsByEvent(viewer: Viewer, eventId: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, eventId), isNull(certSubmissions.excludedAt)));
  return row?.count ?? 0;
}

// 04.3-17 — I′3 제출 섹션(대조) 원재료: 파기되지 않은 제출(대조 제외 포함)을 제출 시각 오름차순으로, 필요한 칸만.
// 경품 가액은 파기 대상 판정(domain)에만 쓰고 DTO로 옮기지 않는다. 주민등록번호 · 주소 · 서명은 고르지 않는다.
export type CertSubmissionReconcileRow = {
  id: string;
  prizeId: string;
  name: string | null;
  phone: string | null;
  quantity: number;
  submittedAt: Date;
  excludedAt: Date | null;
  unitValueKrw: number;
};

export async function listSubmissionsForReconcile(viewer: Viewer, eventId: string): Promise<CertSubmissionReconcileRow[]> {
  void viewer;
  return db
    .select({
      id: certSubmissions.id,
      prizeId: certSubmissions.prizeId,
      name: certSubmissions.name,
      phone: certSubmissions.phone,
      quantity: certSubmissions.quantity,
      submittedAt: certSubmissions.submittedAt,
      excludedAt: certSubmissions.excludedAt,
      unitValueKrw: certPrizes.unitValueKrw,
    })
    .from(certSubmissions)
    .innerJoin(certPrizes, eq(certPrizes.id, certSubmissions.prizeId))
    .where(and(eq(certSubmissions.eventId, eventId), isNull(certSubmissions.purgedAt)))
    .orderBy(asc(certSubmissions.submittedAt), asc(certSubmissions.id));
}

// 04.3-17 「대조 제외」(E1 b) — 잠근 행사 행 아래에서 제외 시각 · 제외한 사람을 채운다(아직 제외 · 파기되지 않았을 때만).
// 개인정보 칸 비우기는 같은 tx의 04.3-12 clearSubmissionPersonalFields(exclude 모드)가 한다. 되돌리는 함수는 없다.
export async function markSubmissionExcluded(
  viewer: Viewer,
  id: string,
  input: { at: Date; by: string },
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const rows = await tx
    .update(certSubmissions)
    .set({ excludedAt: input.at, excludedBy: input.by })
    .where(and(eq(certSubmissions.id, id), isNull(certSubmissions.excludedAt), isNull(certSubmissions.purgedAt)))
    .returning({ id: certSubmissions.id });
  return rows.length;
}

// 04.3-06 — 커밋 결과 불명 뒤 이 요청이 올린 객체를 가리키는 제출 줄이 있는지.
export async function findSubmissionBySignatureKey(
  viewer: Viewer,
  eventId: string,
  signatureKey: string,
  tx: DbOrTx,
): Promise<CertSubmissionRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, eventId), eq(certSubmissions.signatureKey, signatureKey)))
    .limit(1);
  return row ?? null;
}

// 규약 C3 — 서명 업로드 의도 표 도우미. FK도 개인정보도 없다.
export async function insertSignatureUploadIntent(viewer: Viewer, objectKey: string): Promise<void> {
  void viewer;
  await db.insert(certSignatureUploads).values({ objectKey });
}

export async function deleteSignatureUploadIntent(viewer: Viewer, objectKey: string, tx: DbOrTx = db): Promise<void> {
  void viewer;
  await tx.delete(certSignatureUploads).where(eq(certSignatureUploads.objectKey, objectKey));
}

// 04.3-12(파기)가 부른다 — 이 페이즈는 표만 만든다.
export async function listStaleSignatureUploadIntents(viewer: Viewer, olderThan: Date): Promise<string[]> {
  void viewer;
  const rows = await db
    .select({ objectKey: certSignatureUploads.objectKey })
    .from(certSignatureUploads)
    .where(lt(certSignatureUploads.createdAt, olderThan));
  return rows.map((row) => row.objectKey);
}
