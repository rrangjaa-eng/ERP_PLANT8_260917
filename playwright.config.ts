import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// E2E 전용 DB·시크릿·베이스 URL. .env.local(로컬 dev DB·다른 secret)과 절대
// 겹치지 않게 여기서 먼저 채운다(플랜 리뷰 Eng OV-5).
process.env.DATABASE_URL ??= "postgres://erp:erp@127.0.0.1:5432/erp_test";
process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("hex");
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3100";
process.env.APP_ENV ??= "local";

// 클라우드 세션은 Playwright CDN이 프록시에 막혀 `playwright install`이 실패한다
// — 먼저 명시 경로(PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)를 쓰고, 없으면 클라우드
// 세션의 사전 설치 Chromium 후보 경로를 순서대로 탐색한다
// (docs/research/cloud-session-setup.md §E — 실측: `/opt/pw-browsers/chromium`
// 자체가 실행 파일 심볼릭 링크인 세션과 `/opt/pw-browsers/chromium/chrome` 하위
// 경로인 세션이 둘 다 있어 두 형태를 모두 시도한다).
const CLOUD_CHROMIUM_CANDIDATES = [
  "/opt/pw-browsers/chromium/chrome",
  "/opt/pw-browsers/chromium",
];

function resolveCloudChromiumPath(): string | undefined {
  if (process.env.CLAUDE_CODE_REMOTE !== "true") return undefined;
  return CLOUD_CHROMIUM_CANDIDATES.find((candidate) => existsSync(candidate));
}

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || resolveCloudChromiumPath();

export default defineConfig({
  testDir: "test/e2e",
  globalSetup: "./test/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    // Task 3이 /healthz로 바꾼다(healthz는 이 태스크 이후에 생긴다).
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      APP_ENV: process.env.APP_ENV,
      PORT: "3100",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
