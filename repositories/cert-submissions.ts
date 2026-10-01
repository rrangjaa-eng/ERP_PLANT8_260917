import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certSignatureUploads, certSubmissions } from "@/db/schema";
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
