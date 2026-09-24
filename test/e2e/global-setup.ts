import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Playwright globalSetup: E2E DB(erp_test)에 마이그레이션을 적용한다. lib/env.ts를
// 거치지 않고 DATABASE_URL만으로 직접 연결한다(테스트 인프라는 앱 싱글턴과 독립).
export default async function globalSetup(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await resetTestSchema(pool);
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

// 매 실행을 빈 erp_test에서 시작한다. 비우지 않으면 앞 실행(또는 CI에서 먼저
// 도는 통합 테스트)이 남긴 행이 목록에 섞인다 — corp-cards.spec.ts를 DB를
// 비우지 않고 두 번 돌리면 2회차가 「개인카드1」 두 행으로 strict mode에 걸린다.
// DATABASE_URL이 _test DB가 아니면 지우지 않고 멈춘다(개발 DB 보호).
async function resetTestSchema(pool: Pool): Promise<void> {
  const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`E2E는 _test DB에서만 돈다(지금: ${dbName}) — 비우기를 거부한다.`);
  }
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

// Next dev(Turbopack)는 라우트를 첫 요청 시점에 컴파일한다 — 그 컴파일 지연 중
// Fast Refresh 리마운트가 첫 브라우저 테스트의 클라이언트 네비게이션과 겹치면
// 간헐적으로 실패한다. webServer가 뜬 뒤(globalSetup은 webServer 준비 이후 실행)
// 실제 테스트가 쓰는 라우트를 한 번씩 미리 요청해 컴파일을 끝내 둔다.
//
// 위 세 라우트만으로는 모자랐다 — 전체 스위트(개발 서버)에서 상세 화면
// (/projects/[id]·/admin/people/[id])의 첫 컴파일이 워커 둘의 부하 속에서 5초를
// 넘겨 toHaveURL(기본 5초)이 떨어졌다(trace: RSC 요청 5022ms). 로그인 없이
// 요청해도 라우트는 컴파일되므로(307로 돌아와도 2.5초 → 0.1초 실측) app/의
// page.tsx를 전부 한 번씩 요청한다. 동적 조각은 아무 값으로 채운다.
async function warmUpDevServer(): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
  const routes = ["/login", "/account", "/api/auth/get-session", ...appPageRoutes()];
  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`, { redirect: "manual" });
    } catch {
      // 워밍업 실패는 무시한다 — 각 테스트가 자체적으로 재시도 가능한 타임아웃을 쓴다.
    }
  }
}

function appPageRoutes(): string[] {
  return readdirSync(resolve(process.cwd(), "app"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith("page.tsx"))
    .map((file) =>
      `/${file}`
        .replace(/\\/g, "/")
        .replace(/\/page\.tsx$/, "")
        .replace(/\/\([^/]+\)/g, "")
        .replace(/\[[^\]]+\]/g, "e2e-warmup"),
    )
    .map((route) => route || "/");
}
