import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { skipDbReset } from "./setup";

// 04-06 Task 2 ④(CEO 리뷰 OV-6) — 기존 통합 테스트는 재시드된 빈 DB만 본다.
// 이 파일은 난수 이름의 임시 DB를 만들어 앞 마이그레이션까지만 적용하고 옛
// 데이터를 넣은 뒤 남은 마이그레이션을 적용해 **시드를 부르지 않고** 결과를
// 본다. erp_test는 쓰지 않으므로 매 테스트 전 TRUNCATE+시드를 건너뛴다.
// 계약 칸 삭제 플랜 04-41(그룹 B)이 같은 파일에 삭제 가드 케이스를 더한다.
skipDbReset();

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");
type JournalEntry = { idx: number; tag: string };
type Journal = { entries: JournalEntry[] } & Record<string, unknown>;
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as Journal;

// 번호를 문자열로 박지 않고 접미사로 찾는다 — 번호가 밀려도 테스트가 맞다.
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
  const name = `erp_upgrade_${randomBytes(6).toString("hex")}`;
  await adminPool.query(`CREATE DATABASE "${name}" OWNER erp`);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  scratch.push({ name, pool });
  return pool;
}

// count가 있으면 임시 폴더에 앞 count개 SQL과 count항목으로 자른 journal을
// 복사해 적용한다. 없으면 실제 폴더 전체 — 마이그레이터는 이미 적용한 항목을 건너뛴다.
async function migrateTo(pool: Pool, count?: number): Promise<void> {
  let folder = MIGRATIONS_DIR;
  if (count !== undefined) {
    folder = mkdtempSync(join(tmpdir(), "erp-migrate-"));
    tempDirs.push(folder);
    mkdirSync(join(folder, "meta"));
    const entries = journal.entries.slice(0, count);
    for (const entry of entries) {
      copyFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    }
    writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  }
  await migrate(drizzle(pool), { migrationsFolder: folder });
}

afterAll(async () => {
  for (const { name, pool } of scratch) {
    await pool.end();
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// 옛 데이터의 부모 행(조직·팀·거래처·PM) — 0010 이후 스키마 어디서나 같은 NOT NULL 칸.
async function insertParents(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO org_units (id, name) VALUES ('00000000-0000-4000-8000-000000000001', '옛 본부');
    INSERT INTO teams (id, org_unit_id, name) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '옛 팀');
    INSERT INTO vendors (id, name, normalized_name) VALUES ('00000000-0000-4000-8000-000000000003', '옛 고객사', '옛고객사');
    INSERT INTO users (id, name, email) VALUES ('old-pm', '옛 PM', 'old-pm@example.test');
  `);
}

async function insertProject(pool: Pool, id: string, num: string, status: string, version: number): Promise<void> {
  await pool.query(
    `INSERT INTO projects (id, number, client_id, team_id, pm_user_id, name, status, version, source, pre_estimate_amount_krw)
     VALUES ($1, $2, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'old-pm', $2, $3, $4, 'demo', 0)`,
    [id, num, status, version],
  );
  await pool.query(`INSERT INTO quote_revisions (id, project_id, seq) VALUES ($1, $1, 1)`, [id]);
}

async function insertLine(pool: Pool, revisionId: string, itemName: string): Promise<void> {
  await pool.query(
    `INSERT INTO quote_lines (revision_id, subcategory, item_name, unit_price_amount_krw, execution_amount_krw, quote_amount_krw, profit_krw)
     VALUES ($1, 'etc', $2, 100000, 50000, 100000, 50000)`,
    [revisionId, itemName],
  );
}

type ProjectRow = { id: string; number: string; status: string; version: number };
async function readProjects(pool: Pool): Promise<ProjectRow[]> {
  const { rows } = await pool.query<ProjectRow>(`SELECT id, number, status, version FROM projects ORDER BY number`);
  return rows;
}

type StatusCode = { value: string; label: string; sortOrder: number; description: string | null };
async function readStatusCodes(pool: Pool): Promise<StatusCode[]> {
  const { rows } = await pool.query<StatusCode>(
    `SELECT value, label, sort_order AS "sortOrder", description FROM code_items
     WHERE table_key = 'project_status' ORDER BY sort_order, value`,
  );
  return rows;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

// test/integration/project-status.test.ts의 같은 목록(시드 쪽)과 글자 그대로 같다.
const FIVE_STATUS_CODES: StatusCode[] = [
  { value: "bidding", label: "수주중", sortOrder: 0, description: "제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용" },
  { value: "in_progress", label: "진행", sortOrder: 1, description: "수주 확정 · 종료일 다음 날 자동으로 정산" },
  { value: "settling", label: "정산", sortOrder: 2, description: "행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계" },
  { value: "completed", label: "완료", sortOrder: 3, description: "정산 마감 · 견적 줄이 잠기고 되돌리기 없음" },
  { value: "lost", label: "미수주", sortOrder: 4, description: "수주 실패 · 쌓인 비용은 팀 미수주 비용" },
];

const ID = {
  settledA: "00000000-0000-4000-8000-0000000000a1",
  settledB: "00000000-0000-4000-8000-0000000000a2",
  inProgress: "00000000-0000-4000-8000-0000000000a3",
  bidding: "00000000-0000-4000-8000-0000000000a4",
  lost: "00000000-0000-4000-8000-0000000000a5",
  stray: "00000000-0000-4000-8000-0000000000a6",
};

describe("마이그레이션 업그레이드 — 옛 데이터 위 적용, 재시드 없음 (04-06 OV-6)", () => {
  it("(a) 0010 상태의 옛 잠금 행이 completed로 옮겨지고 나머지 행·줄은 그대로이며 코드표가 다섯 값이다", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_revenue_entries"));

    // 0009가 넣은 옛 코드표 네 값이 있는 상태에서 시작한다(description 칸은 0011이 더한다).
    const { rows: oldCodes } = await pool.query<{ value: string }>(
      `SELECT value FROM code_items WHERE table_key = 'project_status' ORDER BY sort_order`,
    );
    expect(oldCodes.map((code) => code.value)).toEqual(["bidding", "in_progress", "settled", "lost"]);

    await insertParents(pool);
    await insertProject(pool, ID.settledA, "OLD-1", "settled", 1);
    await insertProject(pool, ID.settledB, "OLD-2", "settled", 4);
    await insertProject(pool, ID.inProgress, "OLD-3", "in_progress", 2);
    await insertProject(pool, ID.bidding, "OLD-4", "bidding", 1);
    await insertProject(pool, ID.lost, "OLD-5", "lost", 3);
    await insertLine(pool, ID.settledA, "옛 잠금 A 줄");
    await insertLine(pool, ID.settledB, "옛 잠금 B 줄");
    await insertLine(pool, ID.inProgress, "진행 줄");

    await migrateTo(pool);

    expect(await readProjects(pool)).toEqual([
      { id: ID.settledA, number: "OLD-1", status: "completed", version: 2 },
      { id: ID.settledB, number: "OLD-2", status: "completed", version: 5 },
      { id: ID.inProgress, number: "OLD-3", status: "in_progress", version: 2 },
      { id: ID.bidding, number: "OLD-4", status: "bidding", version: 1 },
      { id: ID.lost, number: "OLD-5", status: "lost", version: 3 },
    ]);
    const { rows: lines } = await pool.query<{ item_name: string }>(`SELECT item_name FROM quote_lines ORDER BY item_name`);
    expect(lines.map((line) => line.item_name)).toEqual(["옛 잠금 A 줄", "옛 잠금 B 줄", "진행 줄"].sort());
    expect(await readStatusCodes(pool)).toEqual(FIVE_STATUS_CODES);
  });

  it("(b) 0011 상태에 네 값 밖의 상태가 있으면 남은 마이그레이션이 RAISE로 멈추고 아무것도 바뀌지 않는다", async () => {
    const pool = await createScratchDb();
    const through0011 = countThrough("_code_item_descriptions");
    await migrateTo(pool, through0011);

    await insertParents(pool);
    await insertProject(pool, ID.settledA, "OLD-1", "settled", 1);
    await insertProject(pool, ID.stray, "OLD-6", "xyz", 1);
    const projectsBefore = await readProjects(pool);
    const codesBefore = await readStatusCodes(pool);

    let caught: unknown;
    try {
      await migrateTo(pool);
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("projects.status에 네 값");

    expect(await readProjects(pool)).toEqual(projectsBefore);
    expect(await readStatusCodes(pool)).toEqual(codesBefore);
    expect(codesBefore.map((code) => code.value)).toContain("settled");
    const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    expect(Number(rows[0]?.count)).toBe(through0011);
  });
});
