import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  DELETE_FILE_OWNER_KINDS,
  DELETE_ORDER,
  FILE_TABLES,
  IMMUTABLE_TABLES,
  KEEP_FILE_OWNER_KINDS,
  KEEP_TABLES,
  RESET_TABLES,
  SOURCE_NOT_DEMO,
} from "@/domain/cutover/tables";

// 08-02(D8-05 · C1): 전환 apply의 표 선택은 이름 분류다 — 새 표 · 새 FK · 새 source 표 · 새 파일 소유 종류가 분류에서 빠지면 여기서 빨개진다.
// 새 표를 더한 플랜은 domain/cutover/tables.ts에 그 표를 한 분류로 넣어야 이 시험이 녹색이다.

const DELETE_SET: readonly string[] = [...DELETE_ORDER, ...FILE_TABLES];
const CLASSIFIED: readonly string[] = [...DELETE_ORDER, ...FILE_TABLES, ...KEEP_TABLES, ...RESET_TABLES, ...IMMUTABLE_TABLES];

async function publicTables(): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  return result.rows.map((row) => row.table_name).sort();
}

async function foreignKeys(): Promise<{ child: string; parent: string; name: string }[]> {
  const result = await db.execute<{ child: string; parent: string; name: string }>(
    sql`select conrelid::regclass::text as child, confrelid::regclass::text as parent, conname as name
        from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`,
  );
  return result.rows;
}

describe("전환 표 분류(08-02 Task 2 · C1)", () => {
  it("공개 스키마의 모든 표가 삭제 · 소유 종류별 삭제 · 유지 · 초기화 · 불변 중 정확히 하나다", async () => {
    expect(new Set(CLASSIFIED).size, "두 분류에 든 표가 있다").toBe(CLASSIFIED.length);
    expect([...CLASSIFIED].sort()).toEqual(await publicTables());
  });

  it("삭제 표끼리의 FK는 자식이 부모보다 먼저 지워지는 순서다(자기 참조 제외)", async () => {
    const order: readonly string[] = DELETE_ORDER;
    const violations = (await foreignKeys())
      .filter((fk) => fk.child !== fk.parent && order.includes(fk.child) && order.includes(fk.parent))
      .filter((fk) => order.indexOf(fk.child) > order.indexOf(fk.parent))
      .map((fk) => `${fk.child} → ${fk.parent} (${fk.name})`);
    expect(violations).toEqual([]);
  });

  it("유지 · 초기화 · 불변 표에서 삭제 표를 가리키는 FK가 없다", async () => {
    const violations = (await foreignKeys())
      .filter((fk) => !DELETE_SET.includes(fk.child) && DELETE_SET.includes(fk.parent))
      .map((fk) => `${fk.child} → ${fk.parent} (${fk.name})`);
    expect(violations).toEqual([]);
  });

  it("소유 종류별 삭제 표(files · upload_intents)에는 FK가 걸려 있지 않다 — 삭제 순서 밖에서 먼저 비운다", async () => {
    const touching = (await foreignKeys()).filter(
      (fk) => (FILE_TABLES as readonly string[]).includes(fk.parent) || ((FILE_TABLES as readonly string[]).includes(fk.child) && DELETE_SET.includes(fk.parent)),
    );
    expect(touching.map((fk) => fk.name)).toEqual([]);
  });

  it("source 칸이 있는 표는 예외 둘을 빼면 전부 삭제 분류다", async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'source'`,
    );
    const outside = result.rows
      .map((row) => row.table_name)
      .filter((table) => !(SOURCE_NOT_DEMO as readonly string[]).includes(table) && !(DELETE_ORDER as readonly string[]).includes(table));
    expect(outside).toEqual([]);
  });

  it("files_owner_kind_check의 값은 지울 종류 ∪ 지킬 종류와 같고 둘은 겹치지 않는다", async () => {
    const result = await db.execute<{ def: string }>(
      sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'files_owner_kind_check'`,
    );
    const def = result.rows[0]?.def ?? "";
    const kinds = [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "").sort();
    const classified = [...DELETE_FILE_OWNER_KINDS, ...KEEP_FILE_OWNER_KINDS];
    expect(new Set(classified).size).toBe(classified.length);
    expect(kinds.length).toBeGreaterThan(0);
    expect([...classified].sort()).toEqual(kinds);
  });
});
