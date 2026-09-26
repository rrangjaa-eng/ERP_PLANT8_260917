import { describe, expect, it } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { PgTable, type TableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { RESTORE_CHECK_TABLES } from "@/domain/ops/restore-check-tables";

// 표 이름은 sql.identifier로 SQL에 들어간다 — 목록이 실제 스키마 표만 담는지 고정한다
// (배럴의 표 모으기는 test/integration/setup.ts 방식).
const schemaTables = new Set(
  (Object.values(schema).filter((value) => is(value, PgTable)) as PgTable<TableConfig>[]).map((t) => getTableName(t)),
);

describe("RESTORE_CHECK_TABLES", () => {
  it("모든 표가 db/schema 배럴의 실제 표다", () => {
    const unknown = RESTORE_CHECK_TABLES.map((e) => e.table).filter((t) => !schemaTables.has(t));
    expect(unknown).toEqual([]);
  });

  it("비어 있지 않고 중복이 없으며 requireRows 표가 하나 이상이다", () => {
    const names = RESTORE_CHECK_TABLES.map((e) => e.table);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    expect(RESTORE_CHECK_TABLES.some((e) => e.requireRows)).toBe(true);
  });
});
