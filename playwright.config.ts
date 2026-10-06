import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// E2E 전용 DB·시크릿·베이스 URL. .env.local(로컬 dev DB·다른 secret)과 절대
// 겹치지 않게 여기서 먼저 채운다(플랜 리뷰 Eng OV-5).
process.env.DATABASE_URL ??= "postgres://erp:erp@127.0.0.1:5432/erp_test";
process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("hex");
// 03-06이 도입한 앱단 암호화 키. 없으면 거래처 계좌번호 저장이 fail-closed로
// 500을 내므로 vendors E2E가 깨진다. 로컬은 .env.local이 채워 줘서 통과했지만
// 그 파일은 gitignore라 CI에는 없다 — integration/global-setup.ts와 같은 방식으로
// 여기서 테스트 전용 키를 만든다(체크포인트 ③대로 base64 32바이트).
process.env.APP_DATA_KEY_v1 ??= randomBytes(32).toString("base64");
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3100";
process.env.APP_ENV ??= "local";
// 02-07: 픽스처 로그인이 늘어(모든 스펙이 같은 루프백 IP를 공유) 프로덕션 기본값
// (10/60초, lib/env.ts)이 전체 스위트를 자체적으로 막는다 — webServer는 process.env를
// 그대로 물려받으므로 여기 값만 올리고 webServer.env 블록은 건드리지 않는다(acceptance:
// 그 블록은 변경 전과 동일해야 한다).
process.env.RATE_LIMIT_LOGIN_MAX ??= "1000";
// 규약 C4(04.3-02) — 확인증 E2E는 webServer가 물려받는 이 값으로 기능
// 게이트를 켠다(설정 cert.enabled는 cert.setup.ts가 켠다).
process.env.CERT_FEATURE_ALLOWED ??= "true";

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

// 규약 C4(04.3-02) — 확인증 스펙은 이름에 cert가 들어간 파일 전부다
// (*cert*.spec.ts). desktop · mobile-375와 격리해 전용 프로젝트에서만 돈다.
const CERT_SPEC_PATTERN = "*cert*.spec.ts";

// 04.6-13 — 시각 회귀 스펙(visual.spec.ts 1280 · visual-390.spec.ts 폰 390)은 전용 `visual` 프로젝트에서만 돈다.
// 이름이 `mobile-`로 시작하지 않아 mobile-375가 가져가지 않고, desktop은 testIgnore로 제외한다(mobile-375 ·
// certs · cert-setup의 testIgnore는 건드리지 않는다 — playwright-config.test.ts가 고정한다).
const VISUAL_SPEC_PATTERNS = ["visual.spec.ts", "visual-390.spec.ts"];

export default defineConfig({
  testDir: "test/e2e",
  globalSetup: "./test/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  // CI는 실패를 GitHub 주석으로도 남긴다 — 잡 로그를 못 여는 곳에서도 실패 테스트 이름을 API로 읽는다.
  reporter: process.env.CI ? [["github"], ["dot"]] : "list",
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      APP_ENV: process.env.APP_ENV,
      // 05-05: 증빙 업로드 E2E는 서명 PUT 주소가 로컬 저장소 라우트(`/api/storage-local/**`)여야 한다(APP_ENV=local에서만 허용).
      STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? "local",
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
      // CI 2번 샤드가 desktop 절반을 이미 돌린 뒤 폰·설정만 잇는 단계에서 desktop을 비운다
      // (2026-10-02, ci.yml e2e 잡). 로컬·1번 샤드에서는 환경 변수가 없어 그대로다.
      testIgnore: process.env.E2E_SKIP_DESKTOP
        ? ["**"]
        : [MOBILE_SPEC_PATTERN, CERT_SPEC_PATTERN, "settings-approval-route.spec.ts", ...VISUAL_SPEC_PATTERNS],
      // 04.6-13(R2) — CI에서는 기준 사진을 찍는 깨끗한 DB 상태(visual-baseline.yml이 `visual`만 돌린다)와 e2e의 촬영
      // 상태가 같아야 사진이 재현되므로 `visual`이 desktop(과 뒤따르는 mobile-375 · cert-setup · certs · desktop-settings 사슬)
      // 앞에서 먼저 돈다. CI 2번 샤드의 폰·설정 단계(E2E_SKIP_DESKTOP)는 desktop을 비운 채 의존 사슬만 다시 거치므로
      // 거기서는 걸지 않는다 — 걸면 desktop 절반이 돈 DB에서 visual이 한 번 더 돌아 사진이 흔들린다.
      // 로컬은 의존 없음 — 로컬 `CI=true` 판정 실행이 visual을 끌어와도 시각 스펙이 스스로 건너뛴다(VISUAL_LOCAL).
      dependencies: process.env.CI && !process.env.E2E_SKIP_DESKTOP ? ["visual"] : [],
    },
    {
      name: "visual",
      testMatch: /(?:^|[\\/])visual(?:-390)?\.spec\.ts$/,
      // 사진은 직렬로(공유 erp_test · 픽스처 멱등) — 같은 DB 상태에서 매번 같은 화면이 나와야 한다.
      workers: 1,
      use: { reducedMotion: "reduce" },
    },
    {
      name: "mobile-375",
      testMatch: MOBILE_SPEC_PATTERN,
      testIgnore: CERT_SPEC_PATTERN,
      // 두 프로젝트는 erp_test 하나를 공유한다(함정 6) — 동시에 돌면 서로의
      // 데이터를 본다. mobile-admin-master-list-first.spec.ts는
      // document.documentElement.scrollWidth로 /admin/vendors의 가로 오버플로를
      // 재는데, 그 폭은 **다른 워커가 방금 만든 행**에 따라 달라진다:
      // vendors.spec.ts의 두 테스트가 계좌번호 있는 거래처를 테스트 진행
      // 중에 목록에 노출하고, 그 칸 때문에 481 > 375가 된다(6회 중 1회 실측).
      // 프로젝트를 줄 세워 그 창을 없앤다 — 두 스펙 모두 끝에 「숨기기」로
      // 정리하므로 desktop이 끝난 뒤에는 그런 행이 목록에 없다.
      // 같은 결함이 mobile-375 **안에도** 있었다(mobile-vendors.spec.ts가
      // 계좌번호 거래처를 만들고 정리하지 않았다). 그쪽이 실제로 재현된
      // 원인이고 그 스펙의 정리로 닫았다 — 프로젝트 직렬화는 desktop 쪽
      // 창을 닫는다. 둘은 다른 결함이라 둘 다 필요하다.
      //
      // 대가 둘:
      // 1) desktop이 빨가면 mobile은 아예 디스패치되지 않는다. 리포트에
      //    「N did not run」으로 나온다(skipped 버킷이 아니다). 함정 5와
      //    달리 조용하지는 않다.
      // 2) `--project=mobile-375`만 돌리면 desktop이 먼저 따라온다
      //    (02-RESEARCH.md:535가 성공 기준 3 검증 명령으로 적어 둔 형태다).
      //    폰만 빨리 보려면 `--project=mobile-375 --no-deps`를 쓴다.
      //
      // 진짜 해결은 워커별 DB 분리(후속 과제)다. 375px 표 오버플로 자체는
      // 2026-09-26 §7-3 칸 접기로 고쳤다(mobile-320-no-overflow.spec.ts).
      dependencies: ["desktop"],
      // 공용 설정을 잠깐 바꾸는 폰 스펙(mobile-projects-error — 04-52 G-04-4)이 있어 폰 스펙은 한 워커로 줄 세운다.
      // desktop은 dependencies로 이미 끝나 있어, 그 값이 쓰인 동안 도는 스펙이 그 하나뿐이다.
      workers: 1,
      use: {
        viewport: { width: 375, height: 800 },
      },
    },
    {
      // 규약 C4(04.3-02) — 기능을 켜는 준비가 desktop · mobile-375와 같은
      // erp_test에서 겹치면 그 스펙들이 켜진 기능을 본다(예:
      // admin-nav.spec.ts의 기획 PM 「관리」 없음) — 그래서 둘이 끝난
      // 뒤에만 돈다.
      // 스펙 하나만 빨리: --no-deps --workers=1 --project=cert-setup
      // --project=certs test/e2e/cert.setup.ts <스펙>
      name: "cert-setup",
      testMatch: "cert.setup.ts",
      dependencies: ["desktop", "mobile-375"],
    },
    {
      name: "certs",
      testMatch: CERT_SPEC_PATTERN,
      workers: 1,
      dependencies: ["cert-setup"],
    },
    {
      // 공유 erp_test의 전역 결재선을 바꾸는 스펙이라 다른 모든 스펙 뒤에 돈다(CEO-14).
      // 스펙 안 finally 복원과 함께 쓰는 이중 장치다. 확인증 프로젝트(certs)도
      // 「다른 모든 스펙」이라 그 뒤에 둔다.
      name: "desktop-settings",
      testMatch: "settings-approval-route.spec.ts",
      dependencies: ["mobile-375", "certs"],
    },
  ],
});
