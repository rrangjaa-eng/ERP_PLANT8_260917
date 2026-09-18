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
    await pool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
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

  afterAll(async () => {
    await cleanup();
  });

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
});
