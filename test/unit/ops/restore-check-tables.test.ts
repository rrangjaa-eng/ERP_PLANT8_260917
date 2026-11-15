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

  // 08-01 CEO-3: 직원 입력 표는 전환 직전 0행일 수 있어 requireRows false로 읽히는지만 본다.
  it("직원 입력 표 12개가 requireRows false로 들어 있다", () => {
    const staffTables = [
      "projects",
      "quote_revisions",
      "quote_lines",
      "revenue_entries",
      "reserve_entries",
      "corp_card_usages",
      "expense_payments",
      "purchase_requests",
      "approval_instances",
      "leave_requests",
      "corp_cards",
      "evidence_records",
    ];
    for (const table of staffTables) {
      expect(RESTORE_CHECK_TABLES.find((e) => e.table === table), table).toEqual({ table, requireRows: false });
    }
  });

  it("기존 requireRows true 9표는 그대로다", () => {
    const required = RESTORE_CHECK_TABLES.filter((e) => e.requireRows).map((e) => e.table);
    expect(required).toEqual([
      "users",
      "roles",
      "permission_matrix",
      "visibility_matrix",
      "code_items",
      "org_units",
      "teams",
      "settings_simple",
      "settings_historized",
    ]);
  });
});
