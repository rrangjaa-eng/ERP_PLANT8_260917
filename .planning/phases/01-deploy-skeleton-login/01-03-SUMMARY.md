---
phase: 01-deploy-skeleton-login
plan: 03
subsystem: auth
tags: [next-safe-action, better-auth, googleapis-sqladmin, pg_stat_activity, drizzle]

# Dependency graph
requires:
  - phase: 01-01
    provides: "lib/viewer.ts(getSession/requireSession), domain/auth/provider.ts(getAuthProvider), repositories/users.ts(setPasswordTemporary), lib/auth.ts(better-auth 인스턴스), lib/env.ts"
  - phase: 01-02
    provides: "domain/auth/accounts.ts의 resetPassword가 이미 확립한 internalAdapter.deleteUserSessions(userId) 패턴"
provides:
  - "lib/actions/client.ts — authedActionClient(세션 미들웨어 → viewer/user ctx 주입) — 이후 모든 페이즈의 유일한 Server Action 진입점(Issue 2)"
  - "domain/auth/password.ts — validateNewPassword(8자+흔한목록66개), revokeAllSessions/finalizePasswordChange(D-10 전 세션 만료)"
  - "본인 비밀번호 변경 화면(/account) — 임시 비밀번호 배너(D-08), 변경 성공 시 /login?reason=password-changed"
  - "로그인 화면의 AUTH_PROVIDER=google 어댑터 슬롯(구조 불변 테스트로 고정)"
  - "domain/system-status/index.ts(getSystemStatus, connectionBanner) + repositories/system-status.ts + lib/gcp/cloud-sql-admin.ts(getLastBackup) — 관리자 전용 /admin/system-status 화면 뼈대"
affects: [01-04, 01-07, 01-08]

# Actuals (#2632)
actuals:
  tokens: 9300
  tasks: 2
  commits: 2
plan_head_before: 48696cc7b1d35a7036a3fb76c4e307f16182f8aa

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action은 전부 authedActionClient.schema(zod).action(...) 체인만 쓴다 — app은 domain 함수만 부르고 db/repositories를 직접 import하지 않는다(Issue 1, grep으로 강제 가능)"
    - "domain/*/index.ts의 조회 함수는 deps?: Partial<StatusDeps> 주입 패턴으로 실제 함수를 기본값으로 두고 테스트에서 오버라이드한다(네트워크 없는 단위 테스트)"
    - "better-auth 세션 전부 만료는 auth.$context.internalAdapter.deleteUserSessions(userId)다(단수형 deleteSessions는 세션 토큰 배열을 받는 다른 메서드 — 01-02가 이미 올바르게 썼고 이번 플랜의 domain/auth/password.ts도 동일하게 맞춤)"

key-files:
  created:
    - lib/actions/client.ts
    - domain/auth/password.ts
    - "app/(app)/account/actions.ts"
    - "app/(app)/account/change-password-form.tsx"
    - domain/system-status/index.ts
    - repositories/system-status.ts
    - lib/gcp/cloud-sql-admin.ts
    - app/admin/system-status/page.tsx
    - test/unit/password.test.ts
    - test/unit/auth-provider.test.ts
    - test/unit/system-status.test.ts
    - test/integration/system-status.test.ts
    - test/e2e/change-password.spec.ts
    - test/e2e/system-status.spec.ts
  modified:
    - "app/(app)/account/page.tsx"
    - "app/(auth)/login/page.tsx"
    - "app/(auth)/login/login-form.tsx"

key-decisions:
  - "domain/auth/password.ts의 revokeAllSessions는 계획 텍스트가 적은 auth.$context.internalAdapter.deleteSessions(userId)가 아니라 deleteUserSessions(userId)를 쓴다 — node_modules/better-auth/dist/db/internal-adapter.mjs 실제 구현 확인 결과 deleteSessions(sessionTokens: string[])는 세션 '토큰 배열'을 받는 별도 메서드이고, userId 하나로 그 사용자의 세션을 전부 지우는 메서드는 deleteUserSessions(userId)다. 01-02의 domain/auth/accounts.ts resetPassword가 이미 이 올바른 이름을 쓰고 있어 실측으로 확정했다(계획의 <interfaces> 서명 문자열만 정정, 동작·계약은 동일)"
  - "app/(app)/account/actions.ts는 계획이 나열한 import 목록(lib/actions/client·lib/auth·domain/auth/password·next/headers·next/navigation·zod)에 better-auth/api의 APIError를 추가했다 — auth.api.changePassword가 현재 비밀번호 불일치를 better-auth의 APIError(BAD_REQUEST, INVALID_PASSWORD)로 던지므로 이를 구분해 한국어 메시지로 바꾸려면 필요하다. db/repositories는 여전히 직접 import하지 않는다(강제 조건인 grep -c 'from \"@/(db|repositories)'는 0 — 실제 검증 통과)"
  - "AUTH-04 Google 로그인 버튼의 클릭 핸들러(authClient.signIn.social)는 서버 컴포넌트인 app/(auth)/login/page.tsx가 아니라 이미 존재하던 클라이언트 컴포넌트 app/(auth)/login/login-form.tsx에 showGoogle prop으로 얹었다 — 서버 컴포넌트는 클라이언트 전용 API를 직접 호출할 수 없다. 구조 불변 조건(getAuthProvider() === \"google\" 조건이 page.tsx에 있어야 한다)은 그대로 지켰고, 계획의 파일 목록에 login-form.tsx가 없었지만 새 파일을 만들지 않고 기존 파일을 확장했다(CLAUDE.md 기존 컨벤션 우선)"
  - "repositories/system-status.ts의 countConnections는 pg_stat_activity에 state <> 'idle' 필터를 넣은 RESEARCH.md Pattern 11 예시 대신, 플랜 <action> 지시대로 필터 없이 전체 연결 수를 센다(비특권 사용자에게는 다른 세션의 state가 null로 보여 16A 공식이 세는 단위와 어긋나기 때문) — RESEARCH 코드 스니펫보다 플랜 본문의 명시적 지시를 따랐다"
  - "test/e2e/system-status.spec.ts의 배너 부재 검증은 page.getByRole(\"alert\") 전체 카운트가 아니라 배너 문구(\"DB 커넥션이 한도의\")로 좁혔다 — 실제 실행 중 Next.js 16 dev 모드가 라우트 변경 안내용 숨은 role=alert 접근성 리전을 자체로 렌더해 전체 카운트 검증이 프레임워크 요소와 충돌했다(우리 코드가 만든 배너와 무관, 스코프 밖 발견)"

requirements-completed: [AUTH-03, AUTH-04]

coverage:
  - id: D1
    description: "직원이 /account에서 현재 비밀번호와 8자 이상 새 비밀번호를 내면 비밀번호가 바뀌고 그 사용자의 모든 세션(현재 기기 포함)이 만료되어 /login으로 안내되며 새 비밀번호로만 다시 로그인된다"
    requirement: "AUTH-03"
    verification:
      - kind: e2e
        ref: "test/e2e/change-password.spec.ts#임시 배너 → 변경 → 재로그인 → 옛 비밀번호 실패 → 새 비밀번호 성공 → 배너 사라짐 → 틀린 현재 비밀번호 → 7자 거부 → 로그아웃"
        status: pass
    human_judgment: false
  - id: D2
    description: "7자 비밀번호와 내장 흔한 비밀번호 목록(password, 12345678 등, 대소문자 무관)은 거부되고 문자 조합 규칙은 없다"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "test/unit/password.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "임시 비밀번호로 로그인한 사용자는 /account에서 배너를 보고 변경을 강제당하지 않으며, 본인이 바꾸면 배너가 사라진다"
    requirement: "AUTH-03"
    verification:
      - kind: e2e
        ref: "test/e2e/change-password.spec.ts (동일 시나리오 내 배너 표시→소멸 단언)"
        status: pass
    human_judgment: false
  - id: D4
    description: "모든 Server Action은 lib/actions/client.ts의 authedActionClient로만 만들어진다"
    verification:
      - kind: other
        ref: "grep -c -E 'from \"@/(db|repositories)' app/(app)/account/actions.ts → 0, authedActionClient.schema( 체인 확인"
        status: pass
    human_judgment: false
  - id: D5
    description: "AUTH_PROVIDER 환경 변수 하나로 로그인 방식이 정해지고, google로 바꾸면 lib/auth.ts의 socialProviders 블록과 로그인 화면의 버튼 슬롯만 켜져 코드 구조가 바뀌지 않는다"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "test/unit/auth-provider.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "관리자만 /admin/system-status를 보고 직원은 404를 받는다; 배포 버전·DB 커넥션 수/max_connections·마지막 백업(백업 없음/확인 불가 구분)을 로드 때마다 직접 조회하고 커넥션 비율이 80% 이상이면 배너가 뜬다"
    verification:
      - kind: unit
        ref: "test/unit/system-status.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/system-status.test.ts (실제 Postgres)"
        status: pass
      - kind: e2e
        ref: "test/e2e/system-status.spec.ts"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 3: 비밀번호 변경 + authedActionClient + 관리자 시스템 상태 화면 Summary

**첫 Server Action(`authedActionClient`)으로 본인 비밀번호 변경(전 세션 만료, D-10)과 임시 비밀번호 배너를 구현하고, AUTH_PROVIDER 어댑터 슬롯을 구조 불변 테스트로 고정했으며, 관리자 전용 시스템 상태 화면(배포 버전·DB 커넥션·마지막 백업·80% 한도 배너)을 pg_stat_activity·Cloud SQL Admin API 실시간 조회로 세웠다.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-18T08:09:42Z
- **Completed:** 2026-09-18T08:27:40Z
- **Tasks:** 2
- **Files modified:** 17 (14 created, 3 modified)

## Accomplishments

- `lib/actions/client.ts`: `authedActionClient`(세션 미들웨어 → `{viewer, user}` ctx) — 이후 모든 페이즈의 유일한 Server Action 진입점(Issue 2)
- `domain/auth/password.ts`: `validateNewPassword`(8자 + 흔한 비밀번호 66개, 대소문자 무관), `revokeAllSessions`/`finalizePasswordChange`(D-10 전 세션 만료 + 임시 플래그 해제 + 로그)
- `app/(app)/account/actions.ts`의 `changePasswordAction` — 현재 비밀번호 오류를 better-auth `APIError`로 구분해 한국어 메시지로, 성공 시 `/login?reason=password-changed`로 리다이렉트
- `/account` 임시 비밀번호 배너(D-08, 강제·리다이렉트 없음) + `/login` 재로그인 안내 + `AUTH_PROVIDER=google`일 때만 켜지는 버튼 슬롯(AUTH-04, 구조 불변 테스트로 고정)
- `domain/system-status/index.ts` + `repositories/system-status.ts` + `lib/gcp/cloud-sql-admin.ts` — 관리자 전용 `/admin/system-status`(캐시 없음, `force-dynamic`)가 배포 버전·DB 커넥션/한도·마지막 백업(ok/none/unavailable 3분기)을 로드마다 직접 조회하고 80% 한도 배너를 띄운다
- 단위 3파일(password 5개, auth-provider 4개, system-status 11개) + 통합 1파일(실제 Postgres) + E2E 2파일(change-password, system-status) — 전부 실제 실행 확인, `pnpm build`·`pnpm lint`·`pnpm typecheck` 전부 통과

## Task Commits

1. **Task 1: 비밀번호 변경(authedActionClient) + 임시 비밀번호 배너 + 로그인 방식 전환 고정** - `06e610a` (feat)
2. **Task 2: 관리자 시스템 상태 화면 뼈대 — 배포 버전·DB 커넥션·마지막 백업·한도 배너** - `68ebad3` (feat)

**Plan metadata:** (이 커밋 다음에 기록됨)

## Files Created/Modified

- Server Action 진입점: `lib/actions/client.ts`
- 비밀번호 도메인: `domain/auth/password.ts`, `app/(app)/account/actions.ts`, `app/(app)/account/change-password-form.tsx`
- 계정·로그인 화면: `app/(app)/account/page.tsx`(배너+폼), `app/(auth)/login/page.tsx`(안내+provider 조건), `app/(auth)/login/login-form.tsx`(Google 버튼 슬롯)
- 시스템 상태: `domain/system-status/index.ts`, `repositories/system-status.ts`, `lib/gcp/cloud-sql-admin.ts`, `app/admin/system-status/page.tsx`
- 테스트: `test/unit/{password,auth-provider,system-status}.test.ts`, `test/integration/system-status.test.ts`, `test/e2e/{change-password,system-status}.spec.ts`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심은 (1) `deleteUserSessions(userId)`가 실제 전 세션 삭제 메서드임을 소스로 재확인(계획 문서의 메서드 이름만 정정, 01-02 선례와 일치), (2) `actions.ts`에 `better-auth/api`의 `APIError` import를 추가(db/repositories 직접 import 금지 규칙은 유지), (3) Google 로그인 클릭 핸들러를 기존 클라이언트 컴포넌트(`login-form.tsx`)에 prop으로 위임(서버 컴포넌트 제약), (4) `countConnections`는 플랜 지시대로 `state` 필터 없이 전체 연결 수를 센다, (5) E2E 배너 부재 검증을 Next dev의 프레임워크 `role=alert` 요소와 충돌하지 않도록 배너 문구 기준으로 좁힘.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `revokeAllSessions`가 `deleteUserSessions(userId)`를 쓰도록 정정**
- **Found during:** Task 1 (`node_modules/better-auth/dist/db/internal-adapter.mjs` 실제 구현 확인, read_first 지시대로)
- **Issue:** 계획의 `<interfaces>`가 `auth.$context.internalAdapter.deleteSessions(userId)`를 명시했으나, 실제 `deleteSessions(sessionTokens: string[])`는 세션 토큰 "배열"을 받는 별도 메서드다. userId 하나로 그 사용자의 세션을 전부 지우는 메서드는 `deleteUserSessions(userId)`
- **Fix:** `domain/auth/password.ts`의 `revokeAllSessions`가 `deleteUserSessions(userId)`를 호출하도록 구현(01-02의 `domain/auth/accounts.ts` `resetPassword`가 이미 이 올바른 메서드를 쓰고 있어 실측으로 재확인)
- **Files modified:** domain/auth/password.ts
- **Verification:** `test/e2e/change-password.spec.ts`에서 비밀번호 변경 뒤 옛 세션(로그인 상태)이 실제로 무효화되고 재로그인이 강제됨을 실행 확인
- **Committed in:** 06e610a

**2. [Rule 3 - Blocking] `app/(app)/account/actions.ts`에 `better-auth/api`의 `APIError` import 추가**
- **Found during:** Task 1 (현재 비밀번호 오류 처리 구현 중)
- **Issue:** 계획이 나열한 import 목록에 `better-auth/api`가 없었으나, `auth.api.changePassword`가 현재 비밀번호 불일치를 `APIError(BAD_REQUEST, INVALID_PASSWORD)`로 던지는 걸 구분해 한국어 메시지로 바꾸려면 `instanceof APIError` 검사가 필요하다(01-02의 `domain/auth/hooks.ts`가 이미 같은 import를 쓰는 기존 패턴)
- **Fix:** `APIError` import 추가. `db`/`repositories` 직접 import 금지 규칙(강제 조건)은 그대로 지킴
- **Files modified:** app/(app)/account/actions.ts
- **Verification:** `grep -c -E 'from "@/(db|repositories)' app/(app)/account/actions.ts` → 0; E2E에서 틀린 현재 비밀번호 시나리오가 "현재 비밀번호가 올바르지 않습니다." 문구로 정확히 거부됨을 확인
- **Committed in:** 06e610a

**3. [Rule 3 - Blocking] AUTH-04 Google 버튼 클릭 핸들러를 기존 클라이언트 컴포넌트(`login-form.tsx`)로 위임**
- **Found during:** Task 1 (로그인 화면에 Google 버튼 슬롯 구현 중)
- **Issue:** 계획의 Task 1 `<files>` 목록에는 `app/(auth)/login/page.tsx`만 있었으나, 이 파일은 서버 컴포넌트라 `authClient.signIn.social`(클라이언트 전용 API)을 직접 호출할 수 없다
- **Fix:** `getAuthProvider() === "google"` 조건은 그대로 `page.tsx`에 두고(구조 불변 테스트가 이 파일을 grep), 결과 boolean을 이미 존재하던 클라이언트 컴포넌트 `login-form.tsx`에 `showGoogle` prop으로 전달해 버튼과 클릭 핸들러를 그 안에 둠. 새 파일을 만들지 않고 기존 컴포넌트를 확장(CLAUDE.md "기존 컨벤션 우선")
- **Files modified:** app/(auth)/login/page.tsx, app/(auth)/login/login-form.tsx
- **Verification:** `pnpm build` 성공, `test/unit/auth-provider.test.ts`의 구조 불변 검사(정확히 1회 `socialProviders`, `page.tsx`의 조건문) 통과
- **Committed in:** 06e610a

**4. [Rule 1 - Bug] E2E 배너 부재 검증을 전체 `role=alert` 카운트에서 배너 문구 기준으로 좁힘**
- **Found during:** Task 2 (`test/e2e/system-status.spec.ts` 최초 실행 — 배너가 없어야 하는데 `role=alert` 요소가 1개 발견됨)
- **Issue:** `page.getByRole("alert")`가 우리 배너가 아니라 Next.js 16 dev 모드가 라우트 변경 안내용으로 자체 렌더하는 숨은 접근성 `role=alert` 리전을 함께 집었다(우리 코드의 버그 아님, 프레임워크 요소)
- **Fix:** 검증을 `page.getByText(/DB 커넥션이 한도의/)`로 좁혀 실제 배너 문구 유무만 확인
- **Files modified:** test/e2e/system-status.spec.ts
- **Verification:** 재실행 2/2 통과
- **Committed in:** 68ebad3

---

**Total deviations:** 4 auto-fixed (2 Rule 1 - 버그/테스트 정확도, 2 Rule 3 - 차단 이슈)
**Impact on plan:** 전부 정확성(세션 만료가 실제로 동작해야 함)·에러 메시지 품질·프레임워크 제약(서버/클라이언트 컴포넌트 경계) 대응에 필수적인 수정이며, 승인된 아키텍처·의존성 목록을 벗어나지 않았다. 새 의존성 추가 없음.

## Issues Encountered

None beyond the deviations documented above — each was found, root-caused (better-auth 소스 확인, 실제 Playwright 실행), fixed, and re-verified within this plan's own execution loop.

## User Setup Required

None - no external service configuration required. `GCP_PROJECT_ID`/`CLOUD_SQL_INSTANCE_ID` 미설정 로컬 환경에서는 백업 조회가 의도대로 "확인 불가"를 반환한다(실제 GCP 권한 검증은 01-07에서).

## Next Phase Readiness

- `lib/actions/client.ts`의 `authedActionClient`가 이후 모든 페이즈의 Server Action 표준 진입점으로 확립됨(01-04 린트가 이 이름을 강제할 수 있음)
- AUTH-03·AUTH-04는 REQUIREMENTS.md에서 Complete로 반영됨. OPS-06은 이 플랜의 몫(관리자 화면 뼈대)을 실제 실행으로 증명했지만, 같은 요구사항을 공유하는 01-07이 아직 남아 있어(회사 GCP 실제 권한·백업 검증) 요구사항 트래킹 표는 01-07 완료 시 Complete로 바뀐다(shared-ID gate, 의도된 동작)
- `SystemStatus` 타입에 필드를 추가하면 화면 섹션이 단순 나열로 늘어나는 구조 — Phase 7·8·9가 항목(마지막 알림 tick·이전 실행·계산 불가 건수)을 이어서 추가할 수 있다
- `pnpm build`·`pnpm lint`·`pnpm typecheck`·`pnpm test`(unit 49/49, integration 21/21, e2e 6/6) 전부 통과 확인(이 플랜 종료 시점)

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*

## Self-Check: PASSED

- All 14 newly created files verified present on disk (`[ -f ]`, 0 missing): lib/actions/client.ts, domain/auth/password.ts, app/(app)/account/actions.ts, app/(app)/account/change-password-form.tsx, domain/system-status/index.ts, repositories/system-status.ts, lib/gcp/cloud-sql-admin.ts, app/admin/system-status/page.tsx, test/unit/{password,auth-provider,system-status}.test.ts, test/integration/system-status.test.ts, test/e2e/{change-password,system-status}.spec.ts.
- Both task commits verified in `git log --oneline`: `06e610a`, `68ebad3`.
- All plan-level `<acceptance_criteria>` for Task 1 and Task 2 re-run via grep and passing (see Deviations/Accomplishments above for exact commands and results).
- Plan-level `<verification>` re-run: `pnpm test:unit` (49/49 passing, 8 files) · `pnpm test:integration` (21/21 passing, 5 files) · `pnpm test:e2e` (6/6 passing) · `pnpm typecheck` (clean) · `pnpm lint` (clean) · `pnpm build` (succeeds, `/admin/system-status` listed as `ƒ` dynamic route) — all exit 0.
- `git status --porcelain` clean at commit time (no stray untracked/generated files; `.next`, `test-results/`, `playwright-report/` already gitignored).
