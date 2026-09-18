import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { log } from "@/lib/log";
import { checkPoolRule, parsePoolEnv, PoolRuleInputError } from "@/domain/ops/pool-rule";

// 로컬(tsx)·Cloud Run Job 공용 마이그레이션 실행기.
//
// 16A: 마이그레이션 전에 실제 DB의 SHOW max_connections를 읽어
// max-instances × pool ≤ max_connections − 5를 검사한다(하드코딩된 값을
// 믿지 않는다, A2). 위반이면 exit 3으로 배포를 멈춘다. MAX_INSTANCES가
// 설정돼 있지 않으면(로컬 개발) 검사를 건너뛴다.
async function checkConnectionBudget(): Promise<void> {
  if (process.env.MAX_INSTANCES === undefined) {
    log.warn("db.pool_rule_skipped", { reason: "MAX_INSTANCES unset" });
    return;
  }

  const { maxInstances, poolMax } = parsePoolEnv({
    MAX_INSTANCES: process.env.MAX_INSTANCES,
    DB_POOL_MAX: process.env.DB_POOL_MAX,
  });

  const result = await db.execute(sql`show max_connections`);
  const row = result.rows[0] as { max_connections?: string } | undefined;
  const maxConnections = Number.parseInt(String(row?.max_connections ?? ""), 10);
  log.info("db.max_connections", { value: maxConnections });

  const rule = checkPoolRule({ maxInstances, poolMax, maxConnections });
  if (!rule.ok) {
    log.error("deploy.pool_rule_violation", {
      used: rule.used,
      limit: rule.limit,
      reason: rule.reason,
    });
    await closeDb();
    process.exit(3);
  }
}

async function main(): Promise<void> {
  try {
    await checkConnectionBudget();
  } catch (error) {
    if (error instanceof PoolRuleInputError) {
      log.error("deploy.pool_rule_input_error", { message: error.message });
      await closeDb().catch(() => undefined);
      process.exit(3);
    }
    throw error;
  }

  await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });
}

main()
  .then(async () => {
    log.info("db.migrate", { applied: true });
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    log.error("db.migrate_failed", { message });
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
