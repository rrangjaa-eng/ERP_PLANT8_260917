import { db, type DbOrTx } from "@/db/client";

// Phase 4(04-01): domain은 db를 직접 import할 수 없다(boundaries,
// `{ from: "domain", allow: ["domain", "repositories", "lib"] }`). 번호
// 부여 + 문서 INSERT를 같은 트랜잭션에 묶어야 하는 domain 함수
// (createProject·saveQuoteLines)는 이 lib 래퍼를 거쳐 트랜잭션을 연다 —
// 실제 쿼리는 여전히 repositories 함수만 한다(domain은 tx를 그 함수들에
// 전달만 한다).
export async function withTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
