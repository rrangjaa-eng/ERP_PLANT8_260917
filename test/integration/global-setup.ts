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
  // 03-06: lib/crypto.ts는 키가 없으면 fail-closed로 즉시 throw한다(의도된
  // 동작) — 통합 테스트가 실제 거래처 계좌번호 암호화 경로를 돌리려면 로컬
  // 테스트 전용 키가 필요하다. base64로 인코딩된 32바이트(Task 1 결정 ②).
  process.env.APP_DATA_KEY_v1 ??= randomBytes(32).toString("base64");
  // 규약 C4(04.3-02) — 통합 테스트도 확인증 기능 환경 게이트를 켠다(설정
  // cert.enabled는 각 테스트가 직접 켠다).
  process.env.CERT_FEATURE_ALLOWED ??= "true";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });
  } finally {
    await pool.end();
  }
}
