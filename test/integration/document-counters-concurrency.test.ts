import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { allocateNumber } from "@/repositories/document-counters";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// Phase 4 Task 3 ② (Issue 10) — 두 트랜잭션이 동시에 같은 (counter_key,
// period)를 증가시켜도 서로 다른 값을 받는다는 실제 Postgres 증명.
// UPDATE ... RETURNING이 READ COMMITTED에서 행 잠금을 걸어 두 번째
// 트랜잭션이 첫 번째가 끝날 때까지 블록된다(04-RESEARCH.md Pattern 3).
//
// 가짜 통과 확인(04-RESEARCH.md A2): 풀 최대 커넥션이 2 미만이면 두
// db.transaction 호출이 실제로는 순차 실행되어 이 테스트가 동시성을
// 증명하지 못한다 — 그 경우를 구분하기 위해 풀 크기를 먼저 실측해
// 함께 단언한다.
describe("document_counters 동시 증가 (Phase 4, Issue 10)", () => {
  it("풀 최대 커넥션이 2 이상이다 — 그래야 아래 동시성 증명이 실제 두 커넥션에서 돈다", () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("두 트랜잭션이 동시에 증가시켜도 값이 겹치지 않는다", async () => {
    const [a, b] = await Promise.all([
      db.transaction((tx) => allocateNumber(SYSTEM_VIEWER, "project", "2026", tx)),
      db.transaction((tx) => allocateNumber(SYSTEM_VIEWER, "project", "2026", tx)),
    ]);

    expect(new Set([a, b]).size).toBe(2);
    expect([a, b].sort((x, y) => x - y)).toEqual([1, 2]);
  });

  it("실패한 트랜잭션의 증가는 문서 INSERT와 함께 롤백된다 — 다음 호출이 그 번호를 그대로 이어받는다(D-42)", async () => {
    const first = await db.transaction((tx) => allocateNumber(SYSTEM_VIEWER, "expense", "2026", tx));
    expect(first).toBe(1);

    // 번호 부여가 문서 INSERT와 같은 트랜잭션 안에 있어야 하는 이유가
    // 바로 이것이다 — 이 트랜잭션이 실패하면 증가 자체가 통째로
    // 되돌아가, "번호는 부여됐는데 문서가 없는" 상태가 생기지 않는다.
    await expect(
      db.transaction(async (tx) => {
        await allocateNumber(SYSTEM_VIEWER, "expense", "2026", tx);
        throw new Error("의도된 롤백 — 문서 INSERT 실패를 흉내낸다");
      }),
    ).rejects.toThrow("의도된 롤백");

    // 실패한 시도의 증가는 커밋되지 않았으므로 다음 정상 호출이 3이
    // 아니라 2를 받는다 — 번호가 "소비된 채 사라지는" 결번이 아니라
    // 그대로 다시 쓰인다(같은 트랜잭션 원자성이 만드는 결과).
    const next = await db.transaction((tx) => allocateNumber(SYSTEM_VIEWER, "expense", "2026", tx));
    expect(next).toBe(2);
  });
});
