---
phase: 01-deploy-skeleton-login
plan: 01
subsystem: auth
tags: [nextjs, typescript, drizzle, postgres, better-auth, playwright, vitest, pnpm]

# Dependency graph
requires: []
provides:
  - Next.js 16 + TypeScript 6 strict App Router 스캐폴드(pnpm scripts 19개 계약)
  - db/schema/index.ts 배럴 + better-auth 1.7 core 스키마(복수형 users·sessions·accounts·verifications·rate_limits)
  - db/client.ts 단일 DB 진입점(DATABASE_URL ↔ Cloud SQL 커넥터 IAM/PRIVATE 스위칭)
  - lib/env.ts Phase 1 환경 변수 zod 계약, lib/log.ts JSON 로그, lib/auth.ts better-auth 인스턴스
  - domain/viewer.ts(Viewer·SYSTEM_VIEWER), domain/auth/accounts.ts(createAccount·generateTempPassword), domain/auth/provider.ts(AUTH_PROVIDERS)
  - domain/health.ts + repositories/health.ts + app/healthz/route.ts(4계층 준수 상태 프로브)
  - repositories/users.ts(findUserByEmail·findUserById·setPasswordTemporary)
  - 무스타일 로그인·내 계정·로그아웃 화면(app/(auth)/login, app/(app)/account)
  - scripts/dev-db.sh(Docker/apt 자동 감지 로컬 Postgres), scripts/migrate-runner.ts
  - vitest.config.ts(unit/integration 프로젝트 분리), playwright.config.ts(E2E 전용 DB·포트)
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

# Actuals (#2632)
actuals:
  tokens: 19700
  tasks: 3
  commits: 3
plan_head_before: e81b8ca1146484847b2b696347d51ab6c0005eee

# Tech tracking
tech-stack:
  added:
    - "next@16.3.5, react/react-dom@19.3.0, typescript@6.0.3"
    - "drizzle-orm@0.45.2, drizzle-kit@0.31.10"
    - "better-auth@1.7.5, @better-auth/drizzle-adapter@1.7.5"
    - "next-safe-action@8.7.3, zod@4.6.5"
    - "pg@8.23.0, @google-cloud/cloud-sql-connector@1.12.0, @googleapis/sqladmin@40.0.0, google-auth-library@11.1.0"
    - "vitest@5.0.1, @playwright/test@1.63.0"
    - "eslint@9.39.5(계획의 10.10.0에서 다운그레이드, 아래 결정 참조), typescript-eslint@8.70.0, eslint-config-next@16.3.5, eslint-plugin-boundaries@7.2.0"
    - "squawk-cli@2.65.0, tsx, esbuild"
  patterns:
    - "4계층 app→domain→repositories(viewer 인자 필수)→db, lib은 횡단"
    - "package.json \"type\": \"module\" — db/client.ts의 top-level await(Cloud SQL 커넥터 비동기 초기화) 지원"
    - "better-auth internalAdapter.createUser(user, { method: \"admin\" }) 2-인자 시그니처(admin 플러그인과 동일 패턴)"
    - "E2E 전용 DB(erp_test)·포트(3100)·secret — .env.local의 개발 DB와 절대 겹치지 않음"

key-files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - eslint.config.mjs
    - drizzle.config.ts
    - vitest.config.ts
    - playwright.config.ts
    - lib/env.ts
    - lib/log.ts
    - lib/auth.ts
    - lib/auth-client.ts
    - lib/viewer.ts
    - db/client.ts
    - db/schema/auth.ts
    - db/schema/index.ts
    - db/migrations/0000_init.sql
    - domain/viewer.ts
    - domain/auth/accounts.ts
    - domain/auth/provider.ts
    - domain/health.ts
    - repositories/users.ts
    - repositories/health.ts
    - app/healthz/route.ts
    - app/api/auth/[...all]/route.ts
    - "app/(auth)/login/page.tsx"
    - "app/(auth)/login/login-form.tsx"
    - "app/(app)/account/page.tsx"
    - "app/(app)/account/logout-button.tsx"
    - scripts/dev-db.sh
    - scripts/migrate-runner.ts
    - test/e2e/login-logout.spec.ts
    - test/e2e/fixtures.ts
    - test/e2e/global-setup.ts
    - test/unit/env.test.ts
    - test/unit/log.test.ts
    - test/integration/auth.test.ts
    - test/integration/healthz.test.ts
    - test/integration/setup.ts
    - test/integration/global-setup.ts
    - .env.example
  modified:
    - .gitignore
    - .claude/settings.json
    - scripts/install_pkgs.sh
    - CLAUDE.md (next dev 자동 삽입 블록 — 자체 안내에 따라 커밋)

key-decisions:
  - "eslint@10.10.0 → 9.39.5로 다운그레이드: eslint-config-next가 의존하는 eslint-plugin-react 7.37.5(최신)가 ESLint 10의 context API 변경(getFilename 제거)에 아직 대응하지 않아 lint 실행 자체가 크래시함. RESEARCH.md가 이미 9.39.5를 '유지보수' 대안으로 명시해뒀던 값으로 전환(같은 승인 목록 내 버전 선택, 새 패키지 추가 아님)"
  - "package.json에 \"type\": \"module\" 추가: db/client.ts가 Cloud SQL 커넥터 비동기 초기화를 top-level await로 하는데, tsx가 CJS로 트랜스파일하면 top-level await를 지원하지 않아 스크립트 실행이 즉시 실패함. tsconfig의 module:esnext와도 일관됨"
  - "next.config.ts에 allowedDevOrigins: ['127.0.0.1','localhost'] 추가: Next 16 dev 모드의 cross-origin 리소스 보호가 기본으로 127.0.0.1(Playwright baseURL)의 HMR 자산 요청을 막아 클라이언트 번들이 하이드레이션되지 않고 로그인 폼이 네이티브 GET 제출로 대체되는 문제가 있었음"
  - "test/e2e/global-setup.ts에 /login·/account·/api/auth/get-session 워밍업 요청 추가: Turbopack의 첫 라우트 컴파일 지연과 Fast Refresh 리마운트가 겹쳐 첫 E2E 테스트가 간헐적으로 로그인 후 네비게이션을 놓치는 문제를 재현·수정. globalSetup은 webServer 기동 이후 실행됨을 실측으로 확인"
  - "domain/auth/accounts.ts의 internalAdapter.createUser는 (user, source) 2-인자다 — source는 UserProvisioningSource(필수). better-auth의 admin 플러그인이 관리자 발급 계정에 쓰는 것과 같은 { method: \"admin\" }을 그대로 채택(플랜 스케치는 1-인자였음, 실제 타입 확인 후 수정)"
  - "test/integration/auth.test.ts의 sliding 쿠키 재발급 검증은 sessions.updatedAt이 아니라 sessions.expiresAt을 조작해야 한다 — better-auth의 실제 판정식은 expiresAt - expiresIn + updateAge <= now (updatedAt 기준이 아님). 소스 확인 후 수정"
  - "@better-auth/drizzle-adapter는 실제로 npm 레지스트리에 존재해 설치됨(1.7.5) — 플랜이 언급한 'built-in adapter로 폴백' 경로는 필요 없었음"
  - "better-auth 1.7.5의 emailAndPassword.disableSignUp 옵션이 실제 타입에 존재해 hooks.before APIError 폴백은 불필요"

requirements-completed: [AUTH-02]

coverage:
  - id: D1
    description: "픽스처 계정으로 /login에서 이메일+비밀번호를 제출하면 /account로 이동하고 이메일이 보인다"
    requirement: "AUTH-02"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts#픽스처 계정으로 로그인하면 /account로 이동하고 이메일이 보인다"
        status: pass
    human_judgment: false
  - id: D2
    description: "로그인 뒤 저장한 브라우저 상태로 새 컨텍스트를 열어도 /account가 유지되고 세션 쿠키가 30일 sliding이다"
    requirement: "AUTH-02"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts#저장한 브라우저 상태로 새 컨텍스트를 열어도 세션이 유지되고 쿠키가 30일 sliding이다"
        status: pass
      - kind: integration
        ref: "test/integration/auth.test.ts#sliding 쿠키 재발급"
        status: pass
    human_judgment: false
  - id: D3
    description: "/account 로그아웃 버튼을 누르면 현재 기기 세션만 끝나고 /login으로 가며 /account 재접근은 /login으로 리다이렉트된다"
    requirement: "AUTH-02"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts#로그아웃하면 /login으로 가고 /account 재접근은 /login으로 리다이렉트된다"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm db:dev 한 번으로 Docker 또는 apt Postgres 어느 쪽이든 127.0.0.1:5432에 erp·erp_test DB가 준비된다"
    verification:
      - kind: other
        ref: "bash scripts/dev-db.sh (apt 경로 실측, 이 세션에는 Docker 데몬 없음)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /healthz는 DB SELECT 1 성공 시 200 {ok:true,sha,deployedAt}, 실패 시 503을 반환한다"
    verification:
      - kind: integration
        ref: "test/integration/healthz.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "POST /api/auth/sign-up/email은 4xx로 거부된다"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "test/integration/auth.test.ts#POST /api/auth/sign-up/email은 4xx로 거부된다"
        status: pass
    human_judgment: false
  - id: D7
    description: "lib/env.ts는 Phase 1 환경 변수 계약 전체를 zod로 검증하고 __unset__ 값을 undefined로 취급한다"
    verification:
      - kind: unit
        ref: "test/unit/env.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "pnpm build가 standalone 산출물을 생성한다"
    verification:
      - kind: other
        ref: "pnpm build → .next/standalone/server.js 존재 확인"
        status: pass
    human_judgment: false

duration: 43min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 1: 배포 스켈레톤 Walking Skeleton Summary

**Next.js 16 + TypeScript 6 strict + Drizzle + better-auth 골격을 세우고 "로그인 → DB 세션 → 내 계정 → 로그아웃" 한 경로를 4계층 전부와 Playwright E2E로 실제로 증명했다.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-09-18T06:37:00Z (추정 — 세션 시작)
- **Completed:** 2026-09-18T07:20:29Z
- **Tasks:** 3 (Task 1 승인 체크포인트 사전 해결 포함)
- **Files modified:** 51 (public/ 정적 자산·pnpm-lock.yaml 제외)

## Accomplishments

- Next.js 16 App Router 스캐폴드 + pnpm scripts 19개 계약(dev~rollback) + `packageManager pnpm@10.33.0`
- better-auth 1.7.5 이메일+비밀번호 인증(30일 sliding 세션, `disableSignUp`, `cookiePrefix: erp`, `is_admin`·`password_is_temporary` 추가 필드)
- Drizzle 스키마(복수형 users·sessions·accounts·verifications·rate_limits) + 마이그레이션 0000 생성·커밋
- Cloud SQL 커넥터(IAM, PRIVATE) ↔ DATABASE_URL 스위칭 단일 `db/client.ts` 진입점
- `domain/auth/accounts.ts`의 `createAccount` — better-auth 내부 어댑터로 계정+credential 직접 생성(공개 가입 경로 없음)
- 4계층을 지키는 `/healthz`(`app → domain/health → repositories/health → db`)
- `lib/env.ts`(zod 계약, `__unset__` 정규화, 비로컬 refine) + `lib/log.ts`(JSON 구조화 로그)
- E2E 1개(로그인·세션 영속·쿠키 30일·로그아웃 4단언) + 통합 2개(auth, healthz) + 단위 2개(env, log) — 전부 실제 실행 확인
- `scripts/dev-db.sh` — Docker/apt 자동 감지 로컬 Postgres 16(이 클라우드 세션은 apt 경로로 실측 확인)

## Task Commits

1. **Task 1: 새 의존성 일괄 승인** — 체크포인트, 오케스트레이터가 사전 승인 확인(커밋 없음)
2. **Task 2: 골격 + Walking Skeleton** - `f243427` (feat)
3. **Task 3: 런타임 확장 — /healthz, JSON 로그, AUTH_PROVIDER 어댑터, 세션 훅** - `90cca6c` (feat)

**Plan metadata:** (이 커밋 다음에 기록됨)

## Files Created/Modified

주요 파일은 frontmatter의 `key-files`를 참조. 요약:
- 계약 파일: `lib/env.ts`, `lib/log.ts`, `domain/viewer.ts`, `domain/auth/provider.ts`
- 인증: `lib/auth.ts`, `lib/auth-client.ts`, `lib/viewer.ts`, `domain/auth/accounts.ts`, `app/api/auth/[...all]/route.ts`
- DB: `db/client.ts`, `db/schema/{auth,index}.ts`, `db/migrations/0000_init.sql`
- 화면(무스타일): `app/(auth)/login/*`, `app/(app)/account/*`, `app/layout.tsx`, `app/session-refresh.tsx`, `app/page.tsx`
- 상태: `app/healthz/route.ts`, `domain/health.ts`, `repositories/health.ts`
- 테스트: `test/e2e/*`, `test/unit/*`, `test/integration/*`, `vitest.config.ts`, `playwright.config.ts`
- 스크립트·훅: `scripts/dev-db.sh`, `scripts/migrate-runner.ts`, `scripts/install_pkgs.sh`, `.claude/settings.json`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심 7개는 전부 "실제 실행 확인" 중 발견된 라이브러리 실제 동작과 플랜 스케치의 차이를 바로잡은 것이며, 승인된 의존성 목록·아키텍처를 벗어나지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eslint 10.10.0 → 9.39.5 다운그레이드**
- **Found during:** Task 2 (eslint.config.mjs 작성 뒤 `pnpm lint` 실행)
- **Issue:** `eslint-plugin-react`(eslint-config-next의 전이 의존성) 최신 7.37.5도 ESLint 10의 context API 변경(`context.getFilename` 제거)에 대응하지 않아 `pnpm lint`가 어떤 파일에서도 크래시함(TypeError, 규칙 로딩 실패)
- **Fix:** RESEARCH.md가 이미 "유지보수" 대안으로 명시한 `eslint@9.39.5`로 전환(같은 승인 목록 안의 버전 선택, 새 패키지 아님)
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm lint`(=`eslint .`) 정상 종료, 0 에러
- **Committed in:** f243427

**2. [Rule 2 - Missing Critical] eslint.config.mjs에 `.claude/**` 무시 규칙 추가**
- **Found during:** Task 2 (eslint 크래시 해결 뒤 재실행)
- **Issue:** 기본 ignore 목록이 벤더링된 `.claude/gsd-core`·`.claude/skills/gstack`(이 앱 코드 아님)까지 린트해 4천 건 이상의 무관한 에러가 나옴
- **Fix:** `globalIgnores`에 `.claude/**` 추가
- **Files modified:** eslint.config.mjs
- **Verification:** `pnpm lint` 0 에러
- **Committed in:** f243427

**3. [Rule 3 - Blocking] package.json에 `"type": "module"` 추가**
- **Found during:** Task 2 (`scripts/migrate-runner.ts` 최초 실행)
- **Issue:** `db/client.ts`의 Cloud SQL 커넥터 비동기 초기화가 top-level await를 쓰는데, `"type": "module"`이 없어 tsx가 CJS로 트랜스파일 — "Top-level await is currently not supported with the cjs output format"로 즉시 실패
- **Fix:** `package.json`에 `"type": "module"` 추가(tsconfig의 `module: esnext`와 일관)
- **Files modified:** package.json
- **Verification:** `pnpm db:migrate` 정상 종료
- **Committed in:** f243427

**4. [Rule 1 - Bug] next.config.ts에 `allowedDevOrigins` 추가**
- **Found during:** Task 2 (E2E 첫 실행 — 로그인 폼이 네이티브 GET으로 제출됨)
- **Issue:** Next 16 dev 모드가 기본으로 `127.0.0.1`(Playwright의 접속 origin) 발 HMR 자산 요청을 차단해 클라이언트 번들이 하이드레이션되지 않고, 폼 제출이 React 핸들러 대신 브라우저 네이티브 GET으로 대체되어 자격 증명이 URL 쿼리로 노출됨
- **Fix:** `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가
- **Files modified:** next.config.ts
- **Verification:** E2E 3개 통과, URL에 쿼리 파라미터 없음
- **Committed in:** f243427

**5. [Rule 3 - Blocking] test/e2e/global-setup.ts에 라우트 워밍업 추가**
- **Found during:** Task 2 (E2E 반복 실행 중 첫 테스트만 간헐적으로 실패)
- **Issue:** Turbopack이 라우트를 첫 요청 시점에 컴파일하는데, 그 컴파일 지연 중 Fast Refresh 리마운트가 첫 브라우저 테스트의 클라이언트 네비게이션과 겹쳐 로그인 성공 후 `/account`로의 `router.push`가 씹히는 경우가 있었음(재현: 수동 curl은 항상 성공, 두 번째 브라우저 시도는 항상 성공)
- **Fix:** `globalSetup`이 마이그레이션 뒤 `/login`·`/account`·`/api/auth/get-session`을 한 번씩 미리 요청해 컴파일을 끝내 둠(webServer 기동 이후 globalSetup이 실행됨을 실측으로 확인)
- **Files modified:** test/e2e/global-setup.ts
- **Verification:** 동일 스위트 3회 연속 재실행, 3/3 통과
- **Committed in:** f243427

**6. [Rule 1 - Bug] domain/auth/accounts.ts의 internalAdapter.createUser 2-인자 시그니처**
- **Found during:** Task 2 (`node_modules/better-auth` 실제 타입 확인, 플랜의 read_first 지시대로)
- **Issue:** 플랜 스케치는 `createUser(user)` 1-인자였으나 실제 타입은 `createUser(user, source: UserProvisioningSource)` — source가 필수
- **Fix:** better-auth의 admin 플러그인이 관리자 발급 계정에 쓰는 것과 동일한 `{ method: "admin" }`을 두 번째 인자로 전달
- **Files modified:** domain/auth/accounts.ts
- **Verification:** test/integration/auth.test.ts 전체 통과(계정 생성·로그인·거부 케이스 포함)
- **Committed in:** f243427

**7. [Rule 1 - Bug] sliding 쿠키 재발급 테스트 — expiresAt 기준으로 정정**
- **Found during:** Task 3 (`test/integration/auth.test.ts` 최초 실행, 재발급 케이스 실패)
- **Issue:** `sessions.updatedAt`을 2일 전으로 돌려도 재발급이 일어나지 않음 — better-auth 소스 확인 결과 판정식은 `expiresAt - expiresIn + updateAge <= now`로 `updatedAt`을 전혀 쓰지 않음
- **Fix:** 테스트가 `sessions.expiresAt`을 `now + 28일`(30일 만료에서 2일 지난 것과 동일한 효과)로 직접 갱신하도록 수정
- **Files modified:** test/integration/auth.test.ts
- **Verification:** 재발급 있음/없음 두 단언 모두 통과
- **Committed in:** 90cca6c

---

**Total deviations:** 7 auto-fixed (4 Rule 1 - 버그, 1 Rule 2 - 누락된 필수 설정, 2 Rule 3 - 차단 이슈)
**Impact on plan:** 전부 정확성·빌드 가능성에 필수적인 수정이며, 승인된 의존성 목록이나 아키텍처를 벗어나지 않았다. 범위 확장 없음.

## Plan Output 필수 기록 사항 (better-auth 실측)

- **내부 어댑터 메서드 실제 이름:** `ctx.internalAdapter.createUser(user, source)`(2-인자, `source.method`), `ctx.internalAdapter.linkAccount(account)`, `ctx.password.hash(password)` — 전부 존재. `createUser`만 플랜 스케치와 인자 개수가 다름(위 결정 6)
- **`disableSignUp` 존재 여부:** `emailAndPassword.disableSignUp?: boolean`로 실제 타입에 존재. hooks.before APIError 폴백은 불필요했음
- **클라우드 세션 Playwright Chromium 경로:** `/opt/pw-browsers/chromium`(심볼릭 링크 자체가 실행 파일 — `chromium/chrome` 하위 경로가 아니라 `chromium` 자체가 `chrome-linux/chrome`를 가리킴). `playwright.config.ts`는 두 형태(`/opt/pw-browsers/chromium/chrome`, `/opt/pw-browsers/chromium`)를 순서대로 탐색해 이 세션과 `chromium/chrome` 형태의 세션 둘 다 지원한다
- **squawk 바이너리 다운로드:** 성공(`onlyBuiltDependencies`가 postinstall을 허용). `squawk --version` → `2.65.0` 확인, `db/migrations/0000_init.sql` 린트 시 26개 스타일 경고(모두 warning, `IF NOT EXISTS`·`timestamptz`·FK `NOT VALID` 등 — 최초 마이그레이션에서 흔한 패턴). `.squawk.toml`이 아직 없어 `pnpm lint:sql`은 현재 "Configuration error" — **01-04가 `.squawk.toml`을 만드는 것이 이 실패의 해소 조건**(플랜에 이미 명시됨, 결함 아님)
- **@better-auth/drizzle-adapter:** npm 레지스트리에 실제 패키지로 존재(1.7.5) — 플랜이 언급한 "레지스트리에 없으면 built-in 어댑터 사용" 폴백은 필요 없었다

## Issues Encountered

None beyond the deviations documented above — each was found, root-caused, and fixed within the task's own verification loop before proceeding.

## User Setup Required

None - no external service configuration required. 로컬 개발은 `pnpm db:dev && pnpm db:migrate && pnpm dev`로 충분하다.

## Next Phase Readiness

- 이후 플랜(01-02~01-06)이 의존하는 계약 전부 존재: pnpm scripts 19개, `lib/env.ts` 키, `db/schema/index.ts` 배럴, vitest/playwright 러너, `createAccount`/`generateTempPassword`
- `.squawk.toml`은 01-04가 만든다(위 기록 참조) — 그 전까지 `pnpm lint:sql`은 의도적으로 실패 상태
- Task 1에서 승인된 의존성 전체가 설치·고정되어 이후 플랜은 별도 승인 체크포인트 없이 사용 가능
- AUTH-01(잠금)·AUTH-03(비밀번호 변경)·AUTH-04(Google 로그인 어댑터 자리 → 실제 버튼)는 각각 01-02·01-03이 이어받는다 — 이 플랜은 어댑터 자리(`domain/auth/provider.ts`, `socialProviders`)만 놓았다

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*

## Self-Check: PASSED

- All 34 listed created files verified present on disk (`[ -f ]`, 0 missing).
- Both task commits verified in `git log --oneline --all`: `f243427`, `90cca6c`.
- All plan-level `<acceptance_criteria>` for Task 2 and Task 3 re-run and passing (see body above).
- Plan-level `<verification>` re-run: `bash scripts/dev-db.sh && pnpm db:migrate && pnpm test:unit && pnpm test:integration && pnpm playwright test test/e2e/login-logout.spec.ts` — all exit 0; `pnpm build` succeeded with `.next/standalone/server.js` present; `git status --porcelain` shows no `.env.local`.
