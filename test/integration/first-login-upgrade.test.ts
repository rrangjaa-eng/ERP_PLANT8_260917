import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// D8-07 · UI-SPEC 백필 규칙 · Codex #19: 배포 업그레이드 경로 그대로 — 일회용 DB에 이 페이즈 앞 마이그레이션만
// 적용 → 옛 모양(칼럼 없음) 사용자·로그 행 삽입 → 실제 migrator로 최종 journal → 백필·장부 확인 → 재적용 멱등.
// 「이 페이즈 앞」은 journal에서 SQL이 restore_rehearsals나 first_login_at을 처음 언급하는 항목 앞까지다 —
// 브랜치에서도 병합 직전 재생성(04.4-06) 뒤에도 같은 뜻이다.

const ADMIN_URL = "postgres://erp:erp@127.0.0.1:5432/postgres";
const MIGRATIONS = resolve(process.cwd(), "db/migrations");
const MARKER = "-- 04.4 D8-07 first_login_at backfill";
const DB_NAME = `erp_upgrade_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

type JournalEntry = { idx: number; tag: string; when: number };
type Journal = { entries: JournalEntry[] } & Record<string, unknown>;

const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;

let admin: Pool;
let target: Pool;
let priorFolder: string;

async function adminQuery(text: string): Promise<void> {
  await admin.query(text);
}

function priorMigrationsFolder(): string {
  const firstOfPhase = journal.entries.findIndex((entry) =>
    /restore_rehearsals|first_login_at/.test(readFileSync(join(MIGRATIONS, `${entry.tag}.sql`), "utf8")),
  );
  expect(firstOfPhase).toBeGreaterThan(0);
  const kept = journal.entries.slice(0, firstOfPhase);
  const folder = mkdtempSync(join(tmpdir(), "erp-upgrade-"));
  mkdirSync(join(folder, "meta"));
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    cpSync(join(MIGRATIONS, `meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`), join(folder, `meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`));
  }
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return folder;
}

async function firstLoginOf(email: string): Promise<string | null> {
  const result = await target.query<{ value: string | null }>(
    "select to_char(first_login_at, 'YYYY-MM-DD HH24:MI:SS') as value from users where email = $1",
    [email],
  );
  return result.rows[0]?.value ?? null;
}

async function ledgerCount(): Promise<number> {
  const result = await target.query<{ n: string }>("select count(*) as n from drizzle.__drizzle_migrations");
  return Number(result.rows[0]?.n);
}

const T1 = "2026-01-01 09:00:00";
const T2 = "2026-01-05 09:00:00";
const T3 = "2026-02-01 10:00:00";
const T4 = "2026-03-01 08:00:00";
const T5 = "2026-03-02 08:00:00";
const T6 = "2026-04-01 07:00:00";
const T7 = "2026-04-02 07:00:00";

async function insertUser(id: string, email: string, temporary: boolean): Promise<void> {
  await target.query("insert into users (id, name, email, password_is_temporary) values ($1, $1, $2, $3)", [id, email, temporary]);
}

async function insertLogin(actorId: string, at: string, actionType = "login", prunedAt: string | null = null): Promise<void> {
  await target.query("insert into action_log (actor_id, action_type, occurred_at, pruned_at) values ($1, $2, $3, $4)", [
    actorId,
    actionType,
    at,
    prunedAt,
  ]);
}

async function insertAttempt(email: string, success: boolean, at: string): Promise<void> {
  await target.query("insert into login_attempts (email, success, attempted_at) values ($1, $2, $3)", [email, success, at]);
}

beforeAll(async () => {
  admin = new Pool({ connectionString: ADMIN_URL });
  await adminQuery(`CREATE DATABASE "${DB_NAME}" OWNER erp`);
  target = new Pool({ connectionString: ADMIN_URL.replace("/postgres", `/${DB_NAME}`) });
  priorFolder = priorMigrationsFolder();
  await migrate(drizzle(target), { migrationsFolder: priorFolder });

  // 옛 모양 — first_login_at 칼럼이 아직 없다.
  await insertUser("A", "a@x.test", true);
  await insertLogin("A", T2);
  await insertLogin("A", T1, "login", T2);
  await insertUser("B", "b@x.test", false);
  await insertUser("C", "c@x.test", true);
  await insertUser("E", "e@x.test", true);
  await insertLogin("E", T1, "document_update");
  await insertAttempt("e@x.test", false, T1);
  await insertUser("F", "Fe@X.test", true);
  await insertAttempt("fe@x.test", true, T3);
  await insertUser("G", "g@x.test", true);
  await insertLogin("G", T5);
  await insertAttempt("g@x.test", true, T4);
  await insertUser("H", "h@x.test", true);
  await insertLogin("H", T6);
  await insertAttempt("h@x.test", true, T7);

  await migrate(drizzle(target), { migrationsFolder: MIGRATIONS });
}, 60_000);

afterAll(async () => {
  await target?.end();
  await admin?.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  await admin?.end();
  if (priorFolder) rmSync(priorFolder, { recursive: true, force: true });
});

describe("first_login_at 백필 — 실제 업그레이드 경로(D8-07)", () => {
  it("표지 줄을 가진 마이그레이션이 정확히 하나다", () => {
    const withMarker = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql") && readFileSync(join(MIGRATIONS, name), "utf8").includes(MARKER));
    expect(withMarker).toHaveLength(1);
  });

  it("두 기록원 중 더 이른 값 · 대소문자 무관 이메일 · 실패 시도 무시 · 임시 아님은 실행 시각 · 그 밖은 NULL", async () => {
    expect(await firstLoginOf("a@x.test")).toBe(T1);
    const b = await target.query<{ recent: boolean }>(
      "select first_login_at > now()::timestamp - interval '10 minutes' as recent from users where id = 'B'",
    );
    expect(b.rows[0]?.recent).toBe(true);
    expect(await firstLoginOf("c@x.test")).toBeNull();
    expect(await firstLoginOf("e@x.test")).toBeNull();
    expect(await firstLoginOf("Fe@X.test")).toBe(T3);
    expect(await firstLoginOf("g@x.test")).toBe(T4);
    expect(await firstLoginOf("h@x.test")).toBe(T6);
    expect(await ledgerCount()).toBe(journal.entries.length);
  });

  it("다시 적용해도 오류 없이 장부와 값이 그대로다", async () => {
    const snapshot = await target.query("select id, first_login_at from users order by id");
    await migrate(drizzle(target), { migrationsFolder: MIGRATIONS });
    expect(await ledgerCount()).toBe(journal.entries.length);
    expect((await target.query("select id, first_login_at from users order by id")).rows).toEqual(snapshot.rows);

    await target.query("insert into users (id, name, email, first_login_at) values ('D', 'D', 'd@x.test', $1)", [T7]);
    await migrate(drizzle(target), { migrationsFolder: MIGRATIONS });
    expect(await firstLoginOf("d@x.test")).toBe(T7);
  });
});
