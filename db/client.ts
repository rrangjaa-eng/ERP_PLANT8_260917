import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Connector, AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { env } from "@/lib/env";
import * as schema from "./schema";

// 환경 변수 하나(CLOUD_SQL_CONNECTION_NAME)로 Cloud SQL 커넥터(IAM, PRIVATE) /
// DATABASE_URL 스위칭하는 단일 db 진입점 (RESEARCH.md Pattern 6). 로컬(PC·클라우드
// 세션)은 DATABASE_URL이 Cloud SQL Auth Proxy 소켓과도 호환되는 127.0.0.1 경로,
// Cloud Run은 커넥터 + IAM 인증 + 공인 IP 없음(6A).
async function createPool(): Promise<Pool> {
  if (env.CLOUD_SQL_CONNECTION_NAME) {
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName: env.CLOUD_SQL_CONNECTION_NAME,
      authType: AuthTypes.IAM,
      ipType: IpAddressTypes.PRIVATE,
    });
    return new Pool({
      ...clientOpts,
      user: env.DB_IAM_USER,
      database: env.DB_NAME,
      max: env.DB_POOL_MAX,
    });
  }
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
  });
}

// 이 모듈은 프로세스당 커넥션 풀을 하나만 만든다. Cloud SQL 커넥터 경로는 비동기
// 준비가 필요해 top-level await로 초기화한다(Node ESM·tsx·Next 서버 런타임 전부
// top-level await를 지원한다).
export const pool: Pool = await createPool();

export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}
