import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { pool } from "./client";
import * as schema from "./schema";

// 서버 쪽 statement_timeout·lock_timeout과 풀 대기 한도는 연결을 잡은 뒤 응답이
// 멈추는 경우(네트워크·서버 정지)를 끊지 못한다. 이 도우미는 연결 하나 위에서
// BEGIN부터 COMMIT·ROLLBACK까지 전부를 마감 타이머와 경주시키고, 넘으면 그
// 연결을 파기한다(release(err) → pg-pool이 풀에서 빼고 end() → 기다리던 쿼리가
// 있으면 소켓 파기). 전역 query_timeout은 쓰지 않는다 — 문장마다 걸려 트랜잭션
// 전체를 묶지 못하고, 시간이 지난 연결을 풀에 되돌린다.
export class DbDeadlineError extends Error {
  readonly deadlineMs: number;

  constructor(deadlineMs: number) {
    super(`DB 트랜잭션이 마감 ${deadlineMs}ms를 넘었습니다.`);
    this.name = "DbDeadlineError";
    this.deadlineMs = deadlineMs;
  }
}

// 단일 연결 위 Drizzle — 풀이 아니라서 Drizzle이 연결을 따로 풀에 돌려주지 않는다.
function clientDb(client: PoolClient) {
  return drizzle(client, { schema });
}

export type DeadlineTx = Parameters<Parameters<ReturnType<typeof clientDb>["transaction"]>[0]>[0];

export async function withDeadlineTransaction<T>(
  deadlineMs: number,
  fn: (tx: DeadlineTx) => Promise<T>,
  deps?: { connect?: () => Promise<PoolClient> },
): Promise<T> {
  const client = await (deps?.connect ?? (() => pool.connect()))();
  let released = false;
  const release = (error?: Error): void => {
    if (released) return;
    released = true;
    if (error) client.release(error);
    else client.release();
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DbDeadlineError(deadlineMs);
      release(error);
      reject(error);
    }, deadlineMs);
  });

  const work = clientDb(client).transaction(fn);
  // 마감에 진 트랜잭션의 늦은 거부(Connection terminated 등)는 삼킨다.
  work.catch(() => {});

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
    release();
  }
}
