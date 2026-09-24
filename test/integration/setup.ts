import { beforeEach, afterAll } from "vitest";
import { sql, is, getTableName } from "drizzle-orm";
import { PgTable, type TableConfig } from "drizzle-orm/pg-core";
import { db, closeDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// db/schema/index.ts 배럴의 모든 pgTable을 순회해 TRUNCATE — 01-02가 표를
// 추가해도 자동으로 포함된다(barrel export만 하면 됨).
const tables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable<TableConfig>[];
// 표 24개를 한 줄씩 TRUNCATE하면 왕복이 24번이다 — 한 문장으로 묶으면 같은
// 효과(전부 비움)를 왕복 한 번으로 낸다(실측: 324ms → 96ms).
const truncateStatement = `TRUNCATE TABLE ${tables.map((table) => `"${getTableName(table)}"`).join(", ")} CASCADE`;

// DB를 쓰지 않는 테스트 파일이 맨 위에서 호출해 매 테스트 전 TRUNCATE+시드를
// 건너뛴다. vitest가 파일마다 이 모듈을 새로 로드하므로(isolate 기본값) 이
// 플래그는 그 파일 안에서만 유효하고 다른 파일로 새지 않는다.
let skip = false;
export function skipDbReset(): void {
  skip = true;
}

beforeEach(async () => {
  if (skip) return;
  await db.execute(sql.raw(truncateStatement));
  // TRUNCATE가 마이그레이션이 넣은 계급 시드까지 지운다 — 계급·권한표가 없는
  // 상태에서는 판정이 전부 거짓이 되어 이후 모든 통합 테스트가 권한 오류로
  // 실패한다. 멱등 시드를 다시 불러 03-02~03-07의 통합 테스트가 계급·권한표를
  // 상속하게 한다.
  await seedMasterData(SYSTEM_VIEWER);
});

afterAll(async () => {
  await closeDb();
});
