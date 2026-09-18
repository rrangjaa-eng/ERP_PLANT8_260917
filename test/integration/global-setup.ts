import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// vitest globalSetup: 통합 테스트 DB(erp_test) 환경 변수 채우기 + 마이그레이션.
// scripts/migrate-runner.ts는 실행 후 process.exit()를 호출하므로 재사용하지 않고
// drizzle-orm/node-postgres/migrator를 직접 호출한다. NODE_ENV는 vitest가 'test'로
// 이미 둔다.
export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL ??= "postgres://erp:erp@127.0.0.1:5432/erp_test";
  process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("hex");
  process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3000";
  process.env.APP_ENV ??= "local";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });
  } finally {
    await pool.end();
  }
}
