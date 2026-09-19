---
phase: 01-deploy-skeleton-login
verified: 2026-09-18T19:09:12Z
status: gaps_found
verdict: PARTIAL
score: 6/7 must-haves verified
covered_files:
  - .github/workflows/account.yml
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/phases/01-deploy-skeleton-login/01-01-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-01-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-02-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-02-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-03-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-03-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-04-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-04-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-05-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-05-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-06-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-06-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-07-DEPLOY-LOG.md
  - .planning/phases/01-deploy-skeleton-login/01-07-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-07-SUMMARY.md
  - .planning/phases/01-deploy-skeleton-login/01-08-DEPLOY-LOG.md
  - .planning/phases/01-deploy-skeleton-login/01-08-PLAN.md
  - .planning/phases/01-deploy-skeleton-login/01-08-SUMMARY.md
  - .squawk.toml
  - CLAUDE.md
  - Dockerfile
  - app/(app)/account/actions.ts
  - app/(app)/account/change-password-form.tsx
  - app/(app)/account/logout-button.tsx
  - app/(app)/account/page.tsx
  - app/(auth)/login/login-form.tsx
  - app/(auth)/login/page.tsx
  - app/admin/system-status/page.tsx
  - app/api/auth/[...all]/route.ts
  - app/api/health/route.ts
  - app/layout.tsx
  - app/page.tsx
  - app/session-refresh.tsx
  - db/client.ts
  - db/migrations/0000_init.sql
  - db/migrations/0001_login_attempts.sql
  - db/migrations/0002_rate_limits_id_column.sql
  - db/migrations/meta/0000_snapshot.json
  - db/migrations/meta/0001_snapshot.json
  - db/migrations/meta/0002_snapshot.json
  - db/migrations/meta/_journal.json
  - db/schema/auth.ts
  - db/schema/index.ts
  - db/schema/login-attempts.ts
  - docs/ARCHITECTURE.md
  - docs/OPERATIONS.md
  - domain/auth/accounts.ts
  - domain/auth/hooks.ts
  - domain/auth/lockout.ts
  - domain/auth/password.ts
  - domain/auth/provider.ts
  - domain/health.ts
  - domain/ops/pool-rule.ts
  - domain/system-status/index.ts
  - domain/viewer.ts
  - eslint.config.mjs
  - eslint/index.mjs
  - eslint/rules/money-boundary.mjs
  - eslint/rules/repository-viewer-param.mjs
  - eslint/rules/require-action-client.mjs
  - infra/ar-cleanup-policy.json
  - infra/monitoring/5xx-ratio.json.tpl
  - infra/monitoring/backup-failed.json.tpl
  - infra/monitoring/tick-stale.json.tpl
  - infra/names.sh
  - lib/actions/client.ts
  - lib/auth-client.ts
  - lib/auth.ts
  - lib/client-ip.ts
  - lib/env.ts
  - lib/gcp/cloud-sql-admin.ts
  - lib/log.ts
  - lib/viewer.ts
  - package.json
  - repositories/health.ts
  - repositories/login-attempts.ts
  - repositories/system-status.ts
  - repositories/users.ts
  - scripts/account-cli.ts
  - scripts/bootstrap-gcp.sh
  - scripts/build-cli.mjs
  - scripts/db-bootstrap.ts
  - scripts/deploy.sh
  - scripts/dev-db.sh
  - scripts/gsd-relativize.sh
  - scripts/install_pkgs.sh
  - scripts/migrate-runner.ts
  - scripts/promote-guard.sh
  - scripts/rollback.sh
  - test/e2e/change-password.spec.ts
  - test/e2e/fixtures.ts
  - test/e2e/global-setup.ts
  - test/e2e/login-logout.spec.ts
  - test/e2e/system-status.spec.ts
  - test/integration/account-cli.test.ts
  - test/integration/auth.test.ts
  - test/integration/db-bootstrap.test.ts
  - test/integration/global-setup.ts
  - test/integration/health.test.ts
  - test/integration/lockout.test.ts
  - test/integration/migrate-runner.test.ts
  - test/integration/rate-limit.test.ts
  - test/integration/setup.ts
  - test/integration/system-status.test.ts
  - test/unit/account-cli.test.ts
  - test/unit/auth-provider.test.ts
  - test/unit/ci-guard.test.ts
  - test/unit/client-ip.test.ts
  - test/unit/db-bootstrap-sql.test.ts
  - test/unit/db-client-close.test.ts
  - test/unit/deploy/bootstrap-sh.test.ts
  - test/unit/deploy/deploy-sh.test.ts
  - test/unit/deploy/promote-guard-sh.test.ts
  - test/unit/deploy/rollback-sh.test.ts
  - test/unit/deploy/workflows.test.ts
  - test/unit/dockerfile.test.ts
  - test/unit/docs-limits.test.ts
  - test/unit/env.test.ts
  - test/unit/eslint-rules/fixtures/domain/money/index.ts
  - test/unit/eslint-rules/fixtures/money-add.ts
  - test/unit/eslint-rules/fixtures/money-compound-assign.ts
  - test/unit/eslint-rules/fixtures/money-unary.ts
  - test/unit/eslint-rules/fixtures/money.ts
  - test/unit/eslint-rules/fixtures/other-brand-arithmetic.ts
  - test/unit/eslint-rules/fixtures/plain-arithmetic.ts
  - test/unit/eslint-rules/fixtures/tsconfig.json
  - test/unit/eslint-rules/money-boundary.test.ts
  - test/unit/eslint-rules/repository-viewer-param.test.ts
  - test/unit/eslint-rules/require-action-client.test.ts
  - test/unit/lockout.test.ts
  - test/unit/log.test.ts
  - test/unit/password.test.ts
  - test/unit/pool-rule.test.ts
  - test/unit/system-status.test.ts
covered_digest: "v1:sha256:6aac3af4bc57a946cb988de862ec4b7733a9614ae3e956da742e78834795f26c"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 18
  total: 18
  not_honored: []
gaps:
  - truth: "SC6 — 배포는 migrate Job 성공 뒤 트래픽 0% 리비전 → 스모크 → 100% 순서로 진행된다 (OPS-01 본문에도 같은 문구)"
    status: partial
    reason: "scripts/deploy.sh main()은 run_migrate → deploy_service(즉시 100%, --to-latest) → ensure_alerts → smoke 순서다. 0% 리비전·태그 URL 스모크·승격 단계는 01-07에서 '[Rule 1 - Bug] 카나리 제거'로 설계에서 삭제됐다(태그 URL이 4회 연속 15분 넘게 라우팅되지 않음, 구글 인프라 내부 원인). 결과: 스모크 실패 리비전이 이미 100%를 서빙하고 자동 롤백은 없다(수동 rollback.sh). 의도된 이탈이지만 ROADMAP SC6·REQUIREMENTS OPS-01 문구와 어긋나고 override·문구 갱신이 없다."
    artifacts:
      - path: "scripts/deploy.sh"
        issue: "deploy_service가 --no-traffic 없이 바로 100% 배포(407~438행), smoke는 그 뒤(613행). 단위 테스트 '기존 서비스에서 health가 503이면 SmokeFailed로 exit 1한다(이미 100%로 배포된 뒤라 롤백은 수동)'가 이 동작을 고정한다"
      - path: "scripts/rollback.sh"
        issue: "머리 주석(4~6행)이 여전히 '스모크에 실패해 0%로 남은 최신 리비전'을 전제로 설명한다 — 코드는 맞지만 주석이 폐기된 설계를 가리킨다(2460b5e 이후의 미커밋 수정본에서도 그대로)"
      - path: ".planning/ROADMAP.md"
        issue: "Phase 1 SC6 문구가 0% → 스모크 → 100%를 요구한다(55행). 실제 파이프라인과 불일치"
      - path: ".planning/REQUIREMENTS.md"
        issue: "OPS-01 본문(128행)이 '확장-축소 마이그레이션 → 0% → 스모크 → 100% 순'을 요구하고 Complete로 표시돼 있다"
    missing:
      - "결정 하나: (a) 카나리 제거를 공식 수용 — 아래 override를 이 파일 frontmatter에 추가하고 ROADMAP SC6·REQUIREMENTS OPS-01 문구를 '즉시 100% + 실제 주소 스모크 + 수동 rollback.sh'로 갱신, 또는 (b) 태그 URL에 의존하지 않는 다른 안전 배포 방식(예: --no-traffic 리비전을 gcloud run services proxy 또는 Job에서 내부 호출로 스모크)을 별도 플랜으로 복구"
      - "scripts/rollback.sh 4~6행 주석을 현재 설계(100% 서빙 중인 실패 리비전 → 직전 리비전)로 정정"
deferred:
  - truth: "SC2/AUTH-02 — '어느 화면에서든 로그아웃할 수 있다': Phase 1 화면 3개 중 /admin/system-status에는 로그아웃 버튼이 없다(LogoutButton은 app/(app)/account/page.tsx에만 있음)"
    addressed_in: "Phase 2"
    evidence: "Phase 2 SC2: '배포된 앱의 로그인·내 계정·앱 셸(내비게이션·레이아웃·빈 상태)이 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓴다 … Phase 1의 임시 화면은 남아 있지 않다' — 공통 내비게이션(로그아웃 포함)은 앱 셸 산출물"
  - truth: "SC2/AUTH-01 — '잠금·해제는 행동 로그에 남고': 현재는 JSON 로그 이벤트(auth.lockout / auth.unlock, lib/log.ts)이며 직원별 행동 로그 표(DB)는 아니다"
    addressed_in: "Phase 3"
    evidence: "REQUIREMENTS OPS-05(Phase 3): '직원 계정별 핵심 행동만 로그로 남긴다: 로그인, …' + ROADMAP Phase 3 본문 '핵심 스키마 규약을 여기서 정한다: 보관함(soft delete), 행동 로그, …'"
  - truth: "SC2 — 잠금 임계 N·15분이 '설정 키'다: 현재는 환경 변수(LOCKOUT_THRESHOLD·LOCKOUT_WINDOW_MINUTES, lib/env.ts)"
    addressed_in: "Phase 3"
    evidence: "ROADMAP Phase 3 SC4: '로그인 잠금 N·15분(Phase 1)도 이 레지스트리의 키다'"
human_verification:
  - test: "프로덕션 URL에서 관리자로 로그인한 뒤 브라우저를 완전히 종료하고 다시 열어 /account에 바로 들어가지는지 (01-07 human-check 5, 01-08-DEPLOY-LOG '5번은 프로브로 못 닫았다')"
    expected: "재로그인 없이 /account가 열리고 이메일이 보인다"
    why_human: "프로브는 로그인 전 /login에서 Set-Cookie를 볼 수 없었고, 실행자 세션은 *.run.app에 닿지 못한다. 근거는 로컬 E2E(login-logout.spec.ts 17행, 30일 쿠키 단언)와 lib/auth.ts expiresIn뿐 — 실제 Cloud Run 도메인에서 쿠키 속성(Secure/SameSite/만료)이 같게 내려오는지는 브라우저로만 확인 가능"
  - test: "프로덕션에서 관리자로 /admin/system-status를 열어 배포 SHA(ed2fbc56)·DB 커넥션 n / 25·마지막 백업 절을 본다 — 2026-09-19 첫 자동 백업(18:00 UTC) 이후 다시 열어 백업이 '성공 + 시각'으로 바뀌는지 (01-08 human-check 3·4)"
    expected: "백업 절이 '확인 불가'(특히 permission 이유)가 아니라 오늘은 '백업 없음 — 첫 자동 백업 전', 내일은 'SUCCESSFUL · <시각>'"
    why_human: "01-08은 3번을 /api/health 프로브로 닫았지만 그것은 상태 화면이 아니다. 런타임 SA에 roles/cloudsql.viewer가 실제 부여됐는지는 '런타임 SA의 역할 목록 확인은 Owner 계정 몫'으로 미확인이고, Cloud SQL Admin API 호출 경로(lib/gcp/cloud-sql-admin.ts)는 프로덕션에서 한 번도 실행·관찰되지 않았다"
  - test: "GCP 콘솔 Monitoring → Alerting에서 [prod] Cloud SQL backup failed 정책의 필터가 첫 백업 이후 로그 탐색기의 실제 cloudsql_database 백업 로그 항목 형태와 맞는지 확인하고, 가능하면 알림 채널 테스트 발송으로 관리자 메일 도착을 확인 (01-08-DEPLOY-LOG '백업 경보 필터·실제 백업 확인')"
    expected: "필터가 실제 로그 항목과 일치하고 테스트 알림 메일이 ALERT_EMAIL로 도착"
    why_human: "정책 존재는 확인됐지만(2026-09-18 실측) 실패 이벤트 없이는 필터 정확성과 메일 전달을 프로그램적으로 검증할 수 없다"
  - test: "Owner 계정으로 조직 정책 원문(iam.allowedPolicyMemberDomains·run.allowedIngress)과 plant8-prod-runtime SA의 역할 목록을 확인 (01-07·01-08 이월)"
    expected: "allUsers 허용·비인증 ingress 허용이 정책 원문으로 확인되고, 런타임 SA에 cloudsql.client·secretAccessor·cloudsql.viewer(또는 backupRuns.list 포함 역할)가 있다"
    why_human: "gha-deployer SA에 orgpolicy.policy.get·resourcemanager.projects.getIamPolicy가 없어 실행자가 조회할 수 없었다(PERMISSION_DENIED). 실효적 차단 없음은 확인됨(allUsers run.invoker 보유, /login 200)"
---

# Phase 1: 배포 스켈레톤·로그인 Verification Report

**Phase Goal:** 관리자(사용자 본인)가 배포 스크립트 한 번으로 회사 GCP 프로젝트에 띄운 서울 리전 Cloud Run 앱에 직원 계정으로 로그인해 비밀번호를 바꾸고 로그아웃한다 — 기능보다 "배포된다"를 먼저 증명한다. 4계층 앱 구조·배포 파이프라인·롤백·경보·3계층 테스트 골격·운영 문서·시스템 상태 화면 뼈대가 이 페이즈의 산출물
**Verified:** 2026-09-18T19:09:12Z (검증 시작 시 HEAD `cda3f73`, 작업 트리 클린 — 보고서 작성 후 HEAD `2460b5e`로 이동하고 `scripts/rollback.sh` 수정이 미커밋 상태로 생김; 부록 A 참조)
**Status:** gaps_found
**Verdict:** **PARTIAL** — 페이즈 목표(배포·로그인·비밀번호 변경·로그아웃)는 실제 회사 GCP 프로덕션에서 달성됐다. 성공 기준 7개 중 6개 검증, SC6의 "0% 리비전 → 스모크 → 100%" 절은 의도적으로 제거돼 미충족이며 공식 수용(override + 문구 갱신) 또는 복구 결정이 필요하다. 다음 페이즈(Phase 2 디자인 시스템)를 막지 않는다.
**Re-verification:** No — initial verification

## 사전 관찰 (판정에 영향 없음, 기록용)

- ROADMAP Phase 1은 `Mode: mvp`인데 Goal이 User Story 형식("As a …, I want to …, so that …")이 아니다(`user-story.validate` → valid:false). 호출자가 표준 goal-backward 검증을 지시했으므로 그대로 진행했다. MVP 모드 User Flow Coverage 표는 Goal 문장의 흐름(배포 → 로그인 → 비밀번호 변경 → 로그아웃)으로 대신했다(아래).
- ROADMAP 진행 표기가 낡았다: "Plans: 6/8 plans executed", 01-07·01-08 체크박스 미체크, Progress 표 "6/8 In Progress". STATE.md는 8/8·verifying. 코드 문제가 아닌 계획 상태 드리프트 — `/gsd-complete-milestone`/roadmap 갱신 시 정정.
- 01-VALIDATION.md는 `status: draft`, `nyquist_compliant: false`로 남아 있다(validate-phase 미실행). 이 검증은 실측으로 대신했다.

## User Flow Coverage (Goal 흐름 기준)

| # | 단계 | 기대 | 근거 | 상태 |
|---|------|------|------|------|
| 1 | 배포 스크립트 한 번으로 회사 GCP 서울 Cloud Run에 앱이 뜬다 | deploy.sh 1회 실행 → 서비스 200 | deploy 워크플로 run #20(스테이징, `5ed3eec`)·#24(프로덕션, `ed2fbc5` 승격) success; 프로덕션 `/api/health` `{"ok":true,"sha":"ed2fbc56…"}`(2026-09-18 실측, 호출자 확인 사실) | ✓ |
| 2 | 직원 계정으로 로그인 | 이메일+비밀번호 → /account | 사용자 브라우저 확인(human-check 1, 2026-09-18); E2E login-logout.spec.ts; 통합 auth.test.ts | ✓ |
| 3 | 비밀번호 변경 | 변경 뒤 옛 비밀번호 거부 | 사용자 브라우저 확인(human-check 2); E2E change-password.spec.ts(임시 배너 → 변경 → 옛 비밀번호 실패 → 7자 거부) | ✓ |
| 4 | 로그아웃 | /login으로, /account 재접근 리다이렉트 | E2E login-logout.spec.ts 46행; `app/(app)/account/logout-button.tsx` → `authClient.signOut()` | ✓ (프로덕션 브라우저 확인은 human-check 1 흐름에 포함) |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 7개 = 계약)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — deploy.sh 한 번으로 Cloud Run(서울)+Cloud SQL(서울 최소 사양, 공인 IP 없음, IAM)+Secret Manager+AR(서울)이 만들어지고 앱이 뜬다; 조직 정책 확인; 시크릿은 환경 변수뿐; SHA 태그 이미지; 더티 트리 거부; 프로젝트·리전 인자 | ✓ VERIFIED | `scripts/deploy.sh` main(): require_clean_tree(`git status --porcelain` → exit 2) → ensure_apis/ar_repo/network/sql_instance(`db-f1-micro`, `--no-assign-ip`, `--backup`, 스토리지 자동 증가 상한) → sql_db_users(IAM SA 사용자) → secrets(APP_DATA_KEY_v1·SMTP 4개·BETTER_AUTH_SECRET, `__unset__` 센티널) → build_and_push_image(`app:<git sha>`) → jobs → db-bootstrap → migrate → service → alerts → smoke. `db/client.ts` `AuthTypes.IAM`+`IpAddressTypes.PRIVATE`. 단위 테스트 실행: "더티 트리에서는 gcloud 호출 전에 exit 2로 거부한다" 1 passed; "--project other-proj --region us-central1이 전 gcloud 자원 호출에 반영" 존재. 실배포: 스테이징 run #20·프로덕션 run #24 success, 두 환경 같은 이미지 `ed2fbc5`. 시크릿 스캔: 프로젝트 코드에 키·비밀번호 리터럴 없음(`.claude/skills/gstack` 패턴 파일만 매치). 조직 정책: 원문 조회는 PERMISSION_DENIED였으나 `allUsers`가 `roles/run.invoker` 보유·`--allow-unauthenticated` 성공·공개 URL `/login` 200으로 실효적 허용 확인(01-07-DEPLOY-LOG 286~292행) — 원문 확인은 Human Verification 4 |
| 2 | SC2 — CLI로 계정 발급, 배포 URL 로그인, 세션 유지, 어디서든 로그아웃; better-auth + DB 저장 rateLimit(XFF); `login_attempts` + before 훅 잠금(15분 창 N=5), 성공 시 초기화, 잠금·해제 로그, 관리자 해제, N·15분 설정 키, 통합 테스트로 증명 | ✓ VERIFIED (3개 절 Phase 2·3 이월 — Deferred 참조) | `scripts/account-cli.ts` create/reset/unlock → `domain/auth/accounts.ts`; `.github/workflows/account.yml`로 스테이징·프로덕션 계정 각 2개 발급(run success). `lib/auth.ts`: `rateLimit.storage:"database"`, `/sign-in/email` window 60·max `RATE_LIMIT_LOGIN_MAX`, `ipAddressHeaders:[x-client-ip]`; `proxy.ts`+`lib/client-ip.ts`가 XFF 마지막 항목만 신뢰. `domain/auth/hooks.ts` before(잠금 판정)/after(기록·초기화·`auth.lockout` 이벤트) → `repositories/login-attempts.ts`(DB). 통합 테스트 열거: lockout A(5회 실패→6회째 거부→창 만료 뒤 성공), B(unlockAccount→즉시 성공, admin_unlock), C, D; rate-limit 3건; auth.test 세션 sliding·resetPassword·unlockAccount. 스테이징 실측(01-07-DEPLOY-LOG 258~277행): XFF 위조에도 6번째 403·11번째 429. E2E: 새 컨텍스트에서 세션 유지 + 쿠키 만료 ≥29일 단언(login-logout.spec.ts 29~41행). 사용자 브라우저 로그인 확인(2026-09-18). 프로덕션 세션 유지는 미확인 → Human Verification 1 |
| 3 | SC3 — 직원이 비밀번호 변경, 관리자 재발급; `AUTH_PROVIDER` 환경 변수로 로그인 방식 선택, Google은 어댑터 자리 | ✓ VERIFIED | `app/(app)/account/actions.ts` changePasswordAction(`authedActionClient.schema(...)`) → `domain/auth/password.ts` validateNewPassword/finalizePasswordChange; `resetPassword`(전 세션 무효·password_is_temporary=true, 통합 테스트 3건). `lib/env.ts` `AUTH_PROVIDER: enum(email|google)` + google 시 client id/secret refine; `domain/auth/provider.ts`; `lib/auth.ts` `socialProviders` 조건부; `app/(auth)/login/page.tsx` `showGoogle={getAuthProvider()==="google"}` → login-form `signIn.social`. 단위 auth-provider.test.ts. E2E change-password.spec.ts 통과(호출자 확인: E2E 6/6) |
| 4 | SC4 — Next.js 단일 앱 + Drizzle 4계층, Hono/REST/raw pg 없음; Server Action은 next-safe-action `authedActionClient`만(버전 고정); CI가 lint(any 금지)·타입체크·Squawk·단위·통합(Postgres 컨테이너)·E2E를 돌리고 실패 시 배포 차단; ESLint import 경계 + 커스텀 규칙 3개 | ✓ VERIFIED | 트리: app/ domain/ repositories/ db/ lib/ 만 존재. grep: `hono`/`express` 0건; `new Pool(` 은 db/client.ts·scripts/db-bootstrap.ts에만; app→`@/repositories|@/db` import 0건; domain/repositories→`@/app` 0건. `lib/actions/client.ts` createSafeActionClient + authedActionClient(getSession → viewer ctx); `package.json` `"next-safe-action": "8.7.3"`(정확 고정). `.github/workflows/ci.yml` quality(lint→typecheck→lint:sql→test:unit) → integration-e2e(postgres:16 서비스, db:migrate→test:integration→playwright); `deploy.yml` staging 잡 `needs: ci`. `eslint.config.mjs`: `no-explicit-any: error`, `boundaries/element-types`, `plant8/require-action-client`·`repository-viewer-param`·`money-boundary` 모두 error; RuleTester 단위 테스트 3개. 실행: `pnpm test:unit` 22 files / 198 passed(exit 0); `pnpm lint:sql` "Found 0 issues in 3 files". ci-guard.test.ts가 drizzle-kit push 부재·단계 순서를 고정 |
| 5 | SC5 — `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md` 존재, 각 ≤300줄, 4계층+단일 지점 셋 다이어그램, 비용 목표·과금 항목·배포/롤백/경보 절차 | ✓ VERIFIED (문서 오기 1건 — Anti-Patterns) | 121줄 / 168줄. ARCHITECTURE.md §2 계층 다이어그램에 `domain/money`·`domain/rules.gate`·`project(viewer, dto)` 명시(19~21행), 린트 표(92~95행). OPERATIONS.md §2 "두 환경 합계 $30 안팎", 과금 항목·첫 청구서 확인 절차(37~41행), §4 배포, §5 롤백, §6 경보 3개 대응 표. `test/unit/docs-limits.test.ts` 300줄 상한·12자리 프로젝트 번호 부재 단언 |
| 6 | SC6 — CI 통과 뒤 migrate Job 먼저(실패 시 중단) → **0% 리비전 → 스모크 → 100%**; drizzle-kit generate SQL만, push 금지; Squawk이 컬럼 drop·잠금 유발 변경 거부; rollback.sh; 16A 커넥션 규칙 검사; 경보 3개가 deploy.sh로 재현 | ✗ FAILED (partial — 1개 절) | 충족: `run_migrate`가 `deploy_service` 앞(main 611~612행), 실패·exit 3 → PoolRuleViolation 중단(단위 테스트 2건); `scripts/migrate-runner.ts`가 `SHOW max_connections` → `checkPoolRule`(단위 13/13 passed, 통합 3건, 실측 25 → 3×5=15 ≤ 20); push 명령 워크플로·스크립트 0건(ci-guard 고정); Squawk CI 단계 + `.squawk.toml`(ban-drop-column 활성); `scripts/rollback.sh` `update-traffic --to-revisions=PREV=100`(단위 "v3는 스모크 실패로 0% 잔존 → v1" 1 passed); `ensure_alerts`가 채널 + 정책 3개 upsert(`policy-from-file`), 프로덕션 정책 3개 실존(호출자 확인). **미충족:** `deploy_service`는 `--no-traffic` 없이 바로 100%(407~438행 주석 "신규·기존 서비스 모두 바로 100% 트래픽으로 배포한다"), `smoke`는 그 뒤(613행). 01-07 key-decisions "[Rule 1 - Bug] 카나리(0% → 태그 URL 스모크 → 100%) 단계를 설계에서 통째로 제거". 단위 테스트가 이 동작을 고정("이미 100%로 배포된 뒤라 롤백은 수동"). ROADMAP SC6·REQUIREMENTS OPS-01 문구 미갱신, override 없음 → Gaps |
| 7 | SC7 — 관리자 시스템 상태 화면 뼈대(배포 버전·DB 커넥션·마지막 백업·한도 배너); 서버 로그 JSON | ✓ VERIFIED | `app/admin/system-status/page.tsx`(세션 없음 → redirect, 비관리자 → notFound) → `domain/system-status/index.ts` getSystemStatus(NotAdminError 이중 방어, `connectionBanner` ratio 0.8) → `repositories/system-status.ts`(`pg_stat_activity`, `show max_connections` 실제 쿼리) + `lib/gcp/cloud-sql-admin.ts`(`backupRuns.list` maxResults 1, 5초 타임아웃, none/unavailable 구분). 데이터 흐름 실제(하드코딩 없음). E2E system-status.spec.ts 2건(직원 404·관리자 3항목), 통합 system-status.test.ts, 단위 system-status.test.ts. 프로덕션 비로그인 307 실측(01-08-DEPLOY-LOG). `lib/log.ts` 한 줄 JSON(severity/message/time/event), 8개 모듈에서 사용, 단위 log.test.ts. 프로덕션에서 관리자 렌더·백업 절은 미관찰 → Human Verification 2 |

**Score:** 6/7 truths verified (0 present-behavior-unverified)

### Plan-level must_haves (ROADMAP SC에 더해진 세부) — 요약

`gsd query verify.artifacts` 8개 플랜: 47/48 artifact pass. 유일한 실패 `docs/OPERATIONS.md` "Missing pattern: erp-prod"는 플랜 작성 시점 이름(erp-)이며 사용자 결정(2026-09-18, 01-06 key-decisions)으로 `plant8-` 접두어로 바뀌었다 — 문서에 `plant8-prod` 존재(11~14행). 낡은 패턴이지 결함이 아님.
`verify.key-links` 29개: 27 verified, 1 pending(01-01 `app/healthz/route.ts` — 구글 예약 경로라 `app/api/health/route.ts`로 이전, `checkHealth` 배선 확인), 1 pattern-miss(01-03 `auth.api.getSession`은 `lib/actions/client.ts`가 아니라 그것이 부르는 `lib/viewer.ts` 25행에 있음 — 간접 배선, WIRED).
01-06 truth "SERVICE_URL은 결정적 형식 하나"는 실측으로 기각되고 `status.url` 정본 + BETTER_AUTH_URL 재배포로 대체됐다(01-07·01-08 DEPLOY-LOG, 단위 테스트 177행). 의도가 "모든 곳이 같은 URL을 쓴다"였으므로 충족으로 본다.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | "어느 화면에서든 로그아웃" — /admin/system-status에 로그아웃 없음 | Phase 2 | Phase 2 SC2 앱 셸(내비게이션·레이아웃), Phase 1 임시 화면 교체 |
| 2 | 잠금·해제 "행동 로그" — 현재 JSON 로그 이벤트, DB 행동 로그 아님 | Phase 3 | OPS-05(Phase 3) 행동 로그 규약 |
| 3 | 잠금 N·15분 "설정 키" — 현재 환경 변수 | Phase 3 | Phase 3 SC4 "로그인 잠금 N·15분(Phase 1)도 이 레지스트리의 키" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/deploy.sh` | 인프라 ensure·이미지·Job·리비전·스모크·경보 | ✓ VERIFIED (설계 이탈 1) | 619줄, 18개 단위 테스트(fakebin gcloud). 0% 카나리 없음(Gaps) |
| `scripts/rollback.sh` | 직전 리비전 트래픽 복구 | ✓ VERIFIED | 커밋본: 6개 단위 테스트. 미커밋 수정본(부록 A): 배포 단위(APP_GIT_SHA) 롤백, 8개 단위 테스트 통과. 머리 주석 낡음(둘 다) |
| `scripts/promote-guard.sh` | 프로덕션 승격 가드(APP_GIT_SHA) | ✓ VERIFIED | 단위 11건 + 실제 GCP 프로브 + run #24 실전 통과 |
| `scripts/migrate-runner.ts` / `domain/ops/pool-rule.ts` | 16A 규칙 | ✓ VERIFIED | 단위 13/13, 통합 3건 |
| `lib/auth.ts` / `domain/auth/*` / `repositories/login-attempts.ts` | better-auth·잠금·속도 제한 | ✓ VERIFIED | 통합 lockout 4·rate-limit 3·auth 10 |
| `lib/actions/client.ts` / `app/(app)/account/actions.ts` | authedActionClient | ✓ VERIFIED | 린트 require-action-client가 강제 |
| `app/admin/system-status/page.tsx` + domain/repositories | 상태 화면 뼈대 | ✓ VERIFIED | 실제 쿼리·API, E2E 2건 |
| `eslint.config.mjs` + `eslint/rules/*.mjs` (3) | 4계층 경계·커스텀 규칙 | ✓ VERIFIED | RuleTester 3개 |
| `.github/workflows/ci.yml` / `deploy.yml` / `account.yml` | CI 3계층·배포·계정 Job | ✓ VERIFIED | 실제 run success(#20·#24·계정 4회) |
| `Dockerfile` | 멀티스테이지, dist/cli, 비루트 | ✓ VERIFIED | `USER app`, `RUN pnpm build && pnpm build:cli` |
| `infra/monitoring/*.tpl` (3) | 경보 3개 | ✓ VERIFIED | tick-stale enabled:false(설계) |
| `docs/ARCHITECTURE.md` / `docs/OPERATIONS.md` | ≤300줄 문서 | ✓ VERIFIED | 121/168줄; §7 Job 이름 오기 |
| `CLAUDE.md` 명령 4자리 | pnpm dev/test/lint/build | ✓ VERIFIED | 10행에 실제 스크립트명, package.json과 일치 |
| `01-07-DEPLOY-LOG.md` / `01-08-DEPLOY-LOG.md` | 실측 기록 | ✓ VERIFIED | 마스킹 준수(docs-limits 유사 규칙), 실패·수정 이력 포함 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| login-form.tsx | /api/auth/[...all] | `authClient.signIn.email` | WIRED | tool verified |
| lib/auth.ts | domain/auth/hooks.ts | `hooks: { before, after }` | WIRED | tool verified |
| hooks.ts | repositories/login-attempts.ts | `countOpenFailures(SYSTEM_VIEWER…)` | WIRED | tool verified |
| proxy.ts | lib/client-ip.ts | x-client-ip 덮어쓰기 | WIRED | tool verified; 통합 fail-closed 테스트 |
| account/actions.ts | lib/actions/client.ts → lib/viewer.ts → auth.api.getSession | authedActionClient | WIRED | 간접(viewer.ts 25행) |
| admin/system-status/page.tsx | domain/system-status → repositories/system-status | getSystemStatus / countConnections | WIRED | tool verified |
| app/api/health/route.ts | domain/health → repositories/health | checkHealth | WIRED | 이전된 경로(01-01 링크는 pending 표시) |
| deploy.yml | ci.yml / scripts/deploy.sh / promote-guard.sh | uses / run | WIRED | tool verified + 실전 run |
| deploy.sh | infra/names.sh / migrate-runner.mjs / monitoring tpl | source / jobs execute / policy-from-file | WIRED | tool verified |
| Dockerfile | scripts/build-cli.mjs | `pnpm build:cli` | WIRED | tool verified |
| CLAUDE.md | package.json | 명령 이름 일치 | WIRED | tool verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| admin/system-status/page.tsx | `status.db.connections/maxConnections` | `pg_stat_activity` / `show max_connections` (repositories) | Yes | ✓ FLOWING |
| admin/system-status/page.tsx | `status.backup` | Cloud SQL Admin `backupRuns.list` | Yes (프로덕션 미관찰) | ✓ FLOWING / human 2 |
| admin/system-status/page.tsx | `status.version.sha` | `env.APP_GIT_SHA` (deploy.sh `--set-env-vars`) | Yes (`ed2fbc56` 실측) | ✓ FLOWING |
| app/api/health/route.ts | `ok` | `SELECT 1` via repositories/health | Yes (프로덕션 200) | ✓ FLOWING |
| account/page.tsx | 이메일·임시 배너 | `requireSession()` → better-auth 세션 | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 단위 전체 1회 | `pnpm test:unit` | 22 files, 198 passed, exit 0 | ✓ PASS |
| 더티 트리 배포 거부 | `vitest run --project unit test/unit/deploy/deploy-sh.test.ts -t "더티 트리"` | 1 passed | ✓ PASS |
| 롤백이 0% 잔존 리비전 건너뜀 | `vitest run … rollback-sh.test.ts -t "v3는 스모크 실패"` | 1 passed (커밋본) | ✓ PASS |
| 롤백 수정본 전체(부록 A) | `vitest run --project unit test/unit/deploy/rollback-sh.test.ts` | 8 passed (8) | ✓ PASS |
| 16A 커넥션 규칙 경계값 | `vitest run --project unit test/unit/pool-rule.test.ts` | 13 passed | ✓ PASS |
| Squawk 실제 마이그레이션 린트 | `pnpm lint:sql` | Found 0 issues in 3 files | ✓ PASS |
| 통합·E2E | (호출자 확인 사실) 통합 27·E2E 6 통과, lint·typecheck 클린, build 성공 | — | ✓ (인용) |
| 테스트 존재 열거 | `vitest list --project integration`, `playwright test --list` | 통합 27건·E2E 6건 열거됨 | ✓ |
| 프로덕션 헬스 | (호출자 확인 사실) `/api/health` → `{"ok":true,"sha":"ed2fbc56…"}` | — | ✓ (인용) |

### Probe Execution

`scripts/*/tests/probe-*.sh` 규약 프로브 없음. 페이즈 프로브는 일회용 GitHub Actions 워크플로(`probe.yml`·`guard-probe.yml`·`prod-verify.yml`, 실행 후 삭제)였고 결과는 DEPLOY-LOG에 마스킹 기록. 실행자 세션은 `*.run.app`에 닿지 못해(에그레스 403) 이 검증에서 재실행 불가 — 호출자가 확인한 2026-09-18 실측을 인용.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence / REQUIREMENTS.md 표기 |
|-------------|----------------|-------------|--------|--------------------------------|
| AUTH-01 | 01-02, 01-07 | 계정 발급·로그인·N회 잠금·IP 제한·잠금 로그·관리자 해제 | ✓ SATISFIED (행동 로그는 JSON 이벤트, DB 표는 Phase 3) | Complete ✓ |
| AUTH-02 | 01-01 | 세션 유지·어디서든 로그아웃 | ✓ SATISFIED (관리자 상태 화면 로그아웃 버튼은 Phase 2 앱 셸) | Complete ✓ |
| AUTH-03 | 01-02, 01-03 | 비밀번호 변경·관리자 재발급 | ✓ SATISFIED | Complete ✓ |
| AUTH-04 | 01-03 | 환경 변수 로그인 방식, Google 구조 불변 | ✓ SATISFIED | Complete ✓ |
| OPS-01 | 01-05, 01-06, 01-07, 01-08 | 스크립트 1회 기동·커넥터+IAM·16A 검사·**0%→스모크→100%** | ⚠ PARTIAL — 0% 카나리 절 미구현 | Complete 표기이나 본문 문구와 불일치 → 문구 갱신 또는 override 필요 |
| OPS-02 | 01-05, 01-06, 01-08 | 스케일-투-제로·월 비용 목표 문서화 | ✓ SATISFIED (`--min-instances=0`, OPERATIONS §2 $30) | Complete ✓ |
| OPS-04 | 01-01, 01-04 | 린트·타입체크·통합 테스트 CI, import 경계·액션 zod 린트 | ✓ SATISFIED (핵심 흐름은 로그인까지; 지출결의→결재→손익은 이후 페이즈가 덧붙임 — ROADMAP SC4 명시) | Complete ✓ |
| OPS-06 | 01-03, 01-07 | 관리자 시스템 상태 화면·JSON 로그 | ✓ SATISFIED — Phase 1 범위(배포 버전·DB 커넥션·마지막 백업·배너·JSON 로그) | **Pending / 미체크 — 불일치.** 01-07 SUMMARY `requirements-completed: [OPS-01, OPS-06]`인데 표가 갱신되지 않음(01-03 SUMMARY는 플랜이 선언한 OPS-06을 completed에서 누락). 알림 tick·이전 실행·계산 불가 건수는 ROADMAP SC7이 Phase 7/8/9 추가로 명시 → Phase 1 담당분은 Complete로 표기해야 함 |
| OPS-07 | 01-04, 01-08 | ARCHITECTURE.md·OPERATIONS.md ≤300줄, 페이즈마다 갱신 | ✓ SATISFIED | **Pending / 미체크 — 불일치.** 01-04·01-08 SUMMARY 모두 completed 선언. Complete로 표기해야 함 |
| (orphan 확인) | — | REQUIREMENTS.md에서 Phase 1로 매핑된 ID 중 어떤 플랜도 선언하지 않은 것 | 없음 | 9개 전부 플랜 frontmatter에 등장 |

### Decision Coverage

`check.decision-coverage-verify`: CONTEXT.md 결정 18/18 honored, not_honored 없음.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| test/integration/lockout.test.ts | AUTH-01 | 4 | 0 | No | Behavioral(5회→거부→창 만료→성공, admin_unlock) | OK |
| test/integration/rate-limit.test.ts | AUTH-01 | 3 | 0 | No | Status+Behavioral(429, fail-closed 500) | OK |
| test/integration/auth.test.ts | AUTH-01/02/03 | 10 | 0 | No | Behavioral | OK |
| test/e2e/login-logout.spec.ts | AUTH-02 | 3 | 0 | No | Behavioral(새 컨텍스트, 쿠키 만료 값) | OK |
| test/e2e/change-password.spec.ts | AUTH-03 | 1 | 0 | No | Behavioral(9단계) | OK |
| test/e2e/system-status.spec.ts | OPS-06 | 2 | 0 | No | Behavioral(404, 3항목 렌더) | OK |
| test/unit/deploy/*.test.ts | OPS-01 | 18+6+11+… | 0 | No(fakebin gcloud) | Value(호출 순서·인자·exit 코드) | OK — 실제 gcloud 동작은 실배포 run이 보완 |
| test/unit/ci-guard.test.ts, docs-limits.test.ts | OPS-04/07 | 5+7 | 0 | No | Value(텍스트 단언) | OK(메타 테스트) |
| test/unit/eslint-rules/*.test.ts | OPS-04 | 3 파일 | 0 | No | Value(RuleTester valid/invalid) | OK — `vitest list`가 "No test suite found"를 내지만 `vitest run`에서는 정상 실행(RuleTester가 describe/it을 런타임 주입) |

**Disabled tests on requirements:** 0. **Circular patterns:** 0. **Insufficient assertions:** 0.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (소스 전체) | — | TBD/FIXME/XXX/TODO/HACK/placeholder | 없음 | — |
| scripts/rollback.sh | 4~6 | 폐기된 카나리 설계를 설명하는 주석("0%로 남은 최신 리비전") | ⚠ Warning | 운영자 오해 — 코드 동작은 맞음 |
| docs/OPERATIONS.md | 126 | Job 이름 `erp-{env}-account` — 실제는 `plant8-{env}-account`(infra/names.sh 31행) | ⚠ Warning | 런북 따라 하면 잘못된 Job 이름. OPS-07 "페이즈마다 갱신"에서 정정 |
| .squawk.toml | excluded_rules | `adding-required-field`(잠금 유발 규칙) 등 4개 제외 — 근거 주석 있음, WINDOWS.md 기록 | ℹ Info | SC6 "잠금 유발 변경 거부"가 부분 약화. 컬럼 drop 규칙은 활성 |
| infra/monitoring/tick-stale.json.tpl | — | "24시간"이 아니라 23h30m·enabled:false | ℹ Info | Cloud Monitoring 조건 상한(실측), Phase 7이 켠다 — 문서화됨 |
| Dockerfile | 33 | `ENV BETTER_AUTH_SECRET`·`BETTER_AUTH_URL` 더미값 — docker `SecretsUsedInArgOrEnv` 경고 | ℹ Info | 실제 값은 런타임 주입. ARG로 옮기는 후속 후보(01-08 이월) |
| scripts/db-bootstrap.ts | createAdminPool | 커넥터 미종료, `process.exit()`로 가려짐 | ℹ Info | 01-07·01-08 이월 항목 |

### Human Verification Required

1. **프로덕션 세션 유지(브라우저 종료 후 재진입)** — frontmatter human_verification 1
2. **프로덕션 /admin/system-status 관리자 렌더 + 첫 백업 이후 백업 절** — human_verification 2 (01-08 human-check 3·4)
3. **백업 실패 경보 필터·메일 전달** — human_verification 3
4. **조직 정책 원문·런타임 SA 역할(Owner 계정)** — human_verification 4

정리 항목(검증 대상 아님, 01-08 이월): orphan 결과 브랜치 4개 삭제(`probe-result`, `probe-result2`, `guard-probe-result`, `prod-verify-result`), 스테이징 태그 전용 트래픽 항목 4개 정리, 첫 청구서 확인(OPERATIONS §2 절차).

### Gaps Summary

**페이즈 목표는 달성됐다.** 두 환경이 같은 이미지 `ed2fbc5`로 서빙 중이고, 사용자가 브라우저에서 로그인·임시 비밀번호 배너·비밀번호 변경을 확인했으며, 4계층·린트·CI 3계층·롤백·경보·문서·상태 화면 뼈대가 코드와 테스트로 존재한다.

**미충족 1건(SC6, OPS-01 본문):** "0% 리비전 → 스모크 → 100%" 안전 배포 순서가 없다. 01-07이 실측 근거(태그 URL 라우팅 4회 실패)로 카나리를 제거하고 "즉시 100% → 실제 주소 스모크 → 실패 시 수동 rollback.sh"로 바꿨다. 실제 영향: 스모크에 실패하는 리비전이 스모크 시간 동안 100% 트래픽을 받고, 자동 롤백이 없다(deploy.sh는 exit 1로 알리기만 한다). 이는 결함이라기보다 **문서화되지 않은 계약 변경**이다 — ROADMAP SC6·REQUIREMENTS OPS-01 문구가 여전히 카나리를 요구하고 OPS-01은 Complete로 표시돼 있다.

**이것은 의도된 이탈로 보인다.** 수용하려면 이 파일 frontmatter에 다음을 추가하고 ROADMAP SC6·REQUIREMENTS OPS-01 문구를 갱신한 뒤 재검증한다:

```yaml
overrides:
  - must_have: "트래픽 0% 리비전 → 스모크 → 100% 순서로 진행된다"
    reason: "Cloud Run 태그 전용 URL이 회사 GCP에서 15분 넘게 라우팅되지 않아(4회 실측, 01-07-DEPLOY-LOG) 카나리를 제거. 즉시 100% + 실제 주소 스모크 + 수동 rollback.sh로 대체. 자동 롤백 부재는 OPERATIONS.md §4·§5에 기록"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

또는 태그 URL에 의존하지 않는 안전 배포(예: `--no-traffic` 리비전을 내부 경로로 스모크)를 별도 플랜으로 복구한다.

**요구사항 표 불일치 2건:** OPS-06·OPS-07은 Phase 1 담당분이 충족됐는데 REQUIREMENTS.md에서 Pending/미체크다(shared-ID gate가 01-03 SUMMARY의 `requirements-completed` 누락으로 닫히지 않은 것으로 보임). Complete로 갱신해야 한다. OPS-01은 반대로 Complete인데 본문 문구 하나가 미충족이다.

**다음 페이즈 영향:** Phase 2(디자인 시스템·앱 셸)는 배포 파이프라인·로그인 흐름에만 의존하며 둘 다 동작한다. 위 gap은 Phase 2 착수를 막지 않는다. 다만 override/문구 갱신 결정과 human_verification 1~4는 이 페이즈 완료 처리(`/gsd-complete-milestone` 전) 안에서 닫는 것을 권한다 — 특히 2번(백업 절)은 2026-09-19 첫 백업 이후에만 가능하다.

## 부록 A — 보고서 전달 직후 디스크에서 관찰된 변경 (검증 판정에 영향 없음)

검증 결과를 전달한 뒤 작업 트리가 바뀌었다(검증자는 소스를 수정하지 않았다):

- HEAD `cda3f73` → `2460b5e` "docs(01): add the Phase 1 code review gate output" (문서 커밋).
- 미커밋 수정 3개: `scripts/rollback.sh`(+26/−1), `test/unit/deploy/fakebin/gcloud`(+16/−2), `test/unit/deploy/rollback-sh.test.ts`(+37/−1).
- 내용: 롤백 단위를 "직전 리비전"에서 "직전 **배포**(리비전의 `APP_GIT_SHA`)"로 바꿨다. 근거 주석(69~74행): deploy.sh가 계산 URL로 먼저 배포한 뒤 `status.url`로 BETTER_AUTH_URL을 고쳐 재배포하므로 배포 하나가 리비전 둘(00001→00002)을 만들고, 직전 리비전으로 되돌리면 Origin 검사에 걸려 로그인이 막히는 리비전에 착륙한다는 01-07·01-08 실측. 같은 SHA 리비전은 건너뛰고, 없으면 "no previous deployment"로 exit 1.
- 재실행: `vitest run --project unit test/unit/deploy/rollback-sh.test.ts` → 8 passed (새 케이스 "같은 배포가 만든 중간 리비전을 건너뛰고 이전 배포로 되돌린다", "이전 배포가 없으면(전부 같은 SHA) 거부한다" 포함). fakebin gcloud가 `run revisions describe --format=json`을 지원하도록 확장됨.
- 판정 영향: SC6 rollback.sh 절은 커밋본·수정본 모두 VERIFIED. 이 수정은 위 Gaps의 "자동 롤백 없음"을 바꾸지 않으며, 수동 롤백을 더 안전하게 만든다. 머리 주석(4~6행)의 폐기된 카나리 설명은 수정본에서도 남아 있다.
- 남은 일: 이 수정을 커밋하고(한 커밋 한 의도), `docs/OPERATIONS.md` §5 롤백 절의 "직전 리비전" 문구를 "직전 배포(APP_GIT_SHA)"로 맞추는지 확인. covered_digest는 수정본 기준으로 재계산했다.

---

_Verified: 2026-09-18T19:09:12Z_
_Verifier: Claude (gsd-verifier)_
