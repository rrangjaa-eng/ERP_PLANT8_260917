import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readTableSchemas, requireDumpPath, type ColumnInfo } from "./dump-schema";

// Phase 4 Task 2 ③ — 덤프 → 원시 JSON. 네트워크·DB 접속 없음(D-72). ②로
// 확인한 실제 컬럼 순서를 근거로 대상 표(프로젝트·견적 줄·분류)의 데이터
// 행만 위치 기반으로 뽑는다 — mysqldump 기본 출력은 컬럼 목록이 없는
// `INSERT INTO \`table\` VALUES (...)` 형태이기 때문이다. 원시 JSON은
// 개인정보 열을 그대로 담으므로 리포 밖(gitignore 대상) 디렉터리에만 쓰고
// 커밋하지 않는다 — 커밋되는 것은 transform.ts(Task 3)의 변환 결과뿐이다.

const TARGET_TABLES = ["fone_project", "QUOTATION_LINE", "REPORT_CATEGORY1", "REPORT_CATEGORY2"] as const;

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), "scripts/migrate/.raw");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type SqlValue = string | number | null;

function unescapeChar(next: string): string {
  switch (next) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "0":
      return "\0";
    case "Z":
      return "\x1a";
    case "'":
      return "'";
    case '"':
      return '"';
    case "\\":
      return "\\";
    default:
      return next;
  }
}

const INTEGER_OR_DECIMAL = /^-?\d+(\.\d+)?$/;

// mysqldump 확장 INSERT 한 줄(`INSERT INTO \`table\` VALUES (...),(...);`)에서
// 튜플 목록을 파싱한다. 작은따옴표 문자열의 백슬래시 이스케이프만 다룬다
// (mysqldump 기본 이스케이프 방식) — 일반 SQL 파서가 아니라 이 덤프 형식
// 전용 파서다.
export function parseInsertValues(line: string): SqlValue[][] {
  const marker = "VALUES ";
  const valuesIdx = line.indexOf(marker);
  if (valuesIdx === -1) return [];

  const len = line.length;
  let i = valuesIdx + marker.length;
  const rows: SqlValue[][] = [];

  while (i < len) {
    while (i < len && (line.charAt(i) === "," || line.charAt(i) === " " || line.charAt(i) === "\n")) {
      i++;
    }
    if (line.charAt(i) !== "(") break;
    i++;

    const row: SqlValue[] = [];
    let field = "";
    let inString = false;
    let wasQuoted = false;

    const pushField = (): void => {
      if (wasQuoted) {
        row.push(field);
      } else if (field === "NULL") {
        row.push(null);
      } else if (INTEGER_OR_DECIMAL.test(field)) {
        row.push(Number(field));
      } else {
        row.push(field);
      }
      field = "";
      wasQuoted = false;
    };

    while (i < len) {
      const ch = line.charAt(i);
      if (inString) {
        if (ch === "\\") {
          field += unescapeChar(line.charAt(i + 1));
          i += 2;
          continue;
        }
        if (ch === "'") {
          if (line.charAt(i + 1) === "'") {
            field += "'";
            i += 2;
            continue;
          }
          inString = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === "'") {
        inString = true;
        wasQuoted = true;
        i++;
        continue;
      }
      if (ch === ",") {
        pushField();
        i++;
        continue;
      }
      if (ch === ")") {
        pushField();
        i++;
        break;
      }
      field += ch;
      i++;
    }

    rows.push(row);
  }

  return rows;
}

function zipRow(columns: ColumnInfo[], row: SqlValue[], table: string): Record<string, SqlValue> {
  if (row.length !== columns.length) {
    fail(
      `${table} 행의 값 개수(${row.length})가 컬럼 개수(${columns.length})와 다릅니다 — 파싱 실패로 보고 중단합니다.`,
    );
  }
  const record: Record<string, SqlValue> = {};
  columns.forEach((column, index) => {
    record[column.name] = row[index] ?? null;
  });
  return record;
}

async function extractTable(
  dumpPath: string,
  table: string,
  columns: ColumnInfo[],
): Promise<Record<string, SqlValue>[]> {
  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const prefix = `INSERT INTO \`${table}\``;
  const records: Record<string, SqlValue>[] = [];

  for await (const line of rl) {
    if (!line.startsWith(prefix)) continue;
    for (const row of parseInsertValues(line)) {
      records.push(zipRow(columns, row, table));
    }
  }

  return records;
}

function resolveOutputDir(): string {
  const override = process.env.MIGRATE_RAW_OUTPUT_DIR;
  return override ? resolve(process.cwd(), override) : DEFAULT_OUTPUT_DIR;
}

async function main(): Promise<void> {
  const dumpPath = requireDumpPath();
  const schemas = await readTableSchemas(dumpPath);
  const outputDir = resolveOutputDir();
  mkdirSync(outputDir, { recursive: true });

  for (const table of TARGET_TABLES) {
    const columns = schemas.get(table);
    if (!columns) {
      fail(`덤프에서 ${table} 표 정의를 찾지 못했습니다.`);
    }
    const records = await extractTable(dumpPath, table, columns);
    const outputPath = resolve(outputDir, `${table}.json`);
    writeFileSync(outputPath, JSON.stringify(records, null, 2) + "\n", "utf8");
    console.log(`${table}: ${records.length}건 추출 → ${outputPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
