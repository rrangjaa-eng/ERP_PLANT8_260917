import { and, eq, lt } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certSignatureUploads, certSubmissions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type CertSubmissionRow = InferSelectModel<typeof certSubmissions>;

export type InsertCertSubmissionInput = {
  winnerId: string;
  eventId: string;
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

export async function findSubmissionByWinnerId(viewer: Viewer, winnerId: string): Promise<CertSubmissionRow | null> {
  void viewer;
  const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId)).limit(1);
  return row ?? null;
}

// 04.3-06 — 제출 재생(같은 키) · 잠근 뒤 재판정이 읽는다. 행사 id를 함께 건다.
export async function findSubmissionForWinner(
  viewer: Viewer,
  eventId: string,
  winnerId: string,
  tx: DbOrTx = db,
): Promise<CertSubmissionRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certSubmissions)
    .where(and(eq(certSubmissions.eventId, eventId), eq(certSubmissions.winnerId, winnerId)))
    .limit(1);
  return row ?? null;
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
