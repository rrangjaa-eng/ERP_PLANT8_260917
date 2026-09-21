import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

// DB_ADMIN_URL 경로(로컬 슈퍼유저 erp) — db-bootstrap이 postgres 관리 사용자로
// 붙어 IAM 런타임 사용자(여기서는 로컬 테스트 롤)에게 DB 소유권을 주고, 재실행해도
// 같은 결과(멱등)임을 실제 Postgres로 증명한다.

const ADMIN_URL = "postgres://erp:erp@127.0.0.1:5432/postgres";
const TEST_ROLE = "bootstrap_iam_test";
const TEST_DB = "erp_bootstrap_test";

async function withAdminPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function cleanup(): Promise<void> {
  await withAdminPool(async (pool) => {
    // WITH (FORCE)가 없으면 DROP DATABASE는 그 DB에 붙은 세션이 하나라도 남아
    // 있는 동안 무한정 기다린다. 클라이언트가 pool.end()를 불러도 서버가 그
    // 소켓을 언제 거둬가는지는 보장되지 않아, CI에서 afterAll이 10초
    // hookTimeout에 걸려 통합 스위트 전체가 FAIL로 끝나고 e2e 단계가 skip됐다
    // (run #69·#70 연속, 개별 테스트 691건은 전부 통과한 상태였다).
    // FORCE는 남은 백엔드를 끊고 진행한다(PostgreSQL 13+, CI·로컬 모두 16).
    await pool.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
    await pool.query(`DROP ROLE IF EXISTS "${TEST_ROLE}"`);
  });
}

describe("scripts/db-bootstrap 통합 (DB_ADMIN_URL 경로)", () => {
  beforeAll(async () => {
    await cleanup();
    await withAdminPool(async (pool) => {
      await pool.query(`CREATE ROLE "${TEST_ROLE}" LOGIN`);
    });
  });

  // WITH (FORCE)는 남은 백엔드가 실제로 빠져나갈 때까지 내부적으로 최대 5초쯤
  // 기다린다. 무한 대기는 없어졌지만 CI의 디스크 부하(실측: 체크포인트 하나가
  // 51초, 파일 14만 개 동기화)와 겹치면 기본 10초 hookTimeout을 넘길 수 있다 —
  // 정리에 쓰는 대기 한도만 넉넉히 둔다(단언은 그대로다).
  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it("DB 소유권을 부여하고 재실행해도 멱등하다", async () => {
    const savedEnv = {
      DB_ADMIN_URL: process.env.DB_ADMIN_URL,
      DB_NAME: process.env.DB_NAME,
      DB_IAM_USER: process.env.DB_IAM_USER,
    };
    process.env.DB_ADMIN_URL = ADMIN_URL;
    process.env.DB_NAME = TEST_DB;
    process.env.DB_IAM_USER = TEST_ROLE;

    try {
      vi.resetModules();
      const { main } = await import("@/scripts/db-bootstrap");
      await main();

      const owner = await withAdminPool(async (pool) => {
        const result = await pool.query<{ owner: string }>(
          `SELECT r.rolname AS owner
             FROM pg_database d
             JOIN pg_roles r ON d.datdba = r.oid
            WHERE d.datname = $1`,
          [TEST_DB],
        );
        return result.rows[0]?.owner;
      });
      expect(owner).toBe(TEST_ROLE);

      const targetDbPool = new Pool({ connectionString: ADMIN_URL.replace("/postgres", `/${TEST_DB}`) });
      let schemaOwner: string | undefined;
      try {
        const result = await targetDbPool.query<{ owner: string }>(
          `SELECT r.rolname AS owner
             FROM pg_namespace n
             JOIN pg_roles r ON n.nspowner = r.oid
            WHERE n.nspname = 'public'`,
        );
        schemaOwner = result.rows[0]?.owner;
      } finally {
        await targetDbPool.end();
      }
      expect(schemaOwner).toBe(TEST_ROLE);

      // 재실행 — 멱등(같은 결과, 에러 없음)
      vi.resetModules();
      const { main: mainAgain } = await import("@/scripts/db-bootstrap");
      await expect(mainAgain()).resolves.toBeUndefined();
    } finally {
      if (savedEnv.DB_ADMIN_URL === undefined) delete process.env.DB_ADMIN_URL;
      else process.env.DB_ADMIN_URL = savedEnv.DB_ADMIN_URL;
      if (savedEnv.DB_NAME === undefined) delete process.env.DB_NAME;
      else process.env.DB_NAME = savedEnv.DB_NAME;
      if (savedEnv.DB_IAM_USER === undefined) delete process.env.DB_IAM_USER;
      else process.env.DB_IAM_USER = savedEnv.DB_IAM_USER;
    }
  });

  // CI 실측(run #69·#70 연속): afterAll의 cleanup()이 10초 hookTimeout에 걸려
  // 통합 스위트가 FAIL로 끝나고 e2e 단계가 통째로 skip됐다 — 개별 테스트 691건은
  // 전부 통과한 상태였다. 원인은 DROP DATABASE가 그 DB에 붙은 세션이 하나라도
  // 남아 있으면 무한정 기다린다는 것이다(로컬 실측: FORCE 없이는 5초 제한에
  // 강제 종료, WITH (FORCE)는 즉시 성공). 클라이언트가 pool.end()를 불러도
  // 서버가 그 소켓을 언제 거둬가는지는 보장되지 않아 로컬에서는 재현되지 않았다.
  // 이 테스트는 연결을 일부러 붙잡아 그 조건을 결정적으로 만든다.
  it("대상 DB에 연결이 남아 있어도 정리가 끝난다", async () => {
    // 앞 테스트가 이미 만들어 뒀을 수 있다 — 순서에 기대지 않는다.
    await withAdminPool(async (pool) => {
      const existing = await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [TEST_DB]);
      if ((existing.rowCount ?? 0) === 0) await pool.query(`CREATE DATABASE "${TEST_DB}"`);
    });

    const holder = new Pool({ connectionString: ADMIN_URL.replace("/postgres", `/${TEST_DB}`) });
    // FORCE가 이 연결을 끊으면 pg가 57P01을 비동기 error 이벤트로 올린다 —
    // 이 테스트가 일부러 만든 상황이므로 여기서 삼킨다(없으면 처리되지 않은
    // 예외로 스위트 전체가 exit 1이 된다).
    holder.on("error", () => undefined);
    await holder.query("select 1");

    try {
      await cleanup();
    } finally {
      await holder.end().catch(() => undefined);
    }

    const stillThere = await withAdminPool(async (pool) => {
      const result = await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [TEST_DB]);
      return result.rowCount ?? 0;
    });
    expect(stillThere).toBe(0);
  }, 60_000);
});
