import { and, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certWinners } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type CertWinnerRow = InferSelectModel<typeof certWinners>;

export type InsertCertWinnerInput = {
  eventId: string;
  name: string;
  phone: string;
  distinguishLabel: string | null;
  prizeName: string;
  quantity: number;
  delivery: "onsite" | "parcel";
  sortOrder: number;
};

export async function insertWinners(
  viewer: Viewer,
  winners: InsertCertWinnerInput[],
  tx: DbOrTx = db,
): Promise<CertWinnerRow[]> {
  void viewer;
  if (winners.length === 0) return [];
  return tx.insert(certWinners).values(winners).returning();
}

// 공개 목록·구별 표시 겹침 검사가 쓰는 행사 전체 당첨자 — 파기된 자리도
// 포함해 돌려준다(가림·묶음 판정은 domain/certs/roster-display가 이름
// null을 걸러낸다).
export async function listWinnersForIntake(viewer: Viewer, eventId: string): Promise<CertWinnerRow[]> {
  void viewer;
  return db
    .select()
    .from(certWinners)
    .where(eq(certWinners.eventId, eventId))
    .orderBy(certWinners.sortOrder);
}

// 공개 흐름 전용 — 반드시 eventId를 where 절에 건다(행사 경계, T-04.3-09).
export async function findWinnerInEvent(
  viewer: Viewer,
  eventId: string,
  winnerId: string,
  tx: DbOrTx = db,
): Promise<CertWinnerRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certWinners)
    .where(and(eq(certWinners.id, winnerId), eq(certWinners.eventId, eventId)))
    .limit(1);
  return row ?? null;
}

export type MarkWinnerVerifiedInput = {
  verifyProofHash: string;
  verifiedUntil: Date;
  offeredConsentVersion: string;
  offeredRetentionYears: number;
};

// 확인 성공 — 증표 해시·만료 시각·그 자리에 묶는 동의문 판·보존 연수를
// 한 번의 갱신으로 적는다.
export async function markWinnerVerified(
  viewer: Viewer,
  winnerId: string,
  input: MarkWinnerVerifiedInput,
): Promise<void> {
  void viewer;
  await db
    .update(certWinners)
    .set({
      verifyProofHash: input.verifyProofHash,
      verifiedUntil: input.verifiedUntil,
      offeredConsentVersion: input.offeredConsentVersion,
      offeredRetentionYears: input.offeredRetentionYears,
      updatedAt: new Date(),
    })
    .where(eq(certWinners.id, winnerId));
}

// 제출 확정 — submitted_at IS NULL일 때만 갱신되고, 증표 해시·묶인 동의
// 두 칸도 비운다(롤백되면 증표가 되살아나 같은 증표로 다시 제출할 수
// 있다). 갱신된 행 수를 반환한다(0이면 이미 제출됨).
export async function markWinnerSubmitted(
  viewer: Viewer,
  winnerId: string,
  submittedAt: Date,
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const updated = await tx
    .update(certWinners)
    .set({
      submittedAt,
      verifyProofHash: null,
      verifiedUntil: null,
      offeredConsentVersion: null,
      offeredRetentionYears: null,
      updatedAt: new Date(),
    })
    .where(and(eq(certWinners.id, winnerId), isNull(certWinners.submittedAt)))
    .returning({ id: certWinners.id });
  return updated.length;
}
