import { beforeEach, afterAll } from "vitest";
import { sql, is, getTableName } from "drizzle-orm";
import { PgTable, type TableConfig } from "drizzle-orm/pg-core";
import { db, closeDb } from "@/db/client";
import * as schema from "@/db/schema";

// db/schema/index.ts 배럴의 모든 pgTable을 순회해 TRUNCATE — 01-02가 표를
// 추가해도 자동으로 포함된다(barrel export만 하면 됨).
const tables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable<TableConfig>[];

beforeEach(async () => {
  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${getTableName(table)}" CASCADE`));
  }
});

afterAll(async () => {
  await closeDb();
});
