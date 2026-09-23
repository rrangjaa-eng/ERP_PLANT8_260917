import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

// Phase 4 Task 2 ② — 정찰 단계(04-RESEARCH.md Gap 1 해소). 덤프 파일을
// 줄 단위로 스트리밍해 CREATE TABLE 정의문만 파싱하고 컬럼 이름·타입을
// 찍는다. INSERT 등 데이터 행은 절대 읽지 않는다 — 개인정보가 그대로
// 들어있는 실제 값을 이 단계에서 다루지 않기 위해서다(T-04-15).
//
// extract.ts가 같은 컬럼 순서 정보를 재사용해 위치 기반 VALUES 튜플을
// 컬럼 이름에 짝짓는다(mysqldump 기본 출력은 컬럼 목록 없는
// `INSERT INTO \`table\` VALUES (...)` 형태라 순서가 유일한 단서다).

export interface ColumnInfo {
  name: string;
  type: string;
}

const CREATE_TABLE_START = /^CREATE TABLE `([^`]+)`/;
const CREATE_TABLE_END = /^\)\s*ENGINE=/;
const COLUMN_DEFINITION = /^`([^`]+)`\s+([A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?)/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function requireDumpPath(): string {
  const dumpPath = process.env.INTRANET_DUMP_PATH;
  if (!dumpPath) {
    fail("INTRANET_DUMP_PATH가 설정되지 않았습니다.");
  }
  try {
    if (!statSync(dumpPath).isFile()) {
      fail("INTRANET_DUMP_PATH가 가리키는 경로가 파일이 아닙니다.");
    }
  } catch {
    fail("INTRANET_DUMP_PATH가 가리키는 파일을 찾을 수 없거나 읽을 수 없습니다.");
  }
  return dumpPath;
}

// 테이블 이름 → 컬럼 목록(덤프에 등장하는 순서 그대로, PRIMARY/UNIQUE KEY 등
// 제약 정의 줄은 제외). 순서가 extract.ts의 위치 기반 매핑 근거다.
export async function readTableSchemas(dumpPath: string): Promise<Map<string, ColumnInfo[]>> {
  const schemas = new Map<string, ColumnInfo[]>();
  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let capturing = false;
  let currentTable = "";
  let currentColumns: ColumnInfo[] = [];

  for await (const line of rl) {
    if (!capturing) {
      const start = CREATE_TABLE_START.exec(line);
      const tableName = start?.[1];
      if (tableName) {
        capturing = true;
        currentTable = tableName;
        currentColumns = [];
      }
      continue;
    }

    if (CREATE_TABLE_END.test(line)) {
      schemas.set(currentTable, currentColumns);
      capturing = false;
      continue;
    }

    const trimmed = line.trimStart();
    if (trimmed.startsWith("`")) {
      const match = COLUMN_DEFINITION.exec(trimmed);
      const columnName = match?.[1];
      const columnType = match?.[2];
      if (columnName && columnType) {
        currentColumns.push({ name: columnName, type: columnType });
      }
    }
  }

  return schemas;
}

async function main(): Promise<void> {
  const dumpPath = requireDumpPath();
  const schemas = await readTableSchemas(dumpPath);

  if (schemas.size === 0) {
    fail("덤프에서 CREATE TABLE 정의문을 하나도 찾지 못했습니다.");
  }

  for (const [table, columns] of schemas) {
    const columnList = columns.map((column) => `${column.name} ${column.type}`).join(", ");
    console.log(`TABLE ${table}: ${columnList}`);
  }
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을
// 부른다(scripts/seed-master.ts와 같은 결).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
