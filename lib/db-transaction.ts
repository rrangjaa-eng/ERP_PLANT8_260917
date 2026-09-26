import { sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// Phase 4(04-01): domain은 db를 직접 import할 수 없다(boundaries,
// `{ from: "domain", allow: ["domain", "repositories", "lib"] }`). 번호
// 부여 + 문서 INSERT를 같은 트랜잭션에 묶어야 하는 domain 함수
// (createProject·saveQuoteLines)는 이 lib 래퍼를 거쳐 트랜잭션을 연다 —
// 실제 쿼리는 여전히 repositories 함수만 한다(domain은 tx를 그 함수들에
// 전달만 한다).
//
// Phase 4(04-32, ENG-D3 ①): 콜백 전에 `SET LOCAL lock_timeout = '5s'`를 한 번
// 돌려 잠금 대기 무한을 막고, 잠금·풀 연결 시간 초과(db/client.ts의
// connectionTimeoutMillis 포함)를 UserFacing 오류로 바꾼다. 규약 전문은
// docs/ARCHITECTURE.md §4-8.
const LOCK_WAIT_USER_MESSAGE = "다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장";

function isTxTimeoutError(error: unknown): boolean {
  // drizzle-orm이 실제 pg 오류를 DrizzleQueryError로 감싸 cause에 넣는다
  // (node_modules/drizzle-orm/errors.js) — 원인 사슬을 따라가며 확인한다.
  for (let current: unknown = error; current instanceof Error; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: string }).code === "55P03") return true; // lock_not_available
    if (current.message.includes("timeout exceeded when trying to connect")) return true;
  }
  return false;
}

// ENG-D11(04-32 실측): 04-02가 만든 domain/projects/ledger.ts의
// saveProjectLedger는 트랜잭션을 열기 전(findProject·findQuoteRevisionById)과
// 연 뒤(listRevenue)에도 풀 db로 읽는다 — 그 지점들도 같은 시간 초과 판정·
// 변환이 필요해 재사용 가능한 형태로 꺼내 둔다(withTransaction도 이것을 쓴다).
export async function withTimeoutConversion<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isTxTimeoutError(error)) throw new UserFacingError(LOCK_WAIT_USER_MESSAGE);
    throw error;
  }
}

export async function withTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  // db.transaction이 주는 tx는 DbOrTx보다 넓다 — DbOrTx 타입 자체는
  // 04.2-06이 delete·execute까지 넓혔지만, 여기서는 넓어지기 전 tx 원본에
  // SET LOCAL을 쓴다.
  return withTimeoutConversion(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      return fn(tx);
    }),
  );
}
