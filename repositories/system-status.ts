import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Viewer } from "@/domain/viewer";

// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙).

// 비특권 사용자에게는 다른 세션의 state가 null로 보이므로 state 필터 없이 전체
// 연결 수를 센다(16A 공식이 세는 단위와 같다).
export async function countConnections(viewer: Viewer): Promise<number> {
  void viewer;
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from pg_stat_activity where datname = current_database()`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function maxConnections(viewer: Viewer): Promise<number> {
  void viewer;
  const result = await db.execute<{ max_connections: string }>(sql`show max_connections`);
  return Number.parseInt(result.rows[0]?.max_connections ?? "0", 10);
}
