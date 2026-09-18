---
phase: 01-deploy-skeleton-login
plan: 02
subsystem: auth
tags: [better-auth, drizzle, postgres, rate-limit, account-lockout, cli]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Next.js 16 + better-auth 골격, domain/viewer.ts, domain/auth/accounts.ts(createAccount), repositories/users.ts, lib/env.ts, lib/log.ts"
provides:
  - "scripts/account-cli.ts — create|reset|unlock 서브커맨드 CLI(로컬 tsx, 01-06 Cloud Run Job 번들 공용)"
  - "domain/auth/accounts.ts에 resetPassword·unlockAccount 추가"
  - "login_attempts 표 + 잠금 훅(before/after) — 15분 창 5회 실패 잠금, 성공 시 초기화, 관리자 즉시 해제"
  - "better-auth rateLimit(DB 저장) /sign-in/email 60초 10회"
  - "lib/client-ip.ts + proxy.ts — x-forwarded-for 마지막 항목을 x-client-ip로 고정하는 단일 IP 규칙"
  - "fail-closed: x-client-ip 없는 로그인 요청은 500 + auth.client_ip_missing 로그"
affects: [01-03, 01-06, 01-07]

# Actuals (#2632)
actuals:
  tokens: 16400
  tasks: 2
  commits: 2
plan_head_before: ae0bf6744cad0f2944cae87b3843972034cd5e35

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "before/after 훅 첫 줄은 항상 ctx.path !== '/sign-in/email' 조기 반환(다른 better-auth 경로에 영향 없음)"
    - "IP 규칙은 lib/client-ip.ts 한 곳 — better-auth·훅·proxy.ts 모두 x-forwarded-for를 직접 읽지 않고 x-client-ip만 읽는다"
    - "repositories 계층 함수 첫 인자는 항상 viewer(01-01 규칙 유지, login_attempts에도 적용)"

key-files:
  created:
    - scripts/account-cli.ts
    - db/schema/login-attempts.ts
    - db/migrations/0001_login_attempts.sql
    - db/migrations/0002_rate_limits_id_column.sql
    - repositories/login-attempts.ts
    - domain/auth/lockout.ts
    - domain/auth/hooks.ts
    - lib/client-ip.ts
    - proxy.ts
    - test/unit/lockout.test.ts
    - test/unit/client-ip.test.ts
    - test/unit/account-cli.test.ts
    - test/integration/lockout.test.ts
    - test/integration/rate-limit.test.ts
  modified:
    - domain/auth/accounts.ts
    - lib/auth.ts
    - db/schema/auth.ts
    - db/schema/index.ts
    - test/integration/auth.test.ts

key-decisions:
  - "better-auth 1.7.5의 drizzle-adapter 스키마 검사기(schema-diff.mjs)는 어댑터가 실제로 쓰지 않는 rate_limits 모델에도 예외 없이 id 컬럼 존재를 요구하고, 실제 insert에도 문자열 id를 채운다 — rate_limits.id를 uuid로 뒀다가 22P02(invalid input syntax for uuid)로 실패해 text로 정정(0002 마이그레이션, 실측)"
  - "advanced.ipAddress.ipAddressHeaders를 x-forwarded-for에서 x-client-ip로 교체 — better-auth 1.7.5는 헤더 값이 쉼표로 2개 이상이면 trustedProxies 없이 IP를 null로 보고 공용 rateLimit 버킷(no-trusted-ip|path)에 묶는다(소스 node_modules/@better-auth/core/dist/utils/ip.mjs 확인). Cloud Run 뒤에서 x-forwarded-for를 직접 읽으면 클라이언트가 위조 항목 하나만 끼워 넣어도 전 직원이 분당 10회를 나눠 쓰는 조용한 DoS가 된다"
  - "Task 순서를 실행 편의상 뒤바꿈(Task 2 먼저, Task 1 나중) — Task 1의 unlockAccount가 Task 2의 repositories/login-attempts.ts를 import하므로, 먼저 만들면 중간에 컴파일 안 되는 상태를 거치지 않아도 됨. 플랜이 이미 이 순서 교환을 명시적으로 허용함(\"순서를 바꿔 Task 2를 먼저 해도 된다\"). 커밋도 그 순서(feat 9658b5e = 원래 Task 2 범위, feat 9892c94 = 원래 Task 1 범위)로 남음 — 완료된 작업의 실질 내용은 플랜과 동일"
  - "[Rule 1 - Bug] createAccount에 이메일 중복 사전 확인 추가 — 사전 확인 없이 DB unique 제약에만 맡기면 관리자 CLI 사용자에게 원시 DrizzleQueryError(SQL·파라미터 포함)가 그대로 노출됨. 실제 실행 확인(중복 계정 생성 2회) 중 발견, findUserByEmail로 존재 여부를 먼저 확인해 '이미 존재하는 이메일입니다: <email>' 메시지로 교체"
  - "domain/auth/accounts.ts·scripts/account-cli.ts의 plan `<files>` 목록이 `test/integration/accounts.test.ts`를 가리키지만, 01-01이 이미 같은 목적의 파일을 `test/integration/auth.test.ts`로 만들어뒀다 — 새 파일을 만들지 않고 기존 파일에 resetPassword·unlockAccount 테스트를 추가(CLAUDE.md '기존 컨벤션 우선')"
  - "domain/auth/hooks.ts의 fail-closed 검사(x-client-ip 없으면 500)로 인해 01-01이 만든 auth.test.ts의 기존 sign-in 테스트 5곳이 깨짐 — 플랜 action 8이 이미 예견한 대로(\"모든 sign-in 통합 테스트는 x-client-ip를 반드시 넣는다\") 전부 x-client-ip 헤더를 추가해 수정. rateLimit(60초 10회)과 겹치지 않도록 파일 안에서 IP를 순차 발급하는 nextTestIp() 헬퍼 도입"

requirements-completed: [AUTH-01, AUTH-03]

coverage:
  - id: D1
    description: "pnpm account:create --email E --name N [--admin]는 계정을 만들고 임시 비밀번호를 stdout에 정확히 한 번 출력한다"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "test/unit/account-cli.test.ts#parseArgs"
        status: pass
      - kind: other
        ref: "pnpm account:create --email dev-admin@example.test --name 관리자 --admin (실제 실행, 출력된 임시 비밀번호로 curl sign-in 200 확인)"
        status: pass
    human_judgment: false
  - id: D2
    description: "pnpm account:reset --email E는 새 임시 비밀번호를 출력하고 그 사용자의 모든 세션을 만료시키며 password_is_temporary=true로 만든다"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "test/integration/auth.test.ts#재발급 뒤 옛 비밀번호는 실패, 새 임시 비밀번호는 성공, 기존 세션은 무효, password_is_temporary=true"
        status: pass
      - kind: other
        ref: "pnpm account:reset --email dev-admin@example.test (실제 실행, 옛 비밀번호 401·새 비밀번호 200 curl로 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "같은 이메일로 15분 창 안에 5회 실패하면 6회째는 올바른 비밀번호여도 거부된다 — DB 기반이라 인스턴스 무관"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "test/integration/lockout.test.ts#A: 5회 실패 → 6회째 거부 → 창 만료 뒤 성공 → 열린 실패 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "5회 실패 중 가장 오래된 것이 15분보다 오래되면 잠금이 풀리고, 성공은 열린 실패 기록을 resolved_reason=success로 닫는다"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "test/integration/lockout.test.ts#A: 5회 실패 → 6회째 거부 → 창 만료 뒤 성공 → 열린 실패 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "pnpm account:unlock --email E는 열린 실패 기록을 resolved_reason=admin_unlock으로 닫고 auth.unlock 로그를 남긴다; 잠금 발생 시 auth.lockout 로그가 남는다"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "test/integration/lockout.test.ts#B: 5회 실패 → 잠금 → unlockAccount → 즉시 로그인 성공(resolved_reason=admin_unlock)"
        status: pass
      - kind: integration
        ref: "test/integration/lockout.test.ts#D: 5회째 실패에 auth.lockout 이벤트가 정확히 1회, ip는 보낸 x-client-ip와 같다"
        status: pass
    human_judgment: false
  - id: D6
    description: "같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 /sign-in/email을 부르면 429가 온다 — IP는 x-forwarded-for의 마지막 항목을 proxy.ts가 x-client-ip로 고정한 값"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "test/integration/rate-limit.test.ts#같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 부르면 429가 온다"
        status: pass
      - kind: unit
        ref: "test/unit/client-ip.test.ts#proxy.ts"
        status: pass
      - kind: other
        ref: "curl -H 'X-Forwarded-For: 203.0.113.7, 198.51.100.9' 실제 실행 후 psql로 login_attempts.ip = 198.51.100.9 확인"
        status: pass
    human_judgment: false
  - id: D7
    description: "존재하지 않는 이메일도 6회째에 같은 잠금 문구로 거부된다(계정 존재 여부 비노출)"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "test/integration/lockout.test.ts#C: 존재하지 않는 이메일도 6회째에 같은 잠금 문구로 거부된다(존재 여부 비노출)"
        status: pass
    human_judgment: false
  - id: D8
    description: "x-client-ip 없는 /sign-in/email 요청은 fail-closed로 500과 auth.client_ip_missing 로그를 남긴다(공용 rateLimit 버킷으로 조용히 흘러가지 않음)"
    verification:
      - kind: integration
        ref: "test/integration/rate-limit.test.ts#x-client-ip 없이 x-forwarded-for만 있으면 500 계열 + auth.client_ip_missing 로그(fail-closed)"
        status: pass
    human_judgment: false

duration: 65min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 2: 계정 CLI + 계정 잠금·IP 속도 제한 Summary

**관리자 CLI(create/reset/unlock)와 DB 기반 계정 잠금(15분 창 5회 실패)·IP 속도 제한(60초 10회)을 better-auth 훅으로 구현하고, Cloud Run 프록시 뒤에서 위조 불가능한 x-client-ip 단일 IP 규칙(proxy.ts)으로 고정했다.**

## Performance

- **Duration:** 65 min
- **Started:** 2026-09-18T07:29:00Z (세션 시작, git status 확인 시점 추정)
- **Completed:** 2026-09-18T08:34:00Z
- **Tasks:** 2 (플랜의 Task 1·2, 의존성 때문에 Task 2 → Task 1 순서로 실행 — 플랜이 명시적으로 허용)
- **Files modified:** 22 (5 modified, 14 created 신규 소스·테스트, 3 migration meta 신규)

## Accomplishments

- `scripts/account-cli.ts`: create/reset/unlock 서브커맨드, 01-06 Cloud Run Job의 `--args` 쉼표 목록과 동일한 argv 규약, 임시 비밀번호는 stdout 한 줄에만 출력(D-11)
- `domain/auth/accounts.ts`에 `resetPassword`(전 세션 만료 + `password_is_temporary=true`)·`unlockAccount` 추가
- `login_attempts` 표(마이그레이션 0001, 확장 전용) + `domain/auth/hooks.ts`의 before/after 훅 — 15분 창 5회 실패 잠금, 성공 시 초기화, 관리자 즉시 해제, 계정 존재 여부 비노출
- better-auth `rateLimit`(DB 저장) `/sign-in/email` 60초 10회 — `lib/client-ip.ts` + `proxy.ts`가 `x-forwarded-for` 마지막 항목을 `x-client-ip`로 고정해 IP 위조를 막음(Eng Issue 1)
- fail-closed: `x-client-ip` 없는 로그인 요청은 500 + `auth.client_ip_missing` 로그(better-auth의 조용한 공용 버킷 폴백 대신)
- 통합 테스트 3파일(lockout, rate-limit, auth 확장) + 단위 테스트 3파일(lockout, client-ip, account-cli) — 전부 실제 Postgres 위에서 실행 확인, 개발 서버·curl·psql로 실측까지 완료

## Task Commits

1. **Task 2: login_attempts 잠금 훅 + IP 속도 제한 + 행동 로그 이벤트** — `9658b5e` (feat) — 의존 관계상 먼저 실행(unlockAccount가 이 Task의 repository를 import)
2. **Task 1: 계정 CLI — create / reset / unlock** — `9892c94` (feat)

**Plan metadata:** (이 커밋 다음에 기록됨)

## Files Created/Modified

- CLI: `scripts/account-cli.ts`
- 도메인: `domain/auth/accounts.ts`(+resetPassword·unlockAccount), `domain/auth/lockout.ts`, `domain/auth/hooks.ts`
- 리포지토리: `repositories/login-attempts.ts`
- DB: `db/schema/login-attempts.ts`, `db/schema/auth.ts`(rate_limits.id 추가), `db/schema/index.ts`, `db/migrations/0001_login_attempts.sql`, `db/migrations/0002_rate_limits_id_column.sql`
- IP·프록시: `lib/client-ip.ts`, `proxy.ts`
- 설정: `lib/auth.ts`(+hooks, rateLimit, ipAddressHeaders 교체)
- 테스트: `test/unit/{lockout,client-ip,account-cli}.test.ts`, `test/integration/{lockout,rate-limit}.test.ts`, `test/integration/auth.test.ts`(확장 + 기존 sign-in 테스트에 x-client-ip 추가)

## Decisions Made

frontmatter `key-decisions` 참조. 핵심은 (1) better-auth 1.7.5의 rate_limits 스키마 검사·insert 요구가 `id` 컬럼(text, DB 기본값 없이 어댑터가 직접 채움)을 예외 없이 요구한다는 실측, (2) `x-forwarded-for`를 better-auth에 직접 물리면 값이 2개 이상일 때 IP가 null로 떨어져 전 직원이 공용 rateLimit 버킷을 나눠 쓰는 조용한 DoS가 된다는 실측(그래서 `proxy.ts` + `x-client-ip` 단일 헤더 규칙), (3) Task 순서를 의존성에 맞게 교환(플랜이 명시적으로 허용), (4) 파일명 불일치(`accounts.test.ts` 계획 vs 실제 `auth.test.ts`) 해소.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] rate_limits 테이블에 id 컬럼 추가(마이그레이션 0002)**
- **Found during:** Task 2 (lockout·rate-limit 통합 테스트 최초 실행 — `Drizzle schema mismatch: Missing columns rateLimits.id`)
- **Issue:** better-auth 1.7.5의 drizzle-adapter 스키마 검사기(`@better-auth/core/dist/db/schema-diff.mjs`)가 이 어댑터가 필드로 선언하지 않은 rate_limits 모델에도 무조건 `id` 컬럼을 요구하고, 실제 insert에도 문자열 id를 채운다(01-01의 `rate_limits(key, count, lastRequest)` 스키마로는 `rateLimit.storage: "database"`를 켜자마자 모든 `/sign-in/email` 요청이 실패)
- **Fix:** `db/schema/auth.ts`의 `rateLimits`에 `id: text("id").notNull()` 추가(처음엔 `uuid().defaultRandom()`으로 시도했으나 better-auth가 nanoid류 문자열을 직접 넣어 `22P02 invalid input syntax for uuid`로 실패 — text로 정정). 확장 전용 별도 마이그레이션 `0002_rate_limits_id_column.sql`(0001과 분리, 0001은 CREATE TABLE만 유지)
- **Files modified:** db/schema/auth.ts, db/migrations/0002_rate_limits_id_column.sql, db/migrations/meta/{_journal.json,0002_snapshot.json}
- **Verification:** lockout·rate-limit 통합 테스트 전체 통과
- **Committed in:** 9658b5e

**2. [Rule 1 - Bug] console.log 스파이 후 mockRestore() 순서로 테스트 자체가 거짓 실패**
- **Found during:** Task 2 (lockout.test.ts D블록·rate-limit.test.ts fail-closed 테스트 최초 실행 — 실제 로그는 찍혔는데 `logSpy.mock.calls`가 항상 빈 배열)
- **Issue:** vitest의 `mockRestore()`는 원래 구현 복원과 함께 `mock.calls`도 초기화한다 — `finally { logSpy.mockRestore(); }` 뒤에 `logSpy.mock.calls`를 읽으면 항상 0건. (실제 `auth.lockout`·`auth.client_ip_missing` 로그는 정상적으로 찍히고 있었음 — 디버그 스크립트로 실제 동작 확인 후 원인 특정)
- **Fix:** `mockRestore()` 호출 전에 `[...logSpy.mock.calls]`로 복사해두고 그 복사본을 단언에 사용
- **Files modified:** test/integration/lockout.test.ts, test/integration/rate-limit.test.ts
- **Verification:** 두 테스트 모두 통과(auth.lockout 1회, auth.client_ip_missing 존재 확인)
- **Committed in:** 9658b5e

**3. [Rule 1 - Bug] fail-closed 훅 도입으로 01-01의 기존 sign-in 통합 테스트 5곳이 깨짐**
- **Found during:** Task 1 (accounts test 확장 뒤 전체 통합 테스트 재실행)
- **Issue:** `domain/auth/hooks.ts`의 before 훅이 `x-client-ip` 없는 `/sign-in/email` 요청을 전부 500으로 거부하게 되어, 01-01이 만든 `auth.test.ts`의 기존 sign-in 호출(헤더 없음) 5곳이 전부 실패
- **Fix:** 플랜 action 8이 이미 예견한 대로("모든 sign-in 통합 테스트는 x-client-ip를 반드시 넣는다") 5곳 전부에 `x-client-ip` 헤더 추가. rateLimit(60초 10회)과 겹치지 않게 파일 안에서 IP를 순차 발급하는 `nextTestIp()` 헬퍼 도입
- **Files modified:** test/integration/auth.test.ts
- **Verification:** `pnpm test:integration` 전체 통과(20/20)
- **Committed in:** 9658b5e (기존 테스트 수정분), 9892c94 (신규 테스트 추가분)

**4. [Rule 1 - Bug] createAccount 중복 이메일 시 원시 SQL 에러 노출**
- **Found during:** Task 1 (acceptance criteria 실제 실행 확인 — 같은 이메일로 `pnpm account:create` 2회 실행)
- **Issue:** 사전 존재 확인 없이 DB unique 제약에만 맡기면 관리자 CLI 사용자에게 `Failed query: insert into "users" (...) params: ...` 형태의 원시 DrizzleQueryError가 그대로 노출됨(exit 1은 맞았으나 메시지가 "already exists" 류가 아님)
- **Fix:** `findUserByEmail`로 사전 확인 후 `이미 존재하는 이메일입니다: <email>` 메시지로 throw
- **Files modified:** domain/auth/accounts.ts
- **Verification:** `pnpm account:create --email x --name x`를 두 번 실행 → 두 번째는 exit 1 + "이미 존재하는 이메일입니다" 메시지 확인(실제 실행)
- **Committed in:** 9892c94

**5. [Rule 3 - Blocking] lib/auth.ts·domain/auth/hooks.ts 주석에 있던 "x-forwarded-for" 리터럴 제거**
- **Found during:** Task 2 acceptance criteria grep 검증(`grep -c 'x-forwarded-for' lib/auth.ts domain/auth/hooks.ts`가 파일마다 0이어야 함)
- **Issue:** 설계 이유를 설명하는 한국어 주석에 "x-forwarded-for" 문자열을 그대로 써서 grep 카운트가 1씩 나옴(코드 동작에는 영향 없음, 검증 스크립트만 실패)
- **Fix:** 주석 문구를 "원본 포워딩 헤더(XFF)"로 바꿔 리터럴 문자열을 없앰
- **Files modified:** lib/auth.ts, domain/auth/hooks.ts
- **Verification:** `grep -c 'x-forwarded-for' lib/auth.ts domain/auth/hooks.ts` → 파일마다 0
- **Committed in:** 9658b5e

### 계획과 다르게 실행한 것(버그 수정 아님)

- **파일명:** 플랜은 `test/integration/accounts.test.ts`를 지목했지만 01-01이 이미 `test/integration/auth.test.ts`에 같은 목적의 테스트를 만들어뒀다. 새 파일을 만들지 않고 기존 파일을 확장했다(CLAUDE.md "기존 컨벤션 우선" · "요청받지 않은 파일 이동 금지").
- **Task 순서:** 플랜은 Task 1 → Task 2 순서로 적혀 있지만, Task 1의 `unlockAccount`가 Task 2의 `repositories/login-attempts.ts`를 import하므로 Task 2를 먼저 구현·커밋했다. 플랜 본문이 이 교환을 명시적으로 허용한다("순서를 바꿔 Task 2를 먼저 해도 된다"). 완료된 작업 내용은 플랜과 동일하고, 커밋 메시지에 각 커밋이 원래 어느 Task 범위인지 표기했다.

---

**Total deviations:** 5 auto-fixed (3 Rule 1 - 버그, 2 Rule 3 - 차단 이슈) + 2 계획 대비 실행 순서/파일명 조정(버그 아님, 플랜이 허용)
**Impact on plan:** 전부 정확성·보안(IP 위조 방지)·CLI 사용성에 필수적인 수정이며, 승인된 아키텍처·의존성 목록을 벗어나지 않았다. 범위 확장 없음.

## Issues Encountered

None beyond the deviations documented above — each was found, root-caused(디버그 스크립트로 vitest 밖 실제 동작 확인 포함), fixed, and re-verified within this plan's own execution loop.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AUTH-01(잠금·해제·속도 제한)·AUTH-03(관리자 재발급) 두 요구사항 모두 실제 Postgres 위 통합 테스트 + 개발 서버 curl·psql 실측으로 증명됨
- `x-client-ip` 헤더 규칙(`proxy.ts` → `lib/client-ip.ts`)이 확립되어, 01-07 Task 3(배포 URL에서 위조 XFF 11회 → 429 실측)이 그대로 재사용 가능
- `db/migrations`는 0000·0001·0002까지 순서대로 존재, 전부 확장 전용(DROP/ALTER 없음 — 0002는 ADD COLUMN 하나뿐)
- 01-06(Cloud Run Job 배포)이 `scripts/account-cli.ts`를 esbuild로 번들할 때 `import.meta.url` 가드·`next` 미의존을 그대로 재사용 가능
- `pnpm build`·`pnpm lint`·`pnpm typecheck`·`pnpm test`(unit/integration/e2e) 전부 통과 확인(이 플랜 종료 시점)

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*

## Self-Check: PASSED

- All 14 newly created files verified present on disk (`[ -f ]`, 0 missing): scripts/account-cli.ts, db/schema/login-attempts.ts, db/migrations/{0001_login_attempts.sql,0002_rate_limits_id_column.sql}, repositories/login-attempts.ts, domain/auth/{lockout.ts,hooks.ts}, lib/client-ip.ts, proxy.ts, test/unit/{lockout,client-ip,account-cli}.test.ts, test/integration/{lockout,rate-limit}.test.ts.
- Both task commits verified in `git log --oneline`: `9658b5e`, `9892c94`.
- All plan-level `<acceptance_criteria>` for Task 1 and Task 2 re-run and passing (see body above and Deviations section).
- Plan-level `<verification>` re-run: `pnpm db:migrate && pnpm test:unit && pnpm test:integration` — all exit 0 (29 unit + 20 integration passing); `pnpm test:e2e` — 3/3 passing (fail-closed hook does not break the real browser login flow through proxy.ts); `pnpm build` — succeeds, `.next` output shows `ƒ Proxy (Middleware)` confirming proxy.ts is picked up; `pnpm typecheck` and `pnpm lint` — both clean.
- Real execution confirmed (not just tests): `pnpm account:create`/`account:reset` against a running `pnpm dev` server + curl sign-in (200/401 as expected); `X-Forwarded-For: 203.0.113.7, 198.51.100.9` curl request confirmed via `psql` that `login_attempts.ip` recorded the last XFF entry (`198.51.100.9`), proving the proxy → hook path is wired end to end.
