import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Viewer } from "@/domain/viewer";

// 복원본 확인(D8-08) 전용 읽기. viewer는 4계층 규칙 자리 — 호출자는 CLI verify(SYSTEM_VIEWER)뿐이다.

// drizzle 마이그레이터가 적용 기록을 남기는 표. created_at은 journal 항목의 when이다.
export async function readAppliedMigrations(viewer: Viewer): Promise<number[]> {
  void viewer;
  const result = await db.execute<{ created_at: string }>(
    sql`select created_at from drizzle.__drizzle_migrations order by id`,
  );
  return result.rows.map((row) => Number(row.created_at));
}

// 표 이름은 코드 상수 목록(RESTORE_CHECK_TABLES)에서만 오고 식별자로만 들어간다.
export async function countTableRows(viewer: Viewer, table: string): Promise<number> {
  void viewer;
  const result = await db.execute<{ count: number }>(sql`select count(*)::int as count from ${sql.identifier(table)}`);
  return result.rows[0]?.count ?? 0;
}
