import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { skipDbReset } from "./setup";

// 08-01 Task 1 — 첫 운영 승격(T-08-01-01). 운영 DB는 2026-09-18 뼈대(journal 앞 세 항목,
// `_rate_limits_id_column`까지)에 계정 행만 있다. 그 위에서 남은 마이그레이션 전부를
// migrate 한 번으로 적용하면 끝나야 하고, 하나라도 실패하면 DB는 한 칸도 바뀌지 않아야 한다
// (승격 전 수동 백업 + 원자성에 기대는 RESEARCH §1.5 (a)의 근거).
// migration-upgrade.test.ts의 임시 DB 꼴을 복제한다 — 그 파일은 다른 플랜이 고치는 중이라 헬퍼를 빼지 않는다.
skipDbReset();

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");
type JournalEntry = { idx: number; tag: string };
type Journal = { entries: JournalEntry[] } & Record<string, unknown>;
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as Journal;

function countThrough(suffix: string): number {
  const entry = journal.entries.find((e) => e.tag.endsWith(suffix));
  if (!entry) throw new Error(`journal에 ${suffix} 마이그레이션이 없습니다`);
  return entry.idx + 1;
}

const baseUrl = process.env.DATABASE_URL ?? "postgres://erp:erp@127.0.0.1:5432/erp_test";
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const adminPool = new Pool({ connectionString: adminUrl.toString() });

const scratch: { name: string; pool: Pool }[] = [];
const tempDirs: string[] = [];

async function createScratchDb(): Promise<Pool> {
  const name = `erp_promote_${randomBytes(6).toString("hex")}`;
  await adminPool.query(`CREATE DATABASE "${name}" OWNER erp`);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  pool.on("error", () => undefined);
  scratch.push({ name, pool });
  return pool;
}

type FolderOptions = { count?: number; extraEntry?: { tag: string; sql: string } };

// count가 있으면 앞 count개만, extraEntry가 있으면 끝에 항목 하나를 덧붙인 임시 폴더로 적용한다.
// 실제 db/migrations는 건드리지 않는다.
async function migrateWith(pool: Pool, options: FolderOptions = {}): Promise<void> {
  const entries = journal.entries.slice(0, options.count ?? journal.entries.length);
  const folder = mkdtempSync(join(tmpdir(), "erp-promote-"));
  tempDirs.push(folder);
  mkdirSync(join(folder, "meta"));
  for (const entry of entries) {
    copyFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  const all: Record<string, unknown>[] = [...(entries as unknown as Record<string, unknown>[])];
  if (options.extraEntry) {
    const last = entries[entries.length - 1] as unknown as Record<string, unknown>;
    all.push({ ...last, idx: entries.length, when: Number(last.when) + 1000, tag: options.extraEntry.tag });
    writeFileSync(join(folder, `${options.extraEntry.tag}.sql`), options.extraEntry.sql);
  }
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: all }));
  await migrate(drizzle(pool), { migrationsFolder: folder });
}

afterAll(async () => {
  for (const { name, pool } of scratch) {
    await pool.end();
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}, 60_000);

const SKELETON_COUNT = countThrough("_rate_limits_id_column");
const ADMIN_EMAIL = "admin@plant8.test";
const SUCCESS_AT = "2026-09-19 01:02:03";

// 뼈대 행: 시스템 관리자 users 1 · accounts 자격 1 · sessions 1 · login_attempts 3 · rate_limits 1.
async function buildSkeleton(): Promise<Pool> {
  const pool = await createScratchDb();
  await migrateWith(pool, { count: SKELETON_COUNT });
  await pool.query(`
    INSERT INTO users (id, name, email, email_verified, is_admin, password_is_temporary)
    VALUES ('sys-admin', '시스템 관리자', '${ADMIN_EMAIL}', true, true, false);
    INSERT INTO accounts (id, user_id, account_id, provider_id, password)
    VALUES ('acc-1', 'sys-admin', 'sys-admin', 'credential', 'hashed');
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES ('ses-1', 'sys-admin', 'token-1', now() + interval '1 day');
    INSERT INTO login_attempts (email, success, ip, attempted_at) VALUES
      ('${ADMIN_EMAIL}', false, '203.0.113.1', '2026-09-18 08:00:00'),
      ('${ADMIN_EMAIL}', true, '203.0.113.1', '${SUCCESS_AT}'),
      ('${ADMIN_EMAIL}', true, '203.0.113.1', '2026-09-20 09:00:00');
    INSERT INTO rate_limits (id, key, count, last_request) VALUES ('rl-1', '203.0.113.1|/sign-in', 1, 1790000000000);
  `);
  return pool;
}

async function appliedCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`);
  return Number(rows[0]?.n);
}

describe("첫 운영 승격 — 9/18 뼈대 위에서 남은 마이그레이션 한 번", () => {
  it("뼈대 자리는 journal 앞 세 항목이다(운영 /api/health sha 확인 전 가정 A1)", () => {
    expect(SKELETON_COUNT).toBe(3);
  });

  it("남은 마이그레이션 전부가 오류 없이 적용되고 계정 행이 남는다", async () => {
    const pool = await buildSkeleton();
    expect(await appliedCount(pool)).toBe(SKELETON_COUNT);

    await migrateWith(pool);

    expect(await appliedCount(pool)).toBe(journal.entries.length);
    const { rows } = await pool.query<{ id: string; role_id: string | null; first_login_at: string | null }>(
      `SELECT id, role_id, to_char(first_login_at, 'YYYY-MM-DD HH24:MI:SS') AS first_login_at FROM users`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("sys-admin");
    expect(rows[0]?.role_id).not.toBeNull();
    // 0019 백필 — 로그인 성공 기록 중 가장 이른 시각.
    expect(rows[0]?.first_login_at).toBe(SUCCESS_AT);
    const accounts = await pool.query(`SELECT 1 FROM accounts WHERE user_id = 'sys-admin'`);
    expect(accounts.rowCount).toBe(1);
  });

  it("남은 마이그레이션 중 하나가 실패하면 DB는 한 칸도 바뀌지 않는다", async () => {
    const pool = await buildSkeleton();

    await expect(
      migrateWith(pool, { extraEntry: { tag: "9999_first_promotion_failure_probe", sql: "SELECT 1/0;" } }),
    ).rejects.toThrow();

    expect(await appliedCount(pool)).toBe(SKELETON_COUNT);
    const { rows } = await pool.query<{ roles: string | null }>(`SELECT to_regclass('public.roles')::text AS roles`);
    expect(rows[0]?.roles).toBeNull();
    const users = await pool.query(`SELECT 1 FROM users WHERE id = 'sys-admin'`);
    expect(users.rowCount).toBe(1);
  });
});
