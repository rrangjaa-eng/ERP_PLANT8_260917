import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// E2E 전용 DB·시크릿·베이스 URL. .env.local(로컬 dev DB·다른 secret)과 절대
// 겹치지 않게 여기서 먼저 채운다(플랜 리뷰 Eng OV-5).
process.env.DATABASE_URL ??= "postgres://erp:erp@127.0.0.1:5432/erp_test";
process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("hex");
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3100";
process.env.APP_ENV ??= "local";
// 02-07: 픽스처 로그인이 늘어(모든 스펙이 같은 루프백 IP를 공유) 프로덕션 기본값
// (10/60초, lib/env.ts)이 전체 스위트를 자체적으로 막는다 — webServer는 process.env를
// 그대로 물려받으므로 여기 값만 올리고 webServer.env 블록은 건드리지 않는다(acceptance:
// 그 블록은 변경 전과 동일해야 한다).
process.env.RATE_LIMIT_LOGIN_MAX ??= "1000";

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

// 폰 375 전용 스펙은 파일명 접두어 하나로 구분한다(02-07 계획) — 새 스펙 파일을
// 추가할 때 이 패턴에 맞는 이름만 쓰면 별도 등록 없이 폰 프로젝트가 잡는다.
// desktop 프로젝트는 같은 패턴으로 그 파일들을 제외해 기존 스펙이 폰 프로젝트에서
// 중복 실행되지 않는다(§threat T-02-22, CI 예산 보호).
const MOBILE_SPEC_PATTERN = "mobile-*.spec.ts";

export default defineConfig({
  testDir: "test/e2e",
  globalSetup: "./test/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:3100/api/health",
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
  projects: [
    {
      name: "desktop",
      testIgnore: MOBILE_SPEC_PATTERN,
    },
    {
      name: "mobile-375",
      testMatch: MOBILE_SPEC_PATTERN,
      use: {
        viewport: { width: 375, height: 800 },
      },
    },
  ],
});
