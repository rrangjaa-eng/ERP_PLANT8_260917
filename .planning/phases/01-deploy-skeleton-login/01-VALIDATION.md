---
phase: "1"
slug: "deploy-skeleton-login"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-18"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.1 (단위 `test/unit`, 통합 `test/integration` + 실제 Postgres 16) + @playwright/test 1.63.0 (E2E `test/e2e`) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` — none yet, Wave 0 (Plan 01-01) installs |
| **Quick run command** | `pnpm vitest run --project unit` |
| **Full suite command** | `pnpm test` (= `pnpm test:unit && pnpm test:integration && pnpm test:e2e`; 통합·E2E는 `pnpm db:dev`가 띄운 127.0.0.1:5432 `erp_test` DB 필요) |
| **Estimated runtime** | 단위 ~5초 · 통합 ~40초 · E2E ~90초 (webServer 기동 포함) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project unit` (+ 그 태스크의 `<automated>` 명령)
- **After every plan wave:** Run `pnpm test` (Wave 6·7은 여기에 배포된 URL의 `curl …/healthz` 스모크를 더한다)
- **Before `/gsd-verify-work`:** Full suite must be green, CI(`.github/workflows/ci.yml`) green, staging·production `healthz` ok
- **Max feedback latency:** 5 seconds (단위) / 40초 (통합)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | OPS-04 | T-1-SC | 승인된 목록·버전만 설치, lockfile 커밋 | checkpoint (blocking-human) | — (의존성 승인) | — | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-02 | T-1-01 / T-1-02 | 서명 HttpOnly 세션 쿠키, 공개 가입 차단, 영속 쿠키 30일 | e2e | `bash scripts/dev-db.sh && pnpm db:migrate && pnpm playwright test test/e2e/login-logout.spec.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | AUTH-02, OPS-04 | T-1-02 / T-1-03 | sign-up 4xx, env 오류 메시지에 값 없음, healthz 최소 노출 | unit + integration | `pnpm vitest run --project unit test/unit/env.test.ts && pnpm vitest run --project integration test/integration/auth.test.ts test/integration/healthz.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | AUTH-01, AUTH-03 | T-1-09 / T-1-10 | 임시 비밀번호 stdout 1회·로그 금지, 재발급 시 전 세션 만료 | unit + integration | `pnpm vitest run --project unit test/unit/account-cli.test.ts && pnpm vitest run --project integration test/integration/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | AUTH-01 | T-1-06 / T-1-07 / T-1-08 | 5회 실패 잠금(DB), 15분 창, 관리자 해제, IP 429, 계정 존재 비노출 | unit + integration | `pnpm db:migrate && pnpm vitest run --project unit test/unit/lockout.test.ts && pnpm vitest run --project integration test/integration/lockout.test.ts test/integration/rate-limit.test.ts test/integration/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 3 | AUTH-03, AUTH-04 | T-1-12 / T-1-13 / T-1-14 / T-1-18 | authedActionClient 세션 강제, 변경 시 전 세션 만료, 8자+흔한 목록 차단 | unit + e2e | `pnpm vitest run --project unit test/unit/password.test.ts test/unit/auth-provider.test.ts && pnpm playwright test test/e2e/change-password.spec.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 3 | OPS-06 | T-1-15 / T-1-17 | 비관리자 404(서버+domain 이중), API 5초 타임아웃 → 확인 불가 | unit + integration + e2e | `pnpm vitest run --project unit test/unit/system-status.test.ts && pnpm vitest run --project integration test/integration/system-status.test.ts && pnpm playwright test test/e2e/system-status.spec.ts` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 4 | OPS-04 | T-1-19 / T-1-20 | use server 래퍼 강제, app↛repositories/db, viewer 인자, any 금지 | unit (rule tester) + lint | `pnpm vitest run --project unit test/unit/eslint-rules && pnpm lint && pnpm typecheck` | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 4 | OPS-04 | T-1-21 / T-1-22 | CI에 push 하위 명령 없음, Squawk 게이트, 일회용 시크릿 | unit (meta) | `pnpm vitest run --project unit test/unit/ci-guard.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-03 | 04 | 4 | OPS-07, OPS-02 | T-1-23 | 문서에 실제 식별자 없음, 300줄 상한 | unit (meta) | `pnpm vitest run --project unit test/unit/docs-limits.test.ts && wc -l docs/ARCHITECTURE.md docs/OPERATIONS.md` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 5 | OPS-01, OPS-02 | T-1-25 / T-1-26 / T-1-27 / T-1-SC2 | 비루트 컨테이너, 관리 비밀번호는 db-bootstrap Job만, 로그 금지 | unit + integration | `pnpm vitest run --project unit test/unit/dockerfile.test.ts test/unit/db-bootstrap-sql.test.ts && pnpm vitest run --project integration test/integration/db-bootstrap.test.ts && pnpm build:cli && node --env-file=.env.local dist/cli/migrate-runner.mjs` | ❌ W0 | ⬜ pending |
| 1-05-02 | 05 | 5 | OPS-01 | T-1-28 | 16A 실측 검사, 위반 exit 3 | unit + integration | `pnpm vitest run --project unit test/unit/pool-rule.test.ts && pnpm vitest run --project integration test/integration/migrate-runner.test.ts && pnpm build:cli && grep -c max_connections dist/cli/migrate-runner.mjs` | ❌ W0 | ⬜ pending |
| 1-06-01 | 06 | 5 | OPS-01, OPS-02 | T-1-31 / T-1-34 / T-1-35 | 더티 트리 거부, set -x 없음, 스모크 실패 시 트래픽 불변, 공인 IP 없음 | unit (fake gcloud) | `bash -n scripts/deploy.sh && bash -n scripts/rollback.sh && pnpm vitest run --project unit test/unit/deploy/deploy-sh.test.ts test/unit/deploy/rollback-sh.test.ts` | ❌ W0 | ⬜ pending |
| 1-06-02 | 06 | 5 | OPS-01 | T-1-29 / T-1-30 / T-1-32 / T-1-33 | WIF attribute-condition 리포 한정, 입력을 env로 전달, id-token 최소 권한 | unit (fake gcloud + text) | `bash -n scripts/bootstrap-gcp.sh && pnpm vitest run --project unit test/unit/deploy/bootstrap-sh.test.ts test/unit/deploy/workflows.test.ts test/unit/ci-guard.test.ts` | ❌ W0 | ⬜ pending |
| 1-07-01 | 07 | 6 | OPS-01 | — | 리소스 이름 확정(one-way) | checkpoint:decision | — | — | ⬜ pending |
| 1-07-02 | 07 | 6 | OPS-01 | T-1-37 / T-1-38 | 부트스트랩 출력·계정 정보 리포 미기록 | checkpoint:human-action | — (사용자 Cloud Shell) | — | ⬜ pending |
| 1-07-03 | 07 | 6 | OPS-01, OPS-06 | T-1-39 / T-1-40 | 배포 URL healthz·login 응답, 상태 화면 권한 실측 | smoke + human-check | `curl -fsS "$SERVICE_URL/healthz" \| grep -q '"ok":true' && curl -s -o /dev/null -w '%{http_code}' "$SERVICE_URL/login" \| grep -q '^200$' && test -s .planning/phases/01-deploy-skeleton-login/01-07-DEPLOY-LOG.md` | n/a (배포 후) | ⬜ pending |
| 1-08-01 | 08 | 7 | OPS-01 | T-1-41 / T-1-43 | production 승인 게이트 | checkpoint:human-action | — (GitHub 승인) | — | ⬜ pending |
| 1-08-02 | 08 | 7 | OPS-01, OPS-06 | T-1-42 / T-1-44 | 프로덕션 healthz·계정·경보·백업·A3 | smoke + human-check | `curl -fsS "$PROD_URL/healthz" \| grep -q '"ok":true' && curl -s -o /dev/null -w '%{http_code}' "$PROD_URL/login" \| grep -q '^200$' && test -s .planning/phases/01-deploy-skeleton-login/01-08-DEPLOY-LOG.md` | n/a (배포 후) | ⬜ pending |
| 1-08-03 | 08 | 7 | OPS-07, OPS-02 | T-1-42 | 문서 300줄·식별자 없음, CLAUDE.md 명령 확정 | unit (meta) | `pnpm vitest run --project unit test/unit/docs-limits.test.ts && grep -c 'dev \`pnpm db:dev && pnpm dev\`' CLAUDE.md && test "$(grep -c '\[ \]' CLAUDE.md)" -eq 0` | ✅ (01-04) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — `projects` unit/integration 분리 (Plan 01-01 Task 3)
- [ ] `playwright.config.ts` — webServer(`pnpm dev` / CI `pnpm build && pnpm start`), `globalSetup`, 클라우드 세션 Chromium 경로 폴백 (Plan 01-01 Task 2)
- [ ] `test/integration/global-setup.ts` + `test/integration/setup.ts` — env 기본값, 마이그레이션 적용, 표 TRUNCATE (Plan 01-01 Task 3)
- [ ] `test/e2e/global-setup.ts` + `test/e2e/fixtures.ts` — `createFixtureUser` (Plan 01-01 Task 2)
- [ ] `scripts/dev-db.sh` + `.claude/settings.json` SessionStart 훅 — 로컬/클라우드 Postgres 16 `erp`·`erp_test` (Plan 01-01 Task 2, D-01)
- [ ] `.github/workflows/ci.yml` `services.postgres` — CI 통합·E2E (Plan 01-04 Task 2)
- [ ] `test/unit/deploy/fakebin/{gcloud,docker,curl}` — deploy.sh 가짜 심 (Plan 01-06 Task 1)
- [ ] `test/unit/eslint-rules/fixtures/` — type-aware 규칙 테스트 tsconfig·Money 픽스처 (Plan 01-04 Task 1)
- [ ] Framework install: vitest@5.0.1, @playwright/test@1.63.0, @typescript-eslint/rule-tester — Plan 01-01 Task 1 승인 목록에 포함

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 30일 무사용 후 재로그인 요구(sliding 만료) | AUTH-02 (D-07) | 30일을 테스트로 기다릴 수 없음; E2E는 쿠키 만료일(≥29일)만 단언 | 운영 중 30일 미접속 계정으로 `/account` 접근 → `/login` 리다이렉트 확인 |
| 브라우저 완전 종료 후 세션 유지 | AUTH-02 (D-07) | E2E는 storageState 재사용으로 근사 | 01-07 human-check 5: 브라우저 종료 → 재실행 → `/account` 로그인 상태 |
| 배포된 URL에서 로그인·비밀번호 변경·로그아웃·상태 화면 | AUTH-01/02/03, OPS-06 | 실제 GCP 환경(WIF·Cloud SQL·Secret Manager)은 로컬에서 재현 불가 | 01-07 Task 3 human-check 1~4 (staging), 01-08 Task 2 human-check 1~3 (production) |
| Cloud Monitoring 경보 3개·이메일 채널 존재, 경보 메일 수신 | OPS-01 (D-16) | gcloud가 실행 세션에 없음; 메일 수신은 사람만 확인 | GCP 콘솔 Alerting에서 `[env]` 정책 3개(tick disabled) 확인; 필요 시 테스트 알림 전송 |
| Cloud SQL 자동 백업 1건 이상 + 상태 화면 "마지막 백업" 표시 | OPS-06 (D-18, A3) | 첫 백업은 백업 창(03:00 KST) 이후 생김 | 01-08 human-check 4: 다음날 콘솔 백업 탭 + 상태 화면 |
| 월 비용 두 환경 합계 $30 안팎 | OPS-02 (D-06) | 청구서 데이터는 API·테스트로 접근하지 않음 | 첫 청구서(다음 달 초) Billing 보고서 확인, OPERATIONS.md 비용 절 갱신 |
| 회사 GCP 조직 정책(비인증 ingress·외부 링크) 허용 여부 | OPS-01 (OV-3) | 조직 정책은 Cloud Shell Owner 권한으로만 조회 | 01-07 Task 2: `bootstrap-gcp.sh` 출력의 org-policies 절 |
| GitHub `production` 환경 Required reviewers 설정 가능 여부 | OPS-01 (D-05) | 리포 플랜에 따라 UI 옵션이 없을 수 있음 | 01-07 Task 2 단계 5에서 확인, 불가 시 D-05 대안 결정 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
