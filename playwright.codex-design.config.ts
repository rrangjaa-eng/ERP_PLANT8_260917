import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Codex 디자인 검토 캡처 전용 설정(scripts/codex-design-review.sh가 CI=true로 부른다).
// 기본 설정의 webServer(CI면 프로덕션 빌드)·globalSetup(erp_test 초기화)·클라우드 Chromium을
// 그대로 쓰고, 캡처 스펙만 따로 돌린다 — 일반 E2E(testDir test/e2e)는 이 스펙을 잡지 않는다.
// 루트에 두는 이유: 기본 설정의 globalSetup 경로와 webServer 작업 디렉터리가 상대 경로다.
const reviewDir = process.env.CODEX_REVIEW_DIR ?? "test-results/codex-design-review/manual";

if (!base.webServer || Array.isArray(base.webServer)) {
  throw new Error("playwright.config.ts의 webServer는 객체 하나여야 한다");
}

export default defineConfig({
  ...base,
  testDir: "scripts/codex-design-review",
  testMatch: "capture.spec.ts",
  workers: 1,
  reporter: "list",
  // 기본 test-results 루트를 쓰면 Playwright가 실행마다 비운다 — 산출물 폴더 아래로 옮긴다.
  outputDir: `${reviewDir}/pw-output`,
  // 프로덕션 빌드는 기본 60초를 넘길 수 있다.
  webServer: { ...base.webServer, timeout: 600_000 },
  projects: [{ name: "capture" }],
});
