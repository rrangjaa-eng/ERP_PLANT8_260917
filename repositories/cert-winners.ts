import { and, eq, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certEvents, certWinners } from "@/db/schema";
import type { VerifyIdemOutcomeMap } from "@/db/schema/cert-winners";

// domain은 db를 import하지 못한다 — 맵 모양 타입을 여기서 다시 내보낸다.
export type { VerifyIdemEntry, VerifyIdemOutcomeMap } from "@/db/schema/cert-winners";
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

// 04.3-03 Task 1 ③ — 확인(verifyLast4)이 쓰는 잠금 · 셈 · 판정 쓰기.
//
// 잠금 순서 규칙(교착 방지): 확인증 공개 쓰기는 늘 **행사 행 → 자리 행**
// 순서로 잠근다. 04.3-06 제출 · 04.3-10도 lockEventRow(viewer, eventId, tx)로
// 행사 행을 먼저 잠근다. tx에 기본값이 없다 — 잠금은 트랜잭션 밖에서 뜻이 없다.
export async function lockEventRow(
  viewer: Viewer,
  eventId: string,
  tx: DbOrTx,
): Promise<InferSelectModel<typeof certEvents> | null> {
  void viewer;
  const [row] = await tx.select().from(certEvents).where(eq(certEvents.id, eventId)).for("update");
  return row ?? null;
}

// 자리 한 행 FOR UPDATE — 행사 id와 자리 id를 함께 건다(행사 경계).
export async function lockWinnerInEvent(
  viewer: Viewer,
  eventId: string,
  winnerId: string,
  tx: DbOrTx,
): Promise<CertWinnerRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(certWinners)
    .where(and(eq(certWinners.id, winnerId), eq(certWinners.eventId, eventId)))
    .for("update");
  return row ?? null;
}

export type RecentMissesInput = { eventId: string; ipHash: string; since: Date };
export type RecentMisses = { eventMisses: number; ipMisses: number; rosterSize: number };

// 지난 창의 틀림 항목(맵의 o = wrong)을 행사 전체 · 이 IP 해시로 세고, 같은
// 쿼리에서 파기되지 않은 당첨자 수를 센다. at 비교는 timestamptz다(E3-34 —
// timestamp 캐스트는 ISO의 Z를 버려 프로세스 시간대에 따라 창이 어긋난다).
async function queryRecentMisses(runner: DbOrTx, input: RecentMissesInput): Promise<RecentMisses> {
  const since = input.since.toISOString();
  const result = await runner.execute<{ event_misses: number; ip_misses: number; roster_size: number }>(sql`
    select
      (select count(*)::int
         from cert_winners w, jsonb_each(coalesce(w.verify_idem_outcome, '{}'::jsonb)) e
        where w.event_id = ${input.eventId}
          and e.value->>'o' = 'wrong'
          and (e.value->>'at')::timestamptz >= ${since}::timestamptz) as event_misses,
      (select count(*)::int
         from cert_winners w, jsonb_each(coalesce(w.verify_idem_outcome, '{}'::jsonb)) e
        where w.event_id = ${input.eventId}
          and e.value->>'o' = 'wrong'
          and e.value->>'ip' = ${input.ipHash}
          and (e.value->>'at')::timestamptz >= ${since}::timestamptz) as ip_misses,
      (select count(*)::int from cert_winners where event_id = ${input.eventId} and purged_at is null) as roster_size
  `);
  const row = result.rows[0];
  return {
    eventMisses: row?.event_misses ?? 0,
    ipMisses: row?.ip_misses ?? 0,
    rosterSize: row?.roster_size ?? 0,
  };
}

// 잠근 콜백 안의 정본 셈(동시 요청이 한도를 넘지 못한다).
export async function countRecentMisses(
  viewer: Viewer,
  input: RecentMissesInput,
  tx: DbOrTx,
): Promise<RecentMisses> {
  void viewer;
  return queryRecentMisses(tx, input);
}

// 잠금 없음 — 트랜잭션을 열기 전 빠른 거름망 전용(AX-P2). 잠근 콜백 안에서
// 부르지 않는다(그 안의 셈은 countRecentMisses(…, tx)만).
export async function countRecentMissesUnlocked(viewer: Viewer, input: RecentMissesInput): Promise<RecentMisses> {
  void viewer;
  return queryRecentMisses(db, input);
}

export type WinnerVerifyStatePatch = {
  failedAttempts: number;
  lockedUntil: Date | null;
  cumulativeFailedAttempts: number;
  hardLockedAt: Date | null;
  verifyIdemOutcome: VerifyIdemOutcomeMap;
  verifyProofHash?: string;
  verifiedUntil?: Date;
  offeredConsentVersion?: string;
  offeredRetentionYears?: number;
};

// 확인 판정 결과를 한 번에 쓴다. version은 올리지 않는다(확인 시도·잠금은
// 담당자 편집이 아니다). 두 셈을 0으로 되돌리는 쓰기는 04.3-10 몫이다.
export async function writeWinnerVerifyState(
  viewer: Viewer,
  winnerId: string,
  patch: WinnerVerifyStatePatch,
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  await tx
    .update(certWinners)
    .set({ ...patch, updatedAt: new Date() })
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
