import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { Connector, AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// D-11/6A: DB 소유권 부트스트랩 Job — postgres 관리 사용자로 한 번 붙어 IAM
// 런타임 사용자에게 DB(erp)·public 스키마 소유권을 준다. 앱·migrate 경로는
// IAM 인증만 쓰고, 비밀번호 인증 경로는 이 Job에만 존재한다(6A). 재실행해도
// 같은 결과(멱등).

export type BootstrapGroup = { database: string; statements: string[] };

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// 식별자는 큰따옴표로 감싸고 내부 큰따옴표는 이스케이프한다(주입 방지).
export function buildBootstrapSql(p: { dbName: string; iamUser: string }): BootstrapGroup[] {
  const iamIdent = quoteIdent(p.iamUser);
  const iamLiteral = quoteLiteral(p.iamUser);
  const dbIdent = quoteIdent(p.dbName);

  return [
    {
      database: "postgres",
      statements: [
        `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${iamLiteral}) THEN
    RAISE EXCEPTION 'IAM role % does not exist - provision it via Cloud SQL IAM users first', ${iamLiteral};
  END IF;
END $$;`,
        `GRANT ${iamIdent} TO CURRENT_USER`,
        `ALTER DATABASE ${dbIdent} OWNER TO ${iamIdent}`,
      ],
    },
    {
      database: p.dbName,
      statements: [`ALTER SCHEMA public OWNER TO ${iamIdent}`, `GRANT ALL ON SCHEMA public TO ${iamIdent}`],
    },
  ];
}

async function createAdminPool(database: string): Promise<Pool> {
  if (env.DB_ADMIN_URL) {
    const url = new URL(env.DB_ADMIN_URL);
    url.pathname = `/${database}`;
    return new Pool({ connectionString: url.toString() });
  }

  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: env.CLOUD_SQL_CONNECTION_NAME,
    authType: AuthTypes.PASSWORD,
    ipType: IpAddressTypes.PRIVATE,
  });
  return new Pool({
    ...clientOpts,
    user: "postgres",
    password: env.DB_ADMIN_PASSWORD,
    database,
  });
}

async function ensureDatabaseExists(dbName: string): Promise<void> {
  const pool = await createAdminPool("postgres");
  try {
    const exists = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) {
      // CREATE DATABASE는 트랜잭션 안에서 실행할 수 없다 — 단일 문장으로 실행.
      await pool.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    }
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const dbName = env.DB_NAME;
  const iamUser = env.DB_IAM_USER;
  if (!iamUser) {
    throw new Error("DB_IAM_USER가 필요합니다");
  }

  await ensureDatabaseExists(dbName);

  const groups = buildBootstrapSql({ dbName, iamUser });
  for (const group of groups) {
    const pool = await createAdminPool(group.database);
    try {
      for (const statement of group.statements) {
        await pool.query(statement);
      }
    } finally {
      await pool.end();
    }
  }
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을 부른다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => {
      log.info("db.bootstrap", { dbName: env.DB_NAME, iamUser: env.DB_IAM_USER });
      process.exit(0);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error("db.bootstrap_failed", { message });
      process.exit(1);
    });
}
