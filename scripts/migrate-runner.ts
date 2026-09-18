import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "@/db/client";

// 로컬(tsx)·Cloud Run Job 공용 마이그레이션 실행기. main()으로 분리해 앞 단계
// (16A 커넥션 검사 등, 01-05)를 나중에 끼워 넣기 쉽게 한다.
async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`db.migrate_failed: ${message}\n`);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
