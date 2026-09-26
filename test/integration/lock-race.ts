import type { Pool } from "pg";

// 04-20(OV-3) — 두 연결 경합을 시간 지연(sleep) 없이 재현하는 테스트 도우미.
// `*.test.ts`가 아니라 수집되지 않는다. 04-11·04-22·04-12·04-26과 그룹 B(04-40·
// 04-07)가 가져다 쓴다. 쓰는 법: 연결 A를 domain 쓰기 함수의 `deps.afterLock`에서
// deferred로 멈추고, 연결 B를 시작한 뒤 waitForLockWaiter로 B의 잠금 대기를 확인하고
// A를 푼다 — 순서는 폴링이 확인한 사실로 정하고 고정 지연으로 정하지 않는다.

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const POLL_INTERVAL_MS = 20;

// 이 DB에서 행 잠금을 기다리는 연결이 하나 이상 생길 때까지 짧게 폴링한다.
// 기본 한도 4초 — 04-32의 lock_timeout 5s 안에서 경합이 풀리게 한다.
export async function waitForLockWaiter(pool: Pool, opts: { timeoutMs?: number } = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await pool.query<{ waiters: number }>(
      "SELECT count(*)::int AS waiters FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if ((result.rows[0]?.waiters ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error(`waitForLockWaiter: ${timeoutMs}ms 안에 잠금 대기 연결이 생기지 않았다`);
    await new Promise((settle) => setTimeout(settle, POLL_INTERVAL_MS));
  }
}
