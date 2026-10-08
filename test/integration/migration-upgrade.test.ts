import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { skipDbReset } from "./setup";
import { rowScopeFor, type RowScope, type RowScopeDeps } from "@/domain/permissions/scope-for";

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
  // pool.end()는 클라이언트 소켓이 닫히기 전에 끝나, 뒤따르는 DROP ... WITH (FORCE)가
  // 남은 백엔드를 끊으면 pg가 57P01을 error 이벤트로 올린다(CI run 328) — 정리 중 일이라 삼킨다.
  pool.on("error", () => undefined);
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
    const { rows: lines } = await pool.query<{ item_name: string }>(`SELECT item_name FROM quote_lines`);
    expect(lines.map((line) => line.item_name).sort()).toEqual(["옛 잠금 A 줄", "옛 잠금 B 줄", "진행 줄"].sort());
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

  it("(c) 0013 상태의 줄이 0014 뒤 line_kind = 'quote'이고, 세 값 밖의 종류는 CHECK가 거부한다(04-13 검토 S4)", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_role_work_scope"));

    await insertParents(pool);
    await insertProject(pool, ID.inProgress, "OLD-3", "in_progress", 1);
    await insertLine(pool, ID.inProgress, "옛 줄");

    await migrateTo(pool);

    const { rows } = await pool.query<{ line_kind: string }>(`SELECT line_kind FROM quote_lines`);
    expect(rows.map((row) => row.line_kind)).toEqual(["quote"]);

    let caught: unknown;
    try {
      await pool.query(
        `INSERT INTO quote_lines (revision_id, subcategory, item_name, unit_price_amount_krw, execution_amount_krw, quote_amount_krw, profit_krw, line_kind)
         VALUES ($1, 'etc', '틀린 종류', 0, 0, 0, 0, 'bogus')`,
        [ID.inProgress],
      );
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("quote_lines_line_kind_check");
  });
});

// 04-41(사용자 D9 · CEO 리뷰 B-09·OV-6 · 엔지 r2 E2-05) — 0010이 더한 projects.contract_* 네 칸을 지우는 마이그레이션.
// 0010까지 적용한 DB에 옛 데이터를 넣고 남은 마이그레이션 전부를 적용한다(시드를 부르지 않는다). 업무 행(source <> 'demo')에
// 계약 값(원화 ≠ 0 또는 외화 값)이 있으면 가드가 멈추고, 이번 적용 전부가 한 트랜잭션이라 DB가 한 칸도 바뀌지 않는다.
describe("계약 칸 삭제(04-41 · D9 · OV-6)", () => {
  const DEMO = "00000000-0000-4000-8000-0000000000b1";
  const WORK = "00000000-0000-4000-8000-0000000000b2";

  type ContractCells = { currency: string; foreign: string | null; fxRate: string; krw: number };

  // 0010 상태: demo 프로젝트(계약 원화 5,000,000 · 견적 줄 둘)와 업무 프로젝트(source = 'intranet' · 견적 줄 하나).
  async function prepareAt0010(work: ContractCells): Promise<Pool> {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_revenue_entries"));
    await insertParents(pool);
    await insertProject(pool, DEMO, "OLD-D1", "bidding", 1);
    await insertProject(pool, WORK, "OLD-W1", "in_progress", 1);
    await pool.query(`UPDATE projects SET contract_amount_krw = 5000000 WHERE id = $1`, [DEMO]);
    await pool.query(
      `UPDATE projects SET source = 'intranet', contract_currency = $2, contract_foreign_amount = $3, contract_fx_rate = $4, contract_amount_krw = $5 WHERE id = $1`,
      [WORK, work.currency, work.foreign, work.fxRate, work.krw],
    );
    await insertLine(pool, DEMO, "demo 줄 1");
    await insertLine(pool, DEMO, "demo 줄 2");
    await insertLine(pool, WORK, "업무 줄");
    return pool;
  }

  async function contractColumns(pool: Pool): Promise<string[]> {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name LIKE 'contract\\_%' ORDER BY column_name`,
    );
    return rows.map((row) => row.column_name);
  }

  async function workContract(pool: Pool): Promise<ContractCells | undefined> {
    const { rows } = await pool.query<ContractCells>(
      `SELECT contract_currency AS currency, contract_foreign_amount AS foreign, contract_fx_rate AS "fxRate", contract_amount_krw AS krw FROM projects WHERE id = $1`,
      [WORK],
    );
    return rows[0];
  }

  async function expectGuardStops(pool: Pool, work: ContractCells): Promise<void> {
    let caught: unknown;
    try {
      await migrateTo(pool);
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("계약 금액");
    expect(await contractColumns(pool)).toHaveLength(4);
    expect(await workContract(pool)).toEqual(work);
    // 이번 적용의 앞 마이그레이션(04-13의 line_kind)도 남지 않았다 — 적용 기록이 0010에서 멈춰 있다.
    const { rows: kind } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_lines' AND column_name = 'line_kind'`,
    );
    expect(kind).toHaveLength(0);
    const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    expect(Number(rows[0]?.count)).toBe(countThrough("_revenue_entries"));
  }

  it("(c) 업무 행의 계약 값이 0이면 네 칸이 사라지고 프로젝트 행·번호·견적 줄이 그대로다(재시드 전)", async () => {
    const pool = await prepareAt0010({ currency: "KRW", foreign: null, fxRate: "1.0000", krw: 0 });

    await migrateTo(pool);

    expect(await contractColumns(pool)).toEqual([]);
    const { rows: projects } = await pool.query<{ id: string; number: string }>(`SELECT id, number FROM projects ORDER BY number`);
    expect(projects).toEqual([
      { id: DEMO, number: "OLD-D1" },
      { id: WORK, number: "OLD-W1" },
    ]);
    const { rows: lines } = await pool.query<{ item_name: string }>(`SELECT item_name FROM quote_lines ORDER BY item_name COLLATE "C"`);
    expect(lines.map((line) => line.item_name)).toEqual(["demo 줄 1", "demo 줄 2", "업무 줄"].sort());
  });

  it("(c2) 업무 행의 원화 환산이 0이어도 외화 계약 금액이 있으면 가드가 멈추고 네 칸이 그대로다(E2-05)", async () => {
    const work = { currency: "USD", foreign: "1000.00", fxRate: "0.0000", krw: 0 };
    const pool = await prepareAt0010(work);

    await expectGuardStops(pool, work);
  });

  it("(d) 업무 행의 계약 원화가 5,000,000이면 가드가 멈추고 그 값과 앞 마이그레이션 결과까지 아무것도 바뀌지 않는다", async () => {
    const work = { currency: "KRW", foreign: null, fxRate: "1.0000", krw: 5_000_000 };
    const pool = await prepareAt0010(work);

    await expectGuardStops(pool, work);
  });
});

// 원화 금액 bigint 전환(0016 · 사용자 결정 ①(b) · 상한 1조 원 미만) — 0015까지 적용한 DB(integer)의 원화 값이 0016 뒤
// 같은 숫자이고, integer가 거부하던 21.4억 초과 값이 0016 뒤에는 저장된다(시드를 부르지 않는다).
describe("원화 금액 bigint 전환(0016)", () => {
  const BIG = 3_000_000_000;

  async function insertLineAmount(pool: Pool, amount: number): Promise<void> {
    await pool.query(
      `INSERT INTO quote_lines (revision_id, subcategory, item_name, unit_price_amount_krw, execution_amount_krw, quote_amount_krw, profit_krw)
       VALUES ($1, 'etc', $2, $3, 0, $3, $3)`,
      [ID.inProgress, `줄-${amount}`, amount],
    );
  }

  it("0015 상태의 2,000,000,000원 값이 0016 뒤 그대로이고, 0015에서 거부되던 3,000,000,000원이 0016 뒤 저장된다", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_drop_project_contract_columns"));

    await insertParents(pool);
    await insertProject(pool, ID.inProgress, "OLD-B", "in_progress", 1);
    await pool.query(`UPDATE projects SET pre_estimate_amount_krw = 2000000000 WHERE id = $1`, [ID.inProgress]);
    await insertLineAmount(pool, 2_000_000_000);

    let caught: unknown;
    try {
      await insertLineAmount(pool, BIG);
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("out of range for type integer");

    await migrateTo(pool);

    const { rows: before } = await pool.query<{ unit: string; quote: string; pre: string }>(
      `SELECT l.unit_price_amount_krw AS unit, l.quote_amount_krw AS quote, p.pre_estimate_amount_krw AS pre
         FROM quote_lines l JOIN projects p ON p.id = l.revision_id`,
    );
    expect(before).toEqual([{ unit: "2000000000", quote: "2000000000", pre: "2000000000" }]);

    await insertLineAmount(pool, BIG);
    const { rows: big } = await pool.query<{ unit: string }>(
      `SELECT unit_price_amount_krw AS unit FROM quote_lines WHERE item_name = $1`,
      [`줄-${BIG}`],
    );
    expect(big).toEqual([{ unit: String(BIG) }]);
  });
});

// 공휴일 보관(0021 · quick 261001-hfi D-01 · ADMN-12) — 0020까지 적용한 DB의 공휴일 행이 0021 뒤 그대로이고 보관 칸은
// NULL, 날짜 유일 제약 holidays_date_key가 부분 유일 인덱스 holidays_date_active_key(보관 안 된 행만)로 바뀐다.
describe("공휴일 보관 칸 · 부분 유일 인덱스(0021)", () => {
  it("0020 상태의 공휴일 행이 0021 뒤 값 그대로이고, 활성 행끼리만 같은 날짜가 막힌다", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_hot_maestro"));
    await pool.query(`INSERT INTO holidays (date, name, kind) VALUES ('2034-03-07', '옛 임시', 'temporary')`);

    await migrateTo(pool);

    const { rows } = await pool.query<{ date: string; name: string; kind: string; archived_at: Date | null; archived_by: string | null }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, name, kind, archived_at, archived_by FROM holidays`,
    );
    expect(rows).toEqual([{ date: "2034-03-07", name: "옛 임시", kind: "temporary", archived_at: null, archived_by: null }]);

    const { rows: constraints } = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = 'holidays_date_key'`);
    expect(constraints).toEqual([]);
    const { rows: indexes } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'holidays' AND indexname = 'holidays_date_active_key'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toMatch(/UNIQUE INDEX .* WHERE \(archived_at IS NULL\)/);

    let caught: unknown;
    try {
      await pool.query(`INSERT INTO holidays (date, name, kind) VALUES ('2034-03-07', '중복', 'election')`);
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("holidays_date_active_key");

    await pool.query(`UPDATE holidays SET archived_at = now() WHERE name = '옛 임시'`);
    await pool.query(`INSERT INTO holidays (date, name, kind) VALUES ('2034-03-07', '새 임시', 'temporary')`);
    const { rows: count } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM holidays WHERE date = '2034-03-07'`);
    expect(count).toEqual([{ n: "2" }]);
  });
});

// 증빙 종류 세금 규칙 시드 맞춤(0029 · PR #176 후속) — 시드는 기존 행을 덮지 않아(onConflictDoNothing) 이미 만든 DB는
// 카드 전표·현금영수증이 부가세 없음, 기타소득·사업소득이 반올림으로 남는다. 옛 시드 값 그대로인 행만 새 시드 값으로
// 바꾸고, 관리자가 이미 바꾼 값은 그대로 둔다. 두 번 돌려도 결과가 같다.
describe("증빙 종류 세금 규칙 시드 맞춤(0029)", () => {
  const VAT = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };
  const oldWithholding = (min: number) => ({ ruleKind: "withholding", roundingUnit: 10, roundingMethod: "round", minWithholdingAmount: min, basisDate: "payment_date" });
  const newWithholding = (min: number) => ({ ...oldWithholding(min), roundingMethod: "truncate" });
  const ADMIN_CARD = { ruleKind: "withholding", roundingUnit: 1, roundingMethod: "ceil", minWithholdingAmount: 0, basisDate: "payment_date" };
  const ADMIN_BUSINESS = { ...oldWithholding(0), roundingUnit: 100 };

  async function readRules(pool: Pool): Promise<Record<string, unknown>> {
    const { rows } = await pool.query<{ value: string; tax_rule: unknown }>(
      `SELECT value, tax_rule FROM code_items WHERE table_key = 'evidence_type' ORDER BY value`,
    );
    return Object.fromEntries(rows.map((row) => [row.value, row.tax_rule]));
  }

  it("옛 시드 값인 행만 새 값으로 바뀌고, 관리자가 바꾼 값은 그대로이며, 다시 돌려도 같다", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_vendor_kind_validate"));

    const insert = (value: string, rule: string) =>
      pool.query(`INSERT INTO code_items (table_key, value, label, tax_rule) VALUES ('evidence_type', $1, $1, $2::jsonb)`, [value, rule]);
    await insert("tax_invoice", JSON.stringify(VAT));
    await insert("invoice", `{"ruleKind":"none"}`);
    await insert("card_receipt", JSON.stringify(ADMIN_CARD));
    await insert("cash_receipt", `{"ruleKind":"none"}`);
    // 키 순서가 시드와 달라도 jsonb 비교라 같은 값으로 본다.
    await insert("other_income", `{"basisDate":"payment_date","minWithholdingAmount":125000,"roundingMethod":"round","roundingUnit":10,"ruleKind":"withholding"}`);
    await insert("business_income", JSON.stringify(ADMIN_BUSINESS));

    await migrateTo(pool);

    const expected = {
      business_income: ADMIN_BUSINESS,
      card_receipt: ADMIN_CARD,
      cash_receipt: VAT,
      invoice: { ruleKind: "none" },
      other_income: newWithholding(125000),
      tax_invoice: VAT,
    };
    expect(await readRules(pool)).toEqual(expected);

    // 관리자 변경이 없던 business_income·card_receipt를 옛 값으로 되돌려 같은 SQL을 다시 돌리면 그 둘도 맞춰진다.
    await pool.query(`UPDATE code_items SET tax_rule = $1::jsonb WHERE table_key = 'evidence_type' AND value = 'business_income'`, [JSON.stringify(oldWithholding(0))]);
    await pool.query(`UPDATE code_items SET tax_rule = '{"ruleKind":"none"}'::jsonb WHERE table_key = 'evidence_type' AND value = 'card_receipt'`);
    const entry = journal.entries.find((e) => e.tag.endsWith("_evidence_tax_rule_seed_sync"));
    if (!entry) throw new Error("journal에 _evidence_tax_rule_seed_sync 마이그레이션이 없습니다");
    const migrationSql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
    const runAgain = async () => {
      for (const statement of migrationSql.split("--> statement-breakpoint")) {
        if (statement.trim()) await pool.query(`BEGIN; ${statement}; COMMIT;`);
      }
    };
    await runAgain();
    const synced = { ...expected, business_income: newWithholding(0), card_receipt: VAT };
    expect(await readRules(pool)).toEqual(synced);

    await runAgain();
    expect(await readRules(pool)).toEqual(synced);
  });
});

// 거래처 사업자번호 유일 색인(0030 · 계획 bizno-unique-plan §5 · T7 · T8) — 숫자만 뽑은 번호가 살아 있는(보관 안 된) 거래처 사이에서
// 유일하다. 숨김도 세고, 보관 · NULL · 빈 값(숫자 없음)은 빠진다. 이미 살아 있는 중복이 있으면 가드가 번호를 알리며 멈춘다.
describe("거래처 사업자번호 유일 색인(0030)", () => {
  type VendorBizRow = { id: string; business_no: string | null; archived: boolean; hidden: boolean };
  async function readVendors(pool: Pool): Promise<VendorBizRow[]> {
    const { rows } = await pool.query<VendorBizRow>(
      `SELECT id::text AS id, business_no, archived_at IS NOT NULL AS archived, hidden FROM vendors ORDER BY id`,
    );
    return rows;
  }
  async function insertVendor(pool: Pool, id: string, businessNo: string | null, opts: { archived?: boolean; hidden?: boolean } = {}): Promise<void> {
    await pool.query(
      `INSERT INTO vendors (id, name, normalized_name, business_no, archived_at, hidden) VALUES ($1::uuid, $1::text, $1::text, $2, $3, $4)`,
      [id, businessNo, opts.archived ? new Date() : null, opts.hidden ?? false],
    );
  }
  async function indexDefs(pool: Pool): Promise<string[]> {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'vendors' AND indexname = 'vendors_business_no_live_key'`,
    );
    return rows.map((row) => row.indexdef);
  }

  it("(T7) 살아 있는 두 거래처의 번호가 숫자만 같으면 가드가 번호를 알리며 멈추고 색인 · 행이 그대로다", async () => {
    const pool = await createScratchDb();
    const before = countThrough("_evidence_tax_rule_seed_sync");
    await migrateTo(pool, before);
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000b1", "214-86-10231");
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000b2", "2148610231");
    const vendorsBefore = await readVendors(pool);

    let caught: unknown;
    try {
      await migrateTo(pool);
    } catch (error) {
      caught = error;
    }
    expect(errorText(caught)).toContain("2148610231(2곳)");

    expect(await indexDefs(pool)).toEqual([]);
    expect(await readVendors(pool)).toEqual(vendorsBefore);
    const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    expect(Number(rows[0]?.count)).toBe(before);
  });

  it("(T8) 겹침이 보관 · NULL · 빈 값뿐이면 적용되고, 그 뒤 살아 있는(숨김 포함) 같은 숫자 번호는 23505로 막힌다", async () => {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_evidence_tax_rule_seed_sync"));
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c1", "214-86-10231");
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c2", "2148610231", { archived: true });
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c3", null);
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c4", null);
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c5", "");
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c6", "");
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000c7", "---");
    const vendorsBefore = await readVendors(pool);

    await migrateTo(pool);

    expect(await readVendors(pool)).toEqual(vendorsBefore);
    expect(await indexDefs(pool)).toHaveLength(1);

    for (const [id, opts] of [
      ["00000000-0000-4000-8000-0000000000d1", {}],
      ["00000000-0000-4000-8000-0000000000d2", { hidden: true }],
    ] as const) {
      let caught: unknown;
      try {
        await insertVendor(pool, id, "214 86 10231", opts);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "23505", constraint: "vendors_business_no_live_key" });
    }
    // 보관 · 빈 값은 여전히 여러 개 들어간다.
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000d3", "214-86-10231", { archived: true });
    await insertVendor(pool, "00000000-0000-4000-8000-0000000000d4", "");
  });
});

// 06.2(D-6203 · 성공 기준 8): 계급 보는 범위 백필 — K1 사용자 답 「쓰기 범위 복사」(2026-10-08): 화면에서 만든 계급은
// 이행 전 업무 범위를 그대로 받고, 시드 계급 다섯은 D-6203 값이다. 시드를 부르지 않는다.
describe("06.2 view_scope 백필", () => {
  const TEAM = "00000000-0000-4000-8000-0000000000e1";
  const SEED = [
    ["role-ceo", "대표", "company"],
    ["role-sysadmin", "시스템 관리자", "company"],
    ["role-division-head", "본부 책임자", "company"],
    ["role-team-lead", "팀장", "team"],
    ["role-pm", "기획 PM", "team"],
  ] as const;
  // 화면 계급 다섯 — [id, work_scope, 켜진 보기 메뉴]
  const SCREEN = [
    ["role-s1", "team", ["projects", "expenses", "expenses.team"]],
    ["role-s2", "company", ["projects", "expenses"]],
    ["role-s3", "company", ["expenses"]],
    ["role-s4", "team", ["expenses", "expenses.team"]],
    ["role-s5", "team", ["expenses"]],
  ] as const;

  async function upgraded(): Promise<Pool> {
    const pool = await createScratchDb();
    await migrateTo(pool, countThrough("_view_scope") - 1);
    for (const [id, name, workScope] of SEED) {
      // 앞 마이그레이션(계급 백필)이 시드 계급 행을 이미 넣었을 수 있다 — 있으면 같은 값으로 맞춘다.
      await pool.query(
        `INSERT INTO roles (id, name, is_seed, work_scope) VALUES ($1, $2, true, $3)
         ON CONFLICT (id) DO UPDATE SET is_seed = true, work_scope = EXCLUDED.work_scope`,
        [id, name, workScope],
      );
    }
    for (const [id, workScope, menus] of SCREEN) {
      await pool.query(`INSERT INTO roles (id, name, is_seed, work_scope) VALUES ($1, $1, false, $2)`, [id, workScope]);
      for (const menu of menus) {
        await pool.query(`INSERT INTO permission_matrix (role_id, menu, action, allowed) VALUES ($1, $2, 'view', true)`, [id, menu]);
      }
    }
    await migrateTo(pool);
    return pool;
  }

  async function viewScopes(pool: Pool): Promise<Record<string, string>> {
    const { rows } = await pool.query<{ id: string; view_scope: string }>(`SELECT id, view_scope FROM roles ORDER BY id`);
    return Object.fromEntries(rows.map((row) => [row.id, row.view_scope]));
  }

  // 임시 DB에 묶은 판정 — 계급 · 권한표는 임시 DB에서 읽고, 발령은 고정 팀이다(사람 · 발령 행을 만들지 않는다).
  function scratchDeps(pool: Pool): Partial<RowScopeDeps> {
    return {
      can: async (viewer, menu) => {
        const { rows } = await pool.query<{ allowed: boolean }>(
          `SELECT allowed FROM permission_matrix WHERE role_id = $1 AND menu = $2 AND action = 'view'`,
          [viewer.roleId, menu],
        );
        return rows[0]?.allowed === true;
      },
      findRoleById: async (_viewer, id) => {
        const { rows } = await pool.query<{ view_scope: string }>(`SELECT view_scope FROM roles WHERE id = $1`, [id]);
        return rows[0] ? { viewScope: rows[0].view_scope } : null;
      },
      findMembershipAtDate: () => Promise.resolve({ teamId: TEAM }),
      today: () => "2026-10-08",
    };
  }

  // 이행 전 규칙: 프로젝트 = `projects` 보기면 전 행(`domain/permissions/scope-for.ts` 옛 scopeFor),
  // 지출결의 = `expenses` 보기 ∧ work_scope company면 전사, `expenses` ∧ `expenses.team` 보기면 팀(`domain/expenses/access.ts`).
  // 그 밖(`expenses`만 · work_scope team)은 기안자 · 결재자만이라 행 범위 서술자로는 none이다.
  function before(screen: (typeof SCREEN)[number], entity: "project" | "expense"): RowScope {
    const [, workScope, menus] = screen;
    const has = (menu: string) => (menus as readonly string[]).includes(menu);
    if (entity === "project") return { rows: has("projects") ? "all" : "none", includeArchived: false };
    if (!has("expenses")) return { rows: "none", includeArchived: false };
    if (workScope === "company") return { rows: "all", includeArchived: false };
    if (has("expenses.team")) return { rows: "limited", includeArchived: false, viewerId: "person", by: { kind: "team", teamId: TEAM } };
    return { rows: "none", includeArchived: false };
  }

  async function after(pool: Pool, roleId: string, entity: "project" | "expense"): Promise<RowScope> {
    return rowScopeFor({ id: "person", roleId }, entity, scratchDeps(pool));
  }

  it("시드 계급 다섯은 D-6203 값, 화면 계급 다섯은 이행 전 work_scope를 그대로 받는다", async () => {
    const pool = await upgraded();
    expect(await viewScopes(pool)).toEqual({
      "role-ceo": "company",
      "role-sysadmin": "company",
      "role-division-head": "org_unit",
      "role-team-lead": "team",
      "role-pm": "team",
      "role-s1": "team",
      "role-s2": "company",
      "role-s3": "company",
      "role-s4": "team",
      "role-s5": "team",
    });
  });

  it("화면 계급의 지출결의 서술자 — expenses.team 보기가 있거나 work_scope company면 이행 전과 같다", async () => {
    const pool = await upgraded();
    for (const screen of SCREEN.filter(([id]) => id !== "role-s5")) {
      expect(await after(pool, screen[0], "expense")).toEqual(before(screen, "expense"));
    }
  });

  it("화면 계급의 프로젝트 서술자 — work_scope company · 보기 없음은 이행 전과 같다", async () => {
    const pool = await upgraded();
    for (const screen of SCREEN.filter(([id]) => id !== "role-s1")) {
      expect(await after(pool, screen[0], "project")).toEqual(before(screen, "project"));
    }
  });

  it("(K1 쓰기 범위 복사: work_scope team · projects 보기 화면 계급은 프로젝트가 전 행 → 자기 팀으로 준다 — 의도된 축소)", async () => {
    const pool = await upgraded();
    const s1 = SCREEN[0];
    expect(before(s1, "project").rows).toBe("all");
    expect(await after(pool, s1[0], "project")).toEqual({
      rows: "limited",
      includeArchived: false,
      viewerId: "person",
      by: { kind: "team", teamId: TEAM },
    });
  });

  it("(D-6217: work_scope team · expenses 보기 · expenses.team 없는 화면 계급은 지출결의가 기안자 · 결재자만 → 자기 팀으로 넓어진다 — 의도된 확대)", async () => {
    const pool = await upgraded();
    const s5 = SCREEN[4];
    expect(before(s5, "expense").rows).toBe("none");
    expect(await after(pool, s5[0], "expense")).toEqual({
      rows: "limited",
      includeArchived: false,
      viewerId: "person",
      by: { kind: "team", teamId: TEAM },
    });
  });
});
