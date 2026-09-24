---
phase: 01-deploy-skeleton-login
verified: 2026-09-24T09:35:01Z
status: human_needed
verdict: PASS (코드 + 2d7f73e 로컬 전체 게이트) — 사람 확인 3건 남음
score: 7/7 must-haves verified
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
  - .planning/phases/01-deploy-skeleton-login/01-UAT.md
  - .squawk.toml
  - CLAUDE.md
  - Dockerfile
  - app/(app)/account/actions.ts
  - app/(app)/account/change-password-form.tsx
  - app/(app)/account/logout-button.tsx
  - app/(app)/account/page.tsx
  - app/(app)/admin/system-status/page.tsx
  - app/(app)/layout.tsx
  - app/(app)/page.tsx
  - app/(auth)/login/login-form.tsx
  - app/(auth)/login/page.tsx
  - app/api/auth/[...all]/route.ts
  - app/api/health/route.ts
  - app/layout.tsx
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
  - domain/auth/locked-message.ts
  - domain/auth/lockout.ts
  - domain/auth/password.ts
  - domain/auth/provider.ts
  - domain/health.ts
  - domain/ops/pool-rule.ts
  - domain/settings/keys.ts
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
  - proxy.ts
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
  - test/e2e/logout-failure.spec.ts
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
  - ui/logout/use-logout.ts
  - ui/shell/MoreSheet.tsx
  - ui/shell/TopBar.tsx
  - ui/shell/role-menu.ts
covered_digest: "v1:sha256:b35f6cde93a69758b3e72d43dde909474e6db975d88817d9d54811b342a17a02"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_verified: 2026-09-19T03:31:45Z
  previous_score: 7/7
  trigger: "verification status = stale — 이전 covered_files 중 약 60개가 2026-09-19T03:31:45Z 이후 바뀌었고(d5e110e → 3c1b015, 커밋 233개), 2개는 경로가 사라졌다"
  what_changed:
    - "경로 이동(Phase 2): app/page.tsx → app/(app)/page.tsx(「내 차례」 홈), app/admin/system-status/page.tsx → app/(app)/admin/system-status/page.tsx. 앱 셸 app/(app)/layout.tsx가 (app) 그룹 전체를 requireSession()으로 감싼다"
    - "관리자 불리언 제거(Phase 3, D-36): Viewer = { id, roleId }, 모든 권한 판정이 can(viewer, menu, action)으로 이동 — domain/auth/accounts.ts·password.ts·system-status, lib/viewer.ts(roleId 없거나 archivedAt 있으면 세션 null, fail-closed), account-cli --admin → --role(기본 DEFAULT_ROLE_ID, 알 수 없는 계급 거부), account.yml admin 입력 → role 입력"
    - "잠금 N·창(분)이 환경 변수 → 설정 레지스트리 키 auth.lockout.threshold·auth.lockout.window_minutes(Phase 3, 03-04). 레지스트리 읽기 실패는 전파(fail-open 없음)"
    - "로그인 before 훅에 보관 사용자 거부 추가(03-07, 동일 응답·더미 해시), after 훅에 성공 로그인 행동 로그 recordAction(login) 추가"
    - "deploy.sh: 서비스 배포 전 seed Job 실행(run_seed, 실패 시 중단) 추가, app-data-key-v1 길이 48→32. 순서: … run_migrate → run_seed → deploy_service → ensure_alerts → smoke"
    - "rollback.sh 머리 주석을 자동 롤백 설계로 정정(이전 보고서 Warning 해소). 동작 변경 없음"
    - "ci.yml·deploy.yml: paths-ignore → paths 재포함 목록(단위 테스트가 읽는 docs 5개는 CI·배포 대상). workflows.test.ts가 두 목록 일치를 고정"
    - "authedActionClient: handleServerError 분리(UserFacingError 화이트리스트, 원시 오류 차단) + 요청 본문 크기 한도 미들웨어(04-04)"
    - "ESLint: ui 계층 추가(ui→ui·lib만), plant8/no-row-type-escape 규칙 추가. 기존 경계·규칙 3개는 약화 없음"
    - "docs/ARCHITECTURE.md 121→237줄, docs/OPERATIONS.md 168→248줄(둘 다 ≤300). OPERATIONS §7 Job 이름 오기(erp-) 정정됨"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  follow_up_2d7f73e:
    - "2026-09-24 재확인: 70e3449..2d7f73e(/design-review·/qa 수정)가 covered 파일 2개를 바꿨다. app/(app)/account/page.tsx — LogoutButton을 div.accountActions로 감쌌을 뿐(렌더·배선 불변). ui/shell/TopBar.tsx — 워드마크를 next/link href=\"/\"(aria-label 「PLANT8 내 차례」)로 감쌌을 뿐, useLogout(116행)·logout 호출(183행) 불변. Phase 1 truth·artifact 영향 없음"
  deferred_closed:
    - "SC2/AUTH-02 어느 화면에서든 로그아웃 — Phase 2 앱 셸이 (app) 그룹 모든 화면에 사용자 메뉴(상단 바)·「더보기」 시트의 「로그아웃」을 넣었다(ui/shell/role-menu.ts buildAccountGroup 157행, TopBar.tsx·MoreSheet.tsx → ui/logout/use-logout.ts → authClient.signOut)"
    - "SC2 잠금 N·15분 설정 키 — domain/settings/keys.ts 14~32행 AUTH_LOCKOUT_THRESHOLD·AUTH_LOCKOUT_WINDOW_MINUTES, domain/auth/lockout.ts lockoutConfig()가 레지스트리를 읽는다"
gaps: []
deferred:
  - truth: "SC2/AUTH-01 — '잠금·해제는 행동 로그에 남고': 지금도 JSON 로그 이벤트(auth.lockout — domain/auth/hooks.ts 116행, auth.unlock — domain/auth/accounts.ts 105행)뿐이고 행동 로그 표(action_log)에는 남지 않는다"
    addressed_in: "Phase 7 (재배정 필요 — 사람 판단)"
    evidence: "이전 보고서는 Phase 3(OPS-05)으로 이월했으나 Phase 3은 2026-09-22 passed로 끝났고 CORE_ACTION_TYPES(domain/action-log/record.ts 10행~)에 잠금·해제 종류가 없다. OPS-05·Phase 3 SC6의 열거('로그인·설정 변경·권한 변경·삭제·복원')에도 잠금·해제는 없다. 남은 후보는 Phase 7 SC5 '행동 로그를 그때까지 생긴 전 메뉴·동작·내보내기 대상으로 검수'뿐 — 명시적 일치가 아니므로 human_verification 3에서 결정을 요청한다"
human_verification:
  - test: "프로덕션 URL에서 관리자로 로그인한 뒤 브라우저를 완전히 종료하고 다시 열어 /account에 바로 들어가지는지 (01-07 human-check 5)"
    expected: "재로그인 없이 /account가 열리고 이메일이 보인다"
    why_human: "실행자 세션은 *.run.app에 닿지 못한다"
    status: resolved
    resolution: "2026-09-22 01-UAT 5 pass — 프로덕션 sign-in Set-Cookie `__Secure-erp.session_token; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`, 쿠키만으로 새 클라이언트 GET /account 200. HTTP 수준 실측(Node fetch, TLS 검증 유지)"
  - test: "프로덕션에서 관리자로 /admin/system-status를 열어 배포 SHA·DB 커넥션 n / 25·마지막 백업 절을 본다 (01-08 human-check 3·4)"
    expected: "백업 절이 '확인 불가'가 아니라 'SUCCESSFUL · <시각>'"
    why_human: "런타임 SA의 cloudsql.viewer와 Cloud SQL Admin 호출 경로는 프로덕션에서만 관찰 가능"
    status: resolved
    resolution: "2026-09-22 01-UAT 6 pass — 프로덕션 /admin/system-status 200: SHA ed2fbc56 · DB 커넥션 2 / 25 · 마지막 백업 SUCCESSFUL · 2026-09-21T19:04:34.964Z. cloudsql.viewer·Cloud SQL Admin 호출 경로가 프로덕션에서 동작함을 처음 관찰"
  - test: "GCP 콘솔 Monitoring → Alerting에서 [prod] Cloud SQL backup failed 정책의 필터가 로그 탐색기의 실제 cloudsql_database 백업 로그 항목 형태와 맞는지 확인하고, 알림 채널 「테스트 알림 보내기」로 관리자 메일 도착을 확인 (01-08-DEPLOY-LOG '백업 경보 필터·실제 백업 확인', 01-UAT 7)"
    expected: "필터가 실제 로그 항목과 일치하고 테스트 알림 메일이 ALERT_EMAIL로 도착"
    why_human: "정책 존재는 확인됐지만(2026-09-18 실측) 실패 이벤트 없이는 필터 정확성과 메일 전달을 프로그램적으로 검증할 수 없다"
    status: open
    owner: "사용자"
  - test: "Owner 계정으로 조직 정책 원문(iam.allowedPolicyMemberDomains·run.allowedIngress)과 plant8-prod-runtime SA의 역할 목록을 확인 (01-07·01-08 이월)"
    expected: "allUsers 허용·비인증 ingress 허용이 정책 원문으로 확인되고, 런타임 SA에 cloudsql.client·secretAccessor·cloudsql.viewer가 있다"
    why_human: "gha-deployer SA에 조회 권한이 없었다"
    status: resolved
    resolution: "2026-09-22 01-UAT 8 pass — verify.yml(policies) run #1(WIF, 읽기 전용 역할)로 조직 정책 4개 실효값 allowAll, 런타임 SA 역할 5종 확인"
  - test: "현재 main(3c1b015)이 스테이징에 배포됐는지 GitHub Actions deploy 실행 기록에서 확인하고, 스테이징 URL에서 로그인 → /account → 비밀번호 변경 → 로그아웃을 한 번 돈다. 프로덕션을 승격했다면 같은 흐름을 프로덕션에서도"
    expected: "deploy 실행 success(seed 단계 포함), 스테이징 /login 200·로그인 성공·/account 이메일 표시·로그아웃 뒤 /login"
    why_human: "Phase 1 이후 인증 경로(계급 필수 세션·설정 레지스트리 잠금·보관 사용자 거부)와 deploy.sh(seed Job)가 바뀌었다. 코드상 배포·인증 파일은 스테이징 실측이 있던 6ad58fd(2026-09-22, deploy run #38, Phase 3 검증 보고서 인용) 이후 바뀌지 않았지만(git diff --stat 6ad58fd HEAD 0건) HEAD 자체의 배포는 이 컨테이너에서 볼 수 없다 — gh CLI 없음, *.run.app 403. 프로덕션은 2026-09-22 기준 여전히 ed2fbc56(01-UAT 6)으로 Phase 1 시점 코드다"
    status: open
  - test: "SC2 '잠금·해제는 행동 로그에 남는다'의 처리를 결정한다: (a) auth.lockout·auth.unlock을 action_log 핵심 종류로 추가하는 작업을 Phase 7(또는 quick)에 명시 배정, 또는 (b) Phase 1의 '행동 로그 이벤트 = 구조화 JSON 로그' 해석을 override로 공식 수용"
    expected: "ROADMAP/계획 중 한 곳에 명시 배정되거나, 이 파일 frontmatter에 overrides 항목이 생긴다"
    why_human: "이월 대상이던 Phase 3이 이 항목 없이 passed로 닫혔다. 잠금 이벤트는 인증된 행위자가 없어(시도자는 미인증) recordAction(actor, …) 계약과 맞지 않는 설계 문제가 있어 검증자가 정할 수 없다"
    status: open
---

# Phase 1: 배포 스켈레톤·로그인 재검증 보고서

**Phase Goal:** 관리자(사용자 본인)가 배포 스크립트 한 번으로 회사 GCP 프로젝트에 띄운 서울 리전 Cloud Run 앱에 직원 계정으로 로그인해 비밀번호를 바꾸고 로그아웃한다 — 기능보다 "배포된다"를 먼저 증명한다. 4계층 앱 구조·배포 파이프라인·롤백·경보·3계층 테스트 골격·운영 문서·시스템 상태 화면 뼈대가 이 페이즈의 산출물
**Verified:** 2026-09-24T09:35:01Z (HEAD `2d7f73e`, 브랜치 `claude/project-thread-pajnzt`; 처음 재검증 2026-09-24T07:52:40Z는 `3c1b015` 기준)
**Status:** human_needed
**Verdict:** 코드와 로컬 전체 게이트(lint·typecheck·lint:sql·단위·통합·E2E `CI=true`, 전부 exit 0) 기준 성공 기준 7/7 충족, 회귀 없음. 사람 확인 3건이 열려 있다(백업 경보 필터·메일 = 사용자 몫, 현재 main 배포 실측, SC2 행동 로그 이월 재배정 결정).
**Re-verification:** Yes — 이전 판정 `passed`(2026-09-19T03:31:45Z)가 stale이 되어 현재 작업 트리로 전부 다시 도출했다. 이전 보고서의 주장은 그대로 쓰지 않았다

## 재검증 방법

- 기준선 `d5e110e`(이전 검증 직전 커밋) → `3c1b015`의 `git diff`를 Phase 1 관련 파일마다 읽어 계약이 약해졌는지 확인했다(인증·잠금·액션 클라이언트·viewer·deploy/rollback·워크플로·ESLint·테스트 단언).
- 단위 테스트는 Phase 1 표면만 골라 직접 실행했다. 통합·E2E·빌드는 오케스트레이터가 같은 컨테이너에서 돌린 전체 게이트 결과를 인용한다(아래 「로컬 게이트」).
- `verify.artifacts`·`verify.key-links`를 플랜 8개에 다시 돌렸다.

## User Flow Coverage (Goal 흐름 기준)

| # | 단계 | 기대 | 근거(현재 코드) | 상태 |
|---|------|------|------|------|
| 1 | 배포 스크립트 한 번으로 서울 Cloud Run에 앱이 뜬다 | deploy.sh 1회 → 서비스 200 | `scripts/deploy.sh` main() 653행~: … run_migrate(667) → run_seed → deploy_service(669) → ensure_alerts → smoke. 배포 관련 파일은 2026-09-22 스테이징 deploy run #38(SHA `6ad58fd`, db-bootstrap·migrate·seed 모두 성공, / 307 · /login 200 · /api/health 200 — 03-VERIFICATION.md 인용) 이후 변경 0건 | ✓ (HEAD 배포는 human 5) |
| 2 | 직원 계정으로 로그인 | 이메일+비밀번호 → /account | login-form → `/api/auth/[...all]` → better-auth + hooks; `account-cli create`가 기본 계급을 붙이므로 `lib/viewer.ts`의 계급 필수 게이트를 통과한다; E2E login-logout.spec.ts 6행 | ✓ |
| 3 | 비밀번호 변경 | 변경 뒤 옛 비밀번호 거부 | `app/(app)/account/actions.ts` changePasswordAction(authedActionClient) → domain/auth/password.ts; E2E change-password.spec.ts 9단계(단언 변경 없음) | ✓ |
| 4 | 로그아웃 | /login으로, 재접근 리다이렉트 | /account 버튼 + 앱 셸 사용자 메뉴·「더보기」 시트, 셋 다 `ui/logout/use-logout.ts` → `authClient.signOut()` → `/login`; E2E login-logout.spec.ts 47행, logout-failure.spec.ts 4건 | ✓ |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 7개 = 계약)

| # | Truth | Status | Evidence (현재 코드) |
|---|-------|--------|----------|
| 1 | SC1 — deploy.sh 한 번으로 Cloud Run(서울)+Cloud SQL(서울 최소 사양, 공인 IP 없음, IAM)+Secret Manager+AR(서울); 조직 정책 확인; 시크릿은 환경 변수뿐; SHA 태그; 더티 트리 거부; 프로젝트·리전 인자 | ✓ VERIFIED | `infra/names.sh` 16행 `DB_TIER=db-f1-micro`; deploy.sh 197행 `--tier`, 201행 `--no-assign-ip`, 120행 `require_clean_tree`; 시크릿 `_ensure_secret`(app-data-key-v1 32바이트로 변경 — 03 검증에서 staging·prod 32바이트 실측). 단위: deploy-sh.test.ts 269행 "더티 트리 … exit 2", 366행 "--project other-proj --region us-central1 … 반영" 통과. 시크릿 패턴 git grep(AWS·GCP API 키·개인 키·GitHub 토큰) 0건. 조직 정책은 01-UAT 8로 원문 확인(resolved) |
| 2 | SC2 — CLI 계정 발급·배포 URL 로그인·세션 유지·어디서든 로그아웃; better-auth rateLimit(DB·XFF); login_attempts + before 훅 잠금(15분 창 N=5), 성공 시 초기화, 잠금·해제 로그, 관리자 해제, N·15분 설정 키, 통합 테스트 | ✓ VERIFIED (1개 절 이월 재배정 필요 — human 6) | `lib/auth.ts` 59~68행 `rateLimit.storage:"database"`, `/sign-in/email` window 60, 55행 `ipAddressHeaders:[x-client-ip]`, `proxy.ts`·`lib/client-ip.ts` 변경 없음. 세션 30일·1일 sliding(24~25행). `domain/auth/hooks.ts` before: 보관 사용자 거부 → `lockoutConfig()`(설정 레지스트리) → `countOpenFailures` → 403; after: 성공 시 `resolveOpenFailures(success)`, 임계 도달 시 `auth.lockout`. `unlockAccount` → admin_unlock + `auth.unlock`. **설정 키 절 해소:** `domain/settings/keys.ts` 14·24행. **어디서든 로그아웃 절 해소:** 앱 셸(`app/(app)/layout.tsx` → Shell, `role-menu.ts` 157행). 통합 lockout.test.ts A~D·rate-limit.test.ts 3건 존재, 단언 불변(픽스처가 isAdmin → roleId로만 바뀜). 단위 lockout.test.ts 통과. 남은 절: 잠금·해제가 action_log에 없다 → Deferred |
| 3 | SC3 — 비밀번호 변경·관리자 재발급; `AUTH_PROVIDER`로 로그인 방식 선택, Google 어댑터 자리 | ✓ VERIFIED | actions.ts `authedActionClient.schema(...)`, 틀린 현재 비밀번호 → `UserFacingError`(화면까지 전달); `resetPassword` 권한 게이트가 `can(viewer,"admin.people","write")`로 바뀌었고 CLI는 SYSTEM_VIEWER(roleId=SYSADMIN)라 통과. `app/(auth)/login/page.tsx` `showGoogle={getAuthProvider()==="google"}` 유지(AuthFrame으로 감쌌을 뿐). 단위 auth-provider.test.ts·password.test.ts 통과 |
| 4 | SC4 — Next.js 단일 앱 + Drizzle 4계층, Hono/REST/raw pg 없음; next-safe-action `authedActionClient`만(버전 고정); CI 3계층·실패 시 배포 차단; ESLint 경계 + 커스텀 규칙 3개 | ✓ VERIFIED | 최상위: app/ db/ domain/ lib/ repositories/ ui/(표현 계층, Phase 2) 등. app·ui → `@/repositories`·`@/db` import 0건; domain·repositories → `@/app` 0건; hono/express import 0건; `new Pool(`은 db/client.ts·scripts/db-bootstrap.ts뿐. `package.json` `"next-safe-action": "8.7.3"`. `eslint.config.mjs` 38행 `no-explicit-any: error`, element-types(app→app·domain·lib·ui, ui→ui·lib), 76~78행 3규칙 error + no-row-type-escape 추가 — 기준선 대비 약화 없음(diff 확인). `ci.yml` 47~48행 lint:sql·test:unit, postgres:16 서비스 → db:migrate → test:integration → playwright; `deploy.yml` 50행 `needs: ci`. ci-guard.test.ts·workflows.test.ts 통과 |
| 5 | SC5 — ARCHITECTURE.md·OPERATIONS.md 존재, 각 ≤300줄, 4계층+단일 지점 셋 다이어그램, 비용 목표·과금 항목·배포/롤백/경보 절차 | ✓ VERIFIED (롤백 절 서술 낡음 — Anti-Patterns) | 237줄 / 248줄. ARCHITECTURE 22·27·32행에 `domain/money`·`domain/rules/gate.ts`·`project(viewer, dto)`. OPERATIONS §2 $30·과금 항목, §4 배포(101·109행 자동 롤백 1회), §5 롤백, §6 경보 3개 표. docs-limits.test.ts 통과 |
| 6 | SC6 — migrate Job 먼저(실패 시 중단) → 스모크 실패 리비전이 트래픽을 계속 받는 상태로 끝나지 않는다; generate SQL만·push 금지; Squawk; rollback.sh; 16A 규칙; 경보 3개 deploy.sh 재현 | ✓ VERIFIED | deploy.sh `smoke_failed()` 521행 → rollback 1회 → exit 1(560·566·576·581행 호출). 단위: 277·286행 migrate 실패 중단, 297행 seed 실패 시 서비스 미배포(신규), 306·510행 스모크 실패 → 1회 롤백, 531행 최초 배포 롤백 없음, 476행 status.url 선확정·재배포 없음 — 전부 통과. rollback.sh 8건 통과(배포 단위 APP_GIT_SHA). push 명령 0건. `infra/monitoring/*.tpl` 3개 존재. pool-rule.test.ts 통과(PoolRuleInputError가 UserFacingError를 상속하게 바뀌었을 뿐). 자동 롤백 경로는 여전히 실제 GCP에서 관찰되지 않았고 근거는 fakebin 단위 테스트뿐이다(이전과 같음) |
| 7 | SC7 — 관리자 시스템 상태 화면 뼈대(배포 버전·DB 커넥션·마지막 백업·한도 배너); JSON 로그 | ✓ VERIFIED | 경로 이동: `app/(app)/admin/system-status/page.tsx` — 세션 없음 → redirect, `can(viewer,"admin.system-status","view")` 아님 → notFound, `getSystemStatus` 이중 방어(`domain/system-status/index.ts` can 주입), Banner·KvList로 SHA·커넥션·백업 렌더. repositories/system-status.ts·lib/gcp/cloud-sql-admin.ts 변경 없음. E2E system-status.spec.ts 2건(권한 없는 계급 404, 시스템 관리자 3항목). 단위 system-status.test.ts·log.test.ts 통과. 프로덕션 렌더는 01-UAT 6으로 확인(resolved) |

**Score:** 7/7 truths verified (0 present-behavior-unverified)

### Plan-level must_haves

`verify.artifacts` 8개 플랜: 46/48 pass. 실패 2건 모두 설명 가능 — `app/admin/system-status/page.tsx` 'File not found'(Phase 2가 `app/(app)/admin/system-status/page.tsx`로 이동, 배선 확인), `docs/OPERATIONS.md` 'Missing pattern: erp-prod'(사용자 결정으로 `plant8-` 접두어, 이전과 같음).
`verify.key-links` 29개: 26 verified. 미확인 3건 — 01-01 `app/healthz/route.ts`(구글 예약 경로라 `app/api/health/route.ts`로 이전), 01-03 system-status 링크(위 경로 이동, 새 경로에서 `getSystemStatus` import·호출 확인), 01-03 `auth.api.getSession`(간접 배선: `lib/actions/client.ts` → `lib/viewer.ts` getSession). 셋 다 WIRED.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | 잠금·해제 "행동 로그" — 지금도 JSON 로그 이벤트뿐, action_log 표에는 없다 | Phase 7(재배정 필요) | 원래 이월 대상 Phase 3은 이 항목 없이 passed. Phase 7 SC5의 행동 로그 전 메뉴 검수만 남은 후보 — human 6에서 결정 |

이전 보고서의 이월 3건 중 2건(어디서든 로그아웃 → Phase 2, N·15분 설정 키 → Phase 3)은 코드로 해소됐다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/deploy.sh` | 인프라 ensure·이미지·Job(+seed)·서비스·경보·스모크·자동 롤백 | ✓ VERIFIED | deploy-sh.test.ts 전 건 통과 |
| `scripts/rollback.sh` | 직전 배포(APP_GIT_SHA) 복구 | ✓ VERIFIED | 8건 통과, 머리 주석 정정됨 |
| `scripts/promote-guard.sh` | 프로덕션 승격 가드 | ✓ VERIFIED | promote-guard-sh.test.ts 통과, 파일 변경 없음 |
| `scripts/migrate-runner.ts` / `domain/ops/pool-rule.ts` | 16A 규칙 | ✓ VERIFIED | pool-rule.test.ts 통과 |
| `lib/auth.ts` / `domain/auth/*` / `repositories/login-attempts.ts` | better-auth·잠금·속도 제한 | ✓ VERIFIED | 단위 통과, 통합(lockout·rate-limit·auth) 로컬 게이트 통과 |
| `lib/actions/client.ts` / `app/(app)/account/actions.ts` | authedActionClient | ✓ VERIFIED | require-action-client 규칙 테스트 통과 |
| `app/(app)/admin/system-status/page.tsx` + domain/repositories | 상태 화면 뼈대 | ✓ VERIFIED | 실제 쿼리·API, 권한표 게이트 |
| `eslint.config.mjs` + `eslint/rules/*.mjs` | 4계층 경계·커스텀 규칙 3개 | ✓ VERIFIED | RuleTester 3파일 통과 |
| `.github/workflows/{ci,deploy,account}.yml` | CI 3계층·배포·계정 Job | ✓ VERIFIED | workflows.test.ts·ci-guard.test.ts 통과 |
| `Dockerfile` | 멀티스테이지, dist/cli, 비루트 | ✓ VERIFIED | 38행 `pnpm build && pnpm build:cli`, 59행 `USER app`; build-cli.mjs에 seed-master 포함 |
| `infra/monitoring/*.tpl` (3) | 경보 3개 | ✓ VERIFIED | 파일 변경 없음 |
| `docs/ARCHITECTURE.md` / `docs/OPERATIONS.md` | ≤300줄 문서 | ✓ VERIFIED | 237/248줄 |
| `CLAUDE.md` 명령 | pnpm dev/test/lint/build | ✓ VERIFIED | package.json에 dev·test·lint·typecheck·lint:sql·build·db:dev 전부 존재 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| login-form.tsx | /api/auth/[...all] | `authClient.signIn.email` | WIRED | tool verified |
| lib/auth.ts | domain/auth/hooks.ts | `hooks: { before, after }` | WIRED | tool verified |
| hooks.ts | repositories/login-attempts.ts · domain/settings | `countOpenFailures` · `lockoutConfig()` | WIRED | lockoutConfig가 레지스트리를 읽는다 |
| proxy.ts | lib/client-ip.ts | x-client-ip 덮어쓰기 | WIRED | 두 파일 변경 없음 |
| account/actions.ts | lib/actions/client.ts → lib/viewer.ts → auth.api.getSession | authedActionClient | WIRED | 간접 |
| app/(app)/admin/system-status/page.tsx | domain/system-status → repositories/system-status | getSystemStatus | WIRED | 이동된 경로에서 확인 |
| ui/shell TopBar·MoreSheet | lib/auth-client signOut | ui/logout/use-logout.ts | WIRED | 로그아웃 세 경로가 한 훅 |
| deploy.yml | ci.yml / deploy.sh / promote-guard.sh | needs·run | WIRED | tool verified |
| deploy.sh | seed Job(dist/cli/seed-master.mjs) | run_seed | WIRED | build-cli.mjs 9·16행 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| admin/system-status/page.tsx | `status.db` | `pg_stat_activity` / `show max_connections` | Yes | ✓ FLOWING |
| admin/system-status/page.tsx | `status.backup` | Cloud SQL Admin `backupRuns.list` | Yes (프로덕션 관찰, UAT 6) | ✓ FLOWING |
| admin/system-status/page.tsx | `status.version.sha` | `env.APP_GIT_SHA` | Yes | ✓ FLOWING |
| app/api/health/route.ts | `ok` | `SELECT 1` | Yes | ✓ FLOWING |
| account/page.tsx | 이메일·임시 배너 | `requireSession()` | Yes | ✓ FLOWING |

`app/(app)/page.tsx`(「내 차례」)의 `buildNextTurnView([])` 빈 입력은 Phase 2 D-24의 의도된 빈 상태이며 Phase 1 계약 밖이다.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 1 단위 표면 | `pnpm vitest run --project unit test/unit/deploy/ ci-guard pool-rule lockout docs-limits env account-cli system-status password auth-provider log client-ip eslint-rules/ dockerfile` | 23 files, 238 passed | ✓ PASS |
| 플랜 artifact·key-link | `gsd-tools query verify.artifacts/key-links` × 8 | 46/48 · 26/29, 미확인 전부 경로 이동·이름 결정으로 설명됨 | ✓ |
| 테스트 존재 | grep 열거 | lockout A~D, rate-limit 3, login-logout 4, change-password 1, system-status 2, logout-failure 4 | ✓ |
| 통합·E2E·lint·typecheck·lint:sql | 로컬 전체 게이트(아래) | 3c1b015·2d7f73e 모두 전부 exit 0 (2d7f73e: 단위 743 · 통합 1027 · E2E 176) | ✓ PASS (인용) |

### 로컬 게이트

HEAD `3c1b015`, 이 컨테이너, 2026-09-24 07:48–08:10Z. 오케스트레이터가 실행했고 검증자는 결과를 인용한다(검증자가 직접 돌린 것은 위 단위 23파일/238건뿐).

| 단계 | 명령 | 결과 |
|------|------|------|
| 린트 | `pnpm lint` | exit 0 (기존 boundaries v5→v6 설정 이관 경고 1건만) |
| 타입체크 | `pnpm typecheck` | exit 0 |
| 마이그레이션 린트 | `pnpm lint:sql` | exit 0 |
| 단위 | `pnpm test:unit` | 76 files / 743 passed |
| 통합 | `pnpm test:integration` | 38 files / 1027 passed |
| E2E | `pnpm test:e2e:ci` (db:reset:test + `CI=true` 프로덕션 빌드) | 165 passed, 0 failed, 0 flaky (3.7m) |

**2d7f73e 재확인(2026-09-24, 오케스트레이터 실행):** `pnpm lint` exit 0 · `pnpm typecheck` exit 0 · `pnpm test:unit` 743/743 passed · `pnpm test:integration` 1027/1027 passed · `CI=true` Playwright E2E 176 passed (3.6m, exit 0). 검증자는 DB·포트 경합 때문에 통합·E2E를 직접 돌리지 않았고 결과를 인용한다. 3c1b015→2d7f73e 사이 Phase 1 covered 파일 변경은 `app/(app)/account/page.tsx`(로그아웃 버튼 래퍼 div)와 `ui/shell/TopBar.tsx`(워드마크 홈 링크) 둘뿐이고 로그인·비밀번호 변경·로그아웃 배선은 그대로다. 검증자 직접 실행: `vitest run --project unit test/unit/docs-limits.test.ts` 26 passed.

판정 영향: 통합(lockout A~D·rate-limit 3·auth·system-status)과 E2E(login-logout·change-password·system-status·logout-failure)가 전부 포함돼 통과했으므로 SC2·SC3·SC7의 행위 근거가 채워졌다. `CI=true` 프로덕션 빌드로 돈 E2E이므로 CLAUDE.md의 완료 판정 조건도 충족한다. 판정은 바뀌지 않는다 — 7/7, 남은 것은 사람 확인 3건.

### Probe Execution

`scripts/*/tests/probe-*.sh` 규약 프로브 없음. 페이즈 프로브는 일회용 GitHub Actions 워크플로(실행 후 삭제)였고 결과는 DEPLOY-LOG에 기록돼 있다. 이 컨테이너는 `*.run.app`에 닿지 못해(403) 다시 실행할 수 없다.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence / REQUIREMENTS.md 표기 |
|-------------|----------------|--------|--------------------------------|
| AUTH-01 | 01-02, 01-07 | ✓ SATISFIED (잠금·해제 행동 로그 절은 Deferred) | Complete |
| AUTH-02 | 01-01 | ✓ SATISFIED — 셸 로그아웃으로 이전 이월 해소 | Complete |
| AUTH-03 | 01-02, 01-03 | ✓ SATISFIED | Complete |
| AUTH-04 | 01-03 | ✓ SATISFIED | Complete |
| OPS-01 | 01-05~01-08 | ✓ SATISFIED | Complete |
| OPS-02 | 01-05, 01-06, 01-08 | ✓ SATISFIED (`--min-instances=0` 456행, OPERATIONS §2) | Complete |
| OPS-04 | 01-01, 01-04 | ✓ SATISFIED | Complete |
| OPS-06 | 01-03, 01-07 | ✓ SATISFIED (Phase 1 담당분) | Complete |
| OPS-07 | 01-04, 01-08 | ✓ SATISFIED | Complete |
| (orphan) | — | 없음 | 9개 전부 플랜 frontmatter에 있다 |

Decision coverage는 다시 확인하지 못했다 — `check.decision-coverage-verify`가 경로와 무관하게 "CONTEXT.md missing"으로 건너뛴다(01-CONTEXT.md는 존재). 이전 값(18/18)은 이번 재검증에서 새로 확인한 것이 아니다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Phase 1 변경 파일 | — | TBD/FIXME/XXX | 없음 | — (OPERATIONS.md 170행 "TODOS.md 참고"는 외부 문서 참조) |
| docs/OPERATIONS.md | 117~119 | §5 롤백이 "현재 100% 리비전보다 오래된 최신 리비전"이라고 쓴다. 실제 rollback.sh는 **서빙 중 APP_GIT_SHA와 다른 가장 최신 리비전**을 고른다(같은 배포의 짝 리비전 건너뜀, 없으면 exit 1) | ⚠ Warning | 운영자가 롤백 결과를 오해할 수 있다. 코드 동작은 맞다. 이전 보고서 부록 A의 "§5 문구 확인" 남은 일이 그대로 남았다 |
| domain/auth/locked-message.ts | 10~11 | 잠금 문구에 "15분"이 고정돼 있는데 창(분)이 이제 관리자가 바꿀 수 있는 설정 키다 | ℹ Info | 설정을 바꾸면 안내 문구가 틀린다. 기본값(15)에서는 맞다 |
| domain/auth/accounts.ts | 49 | `createAccount`에 roleId를 안 넘기면 계급 null 계정이 생기고, `lib/viewer.ts`가 그 세션을 null로 돌린다(로그인 불가) | ℹ Info | 운영 경로(account-cli)는 항상 DEFAULT_ROLE_ID를 넘기므로 영향 없음. 직접 호출은 테스트뿐 |
| .squawk.toml / tick-stale.tpl / Dockerfile / db-bootstrap.ts | — | 이전 보고서의 Info 4건 | ℹ Info | 변경 없음, 판정 영향 없음 |

### Human Verification Required

1. **프로덕션 세션 유지** — **닫힘 2026-09-22**(01-UAT 5)
2. **프로덕션 /admin/system-status 렌더 + 백업 절** — **닫힘 2026-09-22**(01-UAT 6)
3. **백업 실패 경보 필터·메일 전달** — **열림, 사용자 몫.** GCP 콘솔 Monitoring → Alerting에서 `[prod] Cloud SQL backup failed` 필터를 실제 백업 로그 항목과 대조하고 알림 채널 「테스트 알림 보내기」로 ALERT_EMAIL 도착 확인(01-UAT 7)
4. **조직 정책 원문·런타임 SA 역할** — **닫힘 2026-09-22**(01-UAT 8)
5. **현재 main(3c1b015) 배포 실측** — **열림.** GitHub Actions deploy 실행 기록에서 HEAD 스테이징 배포 success(seed 포함)를 보고, 스테이징 URL에서 로그인 → /account → 비밀번호 변경 → 로그아웃. 프로덕션을 승격했다면 같은 흐름을 프로덕션에서도. 실제 Cloud Run URL이 필요해 이 컨테이너에서는 확인할 수 없다(`*.run.app` 403, gh CLI 없음)
6. **SC2 잠금·해제 행동 로그 이월 재배정** — **열림, 결정 필요.** (a) action_log에 잠금·해제 종류를 넣는 작업을 Phase 7이나 quick에 명시 배정, 또는 (b) Phase 1의 "행동 로그 이벤트 = JSON 로그" 해석을 override로 수용

정리 항목(검증 대상 아님): orphan 프로브 결과 브랜치 4개 삭제(01-UAT 9, blocked), 첫 청구서 확인(01-UAT 3, blocked).

### Gaps Summary

**회귀 없음.** Phase 1 이후 233개 커밋이 Phase 1 파일 약 60개를 바꿨지만, 전부 계약을 넓히거나(권한표 게이트, 보관 사용자 차단, 설정 레지스트리, seed Job, 오류 문구 화이트리스트) 파일을 옮긴 것(앱 셸 라우트 그룹)이다. 성공 기준 7개를 약하게 만든 변경은 찾지 못했다. 이전 이월 3건 중 2건(어디서든 로그아웃, 잠금 설정 키)은 코드로 해소됐다.

**남은 것은 사람 확인 3건이다.** 경보 메일은 사용자 몫이고, HEAD 배포 실측은 실제 URL이 필요하며, 잠금·해제 행동 로그는 이월 대상이던 Phase 3이 받지 않은 채 끝나 재배정 결정이 필요하다. 셋 다 페이즈 목표(배포·로그인·비밀번호 변경·로그아웃)를 뒤집지 않는다. 로컬 전체 게이트(단위 743·통합 1027·E2E 165, `CI=true`)는 3c1b015에서 전부 통과했고, 2d7f73e에서도 전부 통과했다(단위 743·통합 1027·E2E 176, `CI=true`). 3c1b015 이후 변경(/design-review·/qa 수정)은 Phase 1 truth에 영향이 없다.

---

_Verified: 2026-09-24T09:35:01Z (2d7f73e 재확인; 첫 재검증 2026-09-24T07:52:40Z; 이전 2026-09-18T19:09:12Z · SC6 재검증 2026-09-19T03:31:45Z)_
_Verifier: Claude (gsd-verifier)_
