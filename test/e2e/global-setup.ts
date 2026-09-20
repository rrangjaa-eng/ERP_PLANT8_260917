import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Playwright globalSetup: E2E DB(erp_test)에 마이그레이션을 적용한다. lib/env.ts를
// 거치지 않고 DATABASE_URL만으로 직접 연결한다(테스트 인프라는 앱 싱글턴과 독립).
export default async function globalSetup(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });
  } finally {
    await pool.end();
  }

  // Phase 3: 마이그레이션이 넣는 것은 계급 5행과 백필뿐이다 — 권한표·노출표·
  // 코드표 파생 시드는 domain/seed(MENUS·INFO_ITEMS 레지스트리에서 파생)가
  // 맡는다. 이걸 부르지 않으면 E2E 픽스처의 시스템 관리자 계정도 권한표가
  // 비어 있어 모든 메뉴 판정이 거부된다(can()의 기본 거부). 여기서는 이
  // 파일이 이미 채운 DATABASE_URL로 앱의 db/client.ts 싱글턴이 붙게 동적
  // import한다(정적 import면 이 모듈 로드 시점에 아직 없는 env로 풀이 먼저
  // 만들어진다).
  const { seedMasterData } = await import("@/domain/seed");
  const { SYSTEM_VIEWER } = await import("@/domain/viewer");
  await seedMasterData(SYSTEM_VIEWER);
  const { closeDb } = await import("@/db/client");
  await closeDb();

  await warmUpDevServer();
}

// Next dev(Turbopack)는 라우트를 첫 요청 시점에 컴파일한다 — 그 컴파일 지연 중
// Fast Refresh 리마운트가 첫 브라우저 테스트의 클라이언트 네비게이션과 겹치면
// 간헐적으로 실패한다. webServer가 뜬 뒤(globalSetup은 webServer 준비 이후 실행)
// 실제 테스트가 쓰는 라우트를 한 번씩 미리 요청해 컴파일을 끝내 둔다.
async function warmUpDevServer(): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
  const routes = ["/login", "/account", "/api/auth/get-session"];
  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`, { redirect: "manual" });
    } catch {
      // 워밍업 실패는 무시한다 — 각 테스트가 자체적으로 재시도 가능한 타임아웃을 쓴다.
    }
  }
}
