import { and, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { documentCounters } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type DocumentCounterRow = InferSelectModel<typeof documentCounters>;
// db/client.ts가 정본 — 여기서는 repositories 계층 호출자를 위해 재수출만
// 한다(domain은 db를 직접 import할 수 없어 이 재수출을 거친다, boundaries).
export type { DbOrTx };

// 읽기와 upsert만 둔다 — 실제 번호 부여(원자적 증가)와 행 잠금은 Phase 4다.
export async function findDocumentCounter(
  viewer: Viewer,
  counterKey: string,
  period: string,
): Promise<DocumentCounterRow | null> {
  const [row] = await db
    .select()
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .limit(1);
  return row ?? null;
}

export async function upsertDocumentCounter(
  viewer: Viewer,
  input: { counterKey: string; period: string; value: number },
): Promise<void> {
  await db
    .insert(documentCounters)
    .values({ counterKey: input.counterKey, period: input.period, value: input.value })
    .onConflictDoUpdate({
      target: [documentCounters.counterKey, documentCounters.period],
      set: { value: input.value, updatedAt: new Date() },
    });
}

// Phase 4 Task 2 ④ — 원자적 증가(04-RESEARCH.md Pattern 3 그대로). 행이 없으면
// onConflictDoNothing으로 0 행을 만든 뒤, 같은 트랜잭션 안에서
// `UPDATE … RETURNING`으로 증가시킨다. Postgres READ COMMITTED에서 UPDATE
// 자체가 대상 행을 잠가 두 번째 트랜잭션을 첫 번째가 끝날 때까지 블록한다
// — 두 트랜잭션이 동시에 불러도 서로 다른 값을 받는다(Issue 10).
// **반드시 문서 INSERT와 같은 트랜잭션(`db.transaction`의 tx)에서 불러야
// 한다** — 번호만 먼저 커밋하면 "번호는 있는데 문서가 없는" 상태가 생긴다.
// 실패한 트랜잭션의 증가분은 롤백되어 결번으로 남는다(D-42, 오류 아님).
export async function allocateNumber(
  viewer: Viewer,
  counterKey: string,
  period: string,
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  await tx
    .insert(documentCounters)
    .values({ counterKey, period, value: 0 })
    .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });

  const [row] = await tx
    .update(documentCounters)
    .set({ value: sql`${documentCounters.value} + 1`, updatedAt: new Date() })
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .returning({ value: documentCounters.value });

  if (!row) throw new Error("document_counters 증가가 행을 반환하지 않았습니다.");
  return row.value;
}
