import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { certEvents, certPrizes, certSubmissions, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.3-07 — I4 확인·정정(경영관리). 권한 판정은 domain/certs/review.ts가 한다.

export type CertReviewSourceRow = {
  id: string;
  eventId: string;
  certNo: string;
  eventName: string;
  wonOn: string;
  submittedAt: Date;
  name: string | null;
  rrnMasked: string | null;
  phone: string | null;
  address: string | null;
  delivery: string;
  prizeName: string;
  quantity: number;
  // 04.3-17 — 파기 대상 판정(domain)에만 쓴다. DTO로 옮기지 않는다.
  unitValueKrw: number;
  consentAt: Date;
  signatureKey: string | null;
  purgedAt: Date | null;
  version: number;
  // 04.3-17 ⑥-b — 「주민번호만 비운」 판정 키(rrn_encrypted IS NULL). 암호문 자체는 싣지 않는다(I4 · 인쇄 경로에 암호문 없음).
  rrnCleared: boolean;
  // 04.3-17 「대조 제외」(E1 b) — 제외 시각 · 제외한 사람 이름.
  excludedAt: Date | null;
  excludedByName: string | null;
};

// 확인증 한 줄 + 경품(경품명 · 전달 — 지금 경품 목록에서) · 수량(제출에서) + 행사 이름(04.3-15 — 명단 없음).
export async function findSubmissionForReview(viewer: Viewer, id: string): Promise<CertReviewSourceRow | null> {
  void viewer;
  const excluder = alias(users, "cert_submission_excluder");
  const [row] = await db
    .select({
      id: certSubmissions.id,
      eventId: certSubmissions.eventId,
      certNo: certSubmissions.certNo,
      eventName: certEvents.name,
      wonOn: certEvents.wonOn,
      submittedAt: certSubmissions.submittedAt,
      name: certSubmissions.name,
      rrnMasked: certSubmissions.rrnMasked,
      phone: certSubmissions.phone,
      address: certSubmissions.address,
      delivery: certPrizes.delivery,
      prizeName: certPrizes.name,
      quantity: certSubmissions.quantity,
      unitValueKrw: certPrizes.unitValueKrw,
      consentAt: certSubmissions.consentAt,
      signatureKey: certSubmissions.signatureKey,
      purgedAt: certSubmissions.purgedAt,
      version: certSubmissions.version,
      rrnCleared: sql<boolean>`${certSubmissions.rrnEncrypted} is null`,
      excludedAt: certSubmissions.excludedAt,
      excludedByName: excluder.name,
    })
    .from(certSubmissions)
    .innerJoin(certPrizes, eq(certPrizes.id, certSubmissions.prizeId))
    .innerJoin(certEvents, eq(certEvents.id, certSubmissions.eventId))
    .leftJoin(excluder, eq(excluder.id, certSubmissions.excludedBy))
    .where(eq(certSubmissions.id, id))
    .limit(1);
  return row ?? null;
}

// 전체 보기용 — 암호문과 파기 여부를 FOR SHARE로 잠근 행에서 함께 읽는다(tx 안).
// 파기 UPDATE는 이 잠금이 풀린 뒤에만 칸을 비운다.
export async function lockSubmissionRrnForShare(
  viewer: Viewer,
  id: string,
  tx: DbOrTx,
): Promise<{ rrnEncrypted: string | null; purgedAt: Date | null; excludedAt: Date | null } | null> {
  void viewer;
  const [row] = await tx
    .select({ rrnEncrypted: certSubmissions.rrnEncrypted, purgedAt: certSubmissions.purgedAt, excludedAt: certSubmissions.excludedAt })
    .from(certSubmissions)
    .where(eq(certSubmissions.id, id))
    .limit(1)
    .for("share");
  return row ?? null;
}

export type CorrectSubmissionPatch = {
  name?: string;
  phone?: string;
  address?: string;
  rrnEncrypted?: string;
  rrnMasked?: string;
  quantity?: number;
};

// 버전 조건부 갱신(tx 안) — 파기 · 대조 제외되지 않았고 version이 입력과 같을 때만. 바뀐 행 수를 돌려준다.
export async function updateSubmissionIfVersion(
  viewer: Viewer,
  id: string,
  version: number,
  patch: CorrectSubmissionPatch,
  at: Date,
  tx: DbOrTx,
): Promise<number> {
  const rows = await tx
    .update(certSubmissions)
    .set({ ...patch, updatedBy: viewer.id, updatedAt: at, version: sql`${certSubmissions.version} + 1` })
    .where(
      and(
        eq(certSubmissions.id, id),
        eq(certSubmissions.version, version),
        isNull(certSubmissions.purgedAt),
        isNull(certSubmissions.excludedAt),
      ),
    )
    .returning({ id: certSubmissions.id });
  return rows.length;
}

// 04.3-17 「대조 제외」 — 행사 행을 잠근 뒤 그 제출 행을 FOR UPDATE로 다시 읽는다(제외 · 파기 · 버전 판정).
export async function lockSubmissionForUpdate(
  viewer: Viewer,
  id: string,
  tx: DbOrTx,
): Promise<{ name: string | null; version: number; purgedAt: Date | null; excludedAt: Date | null } | null> {
  void viewer;
  const [row] = await tx
    .select({
      name: certSubmissions.name,
      version: certSubmissions.version,
      purgedAt: certSubmissions.purgedAt,
      excludedAt: certSubmissions.excludedAt,
    })
    .from(certSubmissions)
    .where(eq(certSubmissions.id, id))
    .limit(1)
    .for("update");
  return row ?? null;
}

// 마지막 정정자 이름 · 시각(버전 충돌 문장).
export async function findLastCorrection(
  viewer: Viewer,
  id: string,
): Promise<{ byName: string | null; at: Date; purgedAt: Date | null; excludedAt: Date | null } | null> {
  void viewer;
  const [row] = await db
    .select({
      byName: users.name,
      at: certSubmissions.updatedAt,
      purgedAt: certSubmissions.purgedAt,
      excludedAt: certSubmissions.excludedAt,
    })
    .from(certSubmissions)
    .leftJoin(users, eq(users.id, certSubmissions.updatedBy))
    .where(eq(certSubmissions.id, id))
    .limit(1);
  return row ?? null;
}
