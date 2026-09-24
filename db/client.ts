import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Connector, AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { env } from "@/lib/env";
import * as schema from "./schema";

// 환경 변수 하나(CLOUD_SQL_CONNECTION_NAME)로 Cloud SQL 커넥터(IAM, PRIVATE) /
// DATABASE_URL 스위칭하는 단일 db 진입점 (RESEARCH.md Pattern 6). 로컬(PC·클라우드
// 세션)은 DATABASE_URL이 Cloud SQL Auth Proxy 소켓과도 호환되는 127.0.0.1 경로,
// Cloud Run은 커넥터 + IAM 인증 + 공인 IP 없음(6A).
// 커넥터는 인증서·토큰 갱신 타이머를 들고 있어서 닫지 않으면 이벤트 루프가
// 비지 않는다 — Cloud Run Job이 할 일을 다 하고도 종료되지 않고 task-timeout
// 900초를 다 쓴다(2026-09-18 plant8-staging-account-txfcr에서 실제로 발생).
// closeDb()가 닫을 수 있게 모듈 수준에 들고 있는다.
let connector: Connector | null = null;

async function createPool(): Promise<Pool> {
  if (env.CLOUD_SQL_CONNECTION_NAME) {
    connector = new Connector();
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

// Phase 4(04-01): db.transaction(cb)의 tx 인자(PgTransaction)는 db와 같은
// 쿼리 빌더 메서드를 갖지만 `$client: Pool`이 없어 `typeof db` 전체와
// 구조적으로 다르다 — repositories 함수가 db·tx 양쪽을 다 받는 공용 타입.
export type DbOrTx = Pick<typeof db, "insert" | "update" | "select" | "delete" | "execute">;

export async function closeDb(): Promise<void> {
  // pool.end()가 거부해도 커넥터는 반드시 닫는다 — finally가 아니면 풀 종료
  // 실패 한 번에 갱신 타이머가 살아남아 고치려던 누수가 그대로 돌아온다.
  try {
    await pool.end();
  } finally {
    connector?.close();
    connector = null;
  }
}
