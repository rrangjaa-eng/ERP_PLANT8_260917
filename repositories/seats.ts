import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { Viewer } from "@/domain/viewer";

// 06.4(D-6408): 사람 · 관리자 · 팀 · 본부 자리 쓰기를 줄 세운다. 층 순서(사람 → 관리자 → 팀 → 본부)와 같은 층 정렬을
// 이 함수가 강제해 교착이 없다. 점유 팀을 읽어야 팀 키가 정해지는 쓰기는 사람 · 관리자 층을 먼저 잡고, 점유를 tx로 읽은 뒤
// 팀 · 본부 층을 두 번째 호출로 잡는다. 트랜잭션 끝에 풀린다(5초 lock_timeout — `lib/db-transaction.ts`).

export const ADMIN_SEAT_LOCK_KEY = "seat:admin:last";

export type SeatLockInput = {
  personIds?: readonly string[];
  admin?: boolean;
  teamIds?: readonly string[];
  orgUnitIds?: readonly string[];
};

function layer(prefix: string, ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])].sort().map((id) => prefix + id);
}

export function seatLockOrder(viewer: Viewer, input: SeatLockInput): string[] {
  void viewer;
  return [
    ...layer("seat:person:", input.personIds),
    ...(input.admin ? [ADMIN_SEAT_LOCK_KEY] : []),
    ...layer("seat:team:", input.teamIds),
    ...layer("seat:division:", input.orgUnitIds),
  ];
}

export async function lockSeatKeys(viewer: Viewer, input: SeatLockInput, tx: DbOrTx): Promise<void> {
  for (const key of seatLockOrder(viewer, input)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}
