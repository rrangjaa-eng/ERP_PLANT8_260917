---
phase: 01-deploy-skeleton-login
plan: 05
subsystem: infra
tags: [docker, esbuild, cloud-sql-connector, drizzle, cloud-run, pool-rule]

# Dependency graph
requires:
  - phase: 01-01
    provides: "package.json build:cli 스크립트 계약, scripts/migrate-runner.ts main() 구조, lib/env.ts(MAX_INSTANCES·DB_POOL_MAX·DB_NAME·DB_IAM_USER·DB_ADMIN_PASSWORD·DB_ADMIN_URL·CLOUD_SQL_CONNECTION_NAME), db/client.ts(Cloud SQL 커넥터 스위칭 패턴)"
  - phase: 01-02
    provides: "scripts/account-cli.ts(import.meta.url 가드 패턴, CLI 번들 진입점 3개 중 하나)"
  - phase: 01-04
    provides: "eslint boundaries(domain/scripts 경계), pnpm lint/typecheck 통과 상태 — 이 플랜의 새 코드가 지켜야 할 기준선"
provides:
  - "Dockerfile — node:24-slim 멀티스테이지(deps→build→runtime), 같은 이미지가 서버(node server.js)와 CLI 번들 셋을 담는다(OPS-01, Issue 4)"
  - ".dockerignore — node_modules·.next·dist·.env·.git·test·.planning·docs·gha-creds-*.json 제외"
  - "scripts/build-cli.mjs — esbuild ESM 번들러(migrate-runner·account-cli·db-bootstrap), packages: external(실측으로 정정, 아래 결정 참조)"
  - "scripts/db-bootstrap.ts — buildBootstrapSql + main(): postgres 관리자 경로(DB_ADMIN_URL 또는 Connector AuthTypes.PASSWORD)로 IAM 런타임 사용자에게 DB·public 스키마 소유권 이양, 멱등"
  - "domain/ops/pool-rule.ts — checkPoolRule·parsePoolEnv·PoolRuleInputError(16A 커넥션 규칙, 정수 산술·경계 명시)"
  - "scripts/migrate-runner.ts 확장 — SHOW max_connections 실측 → checkPoolRule → exit 0/1/3 계약"
affects: [01-06, 01-07, 01-08]

# Actuals (#2632)
actuals:
  tokens: 7000
  tasks: 2
  commits: 2
plan_head_before: 22515ad

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI 번들은 esbuild `packages: 'external'`로 첫 파티 코드만 번들하고 node_modules는 이미 같은 이미지의 .next/standalone/node_modules(Next.js trace가 db/client.ts·domain/system-status를 통해 이미 포함)를 공유해서 쓴다 — 대형 gRPC 계열(@google-cloud/sql/google-gax) 풀 번들은 Node 22/24에서 런타임 크래시를 낸다(실측, 아래 결정 참조)"
    - "관리 DB 경로(db-bootstrap)는 db/client.ts의 공유 싱글턴 pool을 쓰지 않고 그룹(postgres→dbName)마다 새 Pool을 열고 닫는다 — 앱 경로(IAM)와 물리적으로 분리"
    - "16A 검사는 domain/ops/pool-rule.ts 순수 함수 + migrate-runner.ts의 실측 SHOW max_connections 조합 — 하드코딩 상수를 쓰지 않는다"

key-files:
  created:
    - Dockerfile
    - .dockerignore
    - scripts/build-cli.mjs
    - scripts/db-bootstrap.ts
    - domain/ops/pool-rule.ts
    - test/unit/dockerfile.test.ts
    - test/unit/db-bootstrap-sql.test.ts
    - test/unit/pool-rule.test.ts
    - test/integration/db-bootstrap.test.ts
    - test/integration/migrate-runner.test.ts
  modified:
    - scripts/migrate-runner.ts

key-decisions:
  - "[Rule 1 - Bug] build-cli.mjs의 esbuild 옵션을 `external: ['pg-native']`에서 `packages: 'external'`로 정정 — 플랜이 지정한 원안대로 빌드하면 dist/cli/*.mjs가 11~13MB로 부풀고, `node --env-file=.env.local dist/cli/migrate-runner.mjs` 실제 실행 시 Node 22.22.2가 'Cannot determine intended module format because both require() and top-level await are present'로 즉시 크래시했다(google-gax/@google-cloud/sql의 대형 gRPC 코드베이스를 esbuild가 단일 ESM 파일로 인라인하면서 발생, 실측 확인). 이 패키지들은 이미 Next 앱(app/admin/system-status → domain/system-status → lib/gcp/cloud-sql-admin.ts, db/client.ts)이 실제로 써서 `.next/standalone/node_modules`에 pnpm trace로 포함되고, 같은 이미지 안에서 dist/cli는 standalone과 같은 /app 루트에서 실행되므로(Node 모듈 해석이 상위 디렉터리로 올라간다) external로 둬도 런타임에 정상 resolve된다 — 실제로 `node --env-file=.env.local dist/cli/migrate-runner.mjs` exit 0을 로컬 DB로 확인했다. 번들 크기도 11~13MB → 8~21KB로 줄었다"
  - "scripts/db-bootstrap.ts의 CREATE DATABASE는 buildBootstrapSql()의 순수 함수 출력에 넣지 않고 main()의 별도 단계(ensureDatabaseExists)로 분리 — buildBootstrapSql은 존재 여부를 알 수 없는 순수 함수이고, CREATE DATABASE는 트랜잭션 밖 단일 문장이어야 하며 두 번 실행하면 실패하므로 존재 확인 뒤에만 실행해야 한다. buildBootstrapSql은 항상 멱등한 ALTER DATABASE ... OWNER TO 문만 반환한다(CREATE보다 안전 — DB가 방금 생겼든 이미 있든 동일하게 동작)"
  - "db-bootstrap 통합 테스트는 db/client.ts의 공유 db 싱글턴을 쓰지 않고 vi.resetModules() + 동적 import로 DB_ADMIN_URL·DB_NAME·DB_IAM_USER를 테스트 전용 값으로 주입 — lib/env.ts가 모듈 최상위에서 한 번만 파싱되는 싱글턴이라 process.env를 먼저 바꾸고 재import해야 한다(test/unit/env.test.ts의 기존 패턴과 동일)"

requirements-completed: [OPS-01, OPS-02]

coverage:
  - id: D1
    description: "같은 컨테이너 이미지가 Next.js standalone 서버와 CLI 번들 셋(migrate-runner·account-cli·db-bootstrap)을 담고, Dockerfile은 node:24-slim 멀티스테이지(deps→build→runtime)·비루트 실행·corepack 미사용·인프라 플래그 없음이다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/dockerfile.test.ts (15 tests)"
        status: pass
      - kind: other
        ref: "docker info 실패(이 클라우드 세션에 데몬 없음) — 실제 이미지 빌드는 01-07 GitHub Actions에서 처음 일어남(플랜에 이미 명시)"
        status: pass
    human_judgment: false
  - id: D2
    description: "esbuild 번들이 migrate-runner·account-cli·db-bootstrap 3개를 만들고 next를 끌어오지 않으며, migrate-runner 번들이 로컬 DB에 실제로 exit 0으로 동작한다"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "pnpm build:cli → ls dist/cli/{migrate-runner,account-cli,db-bootstrap}.mjs 존재, grep -c 'from \"next' 파일마다 0, node --env-file=.env.local dist/cli/migrate-runner.mjs exit 0(실제 실행), node dist/cli/account-cli.mjs exit 2(인자 파싱 실제 동작 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "db-bootstrap이 postgres 관리 사용자로 한 번 붙어 IAM 런타임 사용자에게 DB(erp)·public 스키마 소유권을 주고, 재실행해도 같은 결과다(6A)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/db-bootstrap-sql.test.ts (3 tests) — buildBootstrapSql 구조·이스케이프"
        status: pass
      - kind: integration
        ref: "test/integration/db-bootstrap.test.ts#DB 소유권을 부여하고 재실행해도 멱등하다 — 실제 로컬 Postgres에 CREATE ROLE bootstrap_iam_test 만들고 main() 2회 실행, pg_database.datdba·pg_namespace.nspowner로 소유권 확인"
        status: pass
    human_judgment: false
  - id: D4
    description: "migrate-runner가 마이그레이션 전에 실제 DB의 SHOW max_connections를 읽어 max-instances × pool ≤ max_connections − 5를 검사하고, 위반이면 exit 3으로 배포를 멈춘다(16A, A2 — 하드코딩 25를 믿지 않는다)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/pool-rule.test.ts (13 tests) — 경계(20<=20 허용, 20>19 거부)·정수 검증·parsePoolEnv"
        status: pass
      - kind: integration
        ref: "test/integration/migrate-runner.test.ts (3 tests) — 자식 프로세스로 실제 실행: MAX_INSTANCES=1000/5 → exit 3 + deploy.pool_rule_violation, 1/1 → exit 0 + db.max_connections(실측값 100), 미설정 → exit 0 + db.pool_rule_skipped"
        status: pass
    human_judgment: false
  - id: D5
    description: "컨테이너는 min-instances 0 전제의 standalone 이미지이며 비루트 사용자(USER app)로 실행된다(OPS-02) — 실제 비용 확인은 청구서 의존이라 이 플랜 범위 밖"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "test/unit/dockerfile.test.ts#비루트 USER로 실행하고 3000 포트로 server.js를 실행한다"
        status: pass
    human_judgment: true
    rationale: "'비용이 0에 가깝다'의 실제 확인은 청구서 의존이라 코드로 증명할 수 없다 — 플랜 Flagged Assumptions에 이미 명시된 대로 이미지 속성(비루트·standalone)만 이 플랜에서 보증하고, 실제 금액 확인은 01-08 문서 태스크와 사용자 청구서 확인(수동)에 남긴다"

duration: 14min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 5: 컨테이너 이미지 + 16A 커넥션 규칙 Summary

**node:24-slim 멀티스테이지 Dockerfile(같은 이미지가 서비스+Job 3개를 담는다)과 esbuild CLI 번들러, DB 소유권 부트스트랩 Job, migrate-runner의 실측 SHOW max_connections 기반 16A 커넥션 규칙 검사(exit 0/1/3)를 로컬 Postgres 통합 테스트로 증명했다.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-18T09:22:00Z (추정 — 직전 커밋 22515ad 09:21:59 직후)
- **Completed:** 2026-09-18T09:36:02Z
- **Tasks:** 2
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments

- `Dockerfile`: `node:24-slim` 멀티스테이지(`base`→`deps`→`build`→`runtime`), `pnpm install --frozen-lockfile --ignore-scripts`(공급망, T-1-SC2), 빌드 전용 더미 env(lib/env.ts 파싱용, 런타임엔 Cloud Run이 덮어씀), `USER app` 비루트, `CMD ["node", "server.js"]`. `.dockerignore`에 `gha-creds-*.json`(T-1-SC3) 포함
- `scripts/build-cli.mjs`: esbuild ESM 번들 3개(migrate-runner·account-cli·db-bootstrap) + 빌드 후 `next` 미의존 검사. **실측으로 esbuild 옵션을 원안(`external: ['pg-native']`)에서 `packages: 'external'`로 정정**(아래 Deviations) — google-gax 계열 대형 gRPC 코드베이스를 단일 파일로 인라인하면 Node가 런타임에 크래시하는 것을 실제 실행으로 발견·수정
- `scripts/db-bootstrap.ts`: `buildBootstrapSql`(role 존재 검사 DO 블록 + `GRANT ... TO CURRENT_USER` + `ALTER DATABASE ... OWNER TO`, 둘째 그룹은 `ALTER SCHEMA public OWNER TO` + `GRANT ALL ON SCHEMA public`) + `main()`(DB_ADMIN_URL 또는 Connector `AuthTypes.PASSWORD` 관리 경로, 존재 확인 뒤 `CREATE DATABASE`, 비밀번호는 로그 금지). 실제 로컬 Postgres로 생성·소유권 이양·재실행 멱등까지 통합 테스트로 증명
- `domain/ops/pool-rule.ts`: `checkPoolRule`(경계 `used <= limit` 허용, 정수만, 반올림 없음)·`parsePoolEnv`(정수 문자열만, `MAX_INSTANCES` 미설정 시 호출자가 스킵 판단하도록 throw)
- `scripts/migrate-runner.ts` 확장: `MAX_INSTANCES` 설정 시 실제 `SHOW max_connections`를 읽어(`db.max_connections` 로그) `checkPoolRule` 검사 → 위반 시 `deploy.pool_rule_violation` + exit 3, `PoolRuleInputError`면 `deploy.pool_rule_input_error` + exit 3, 미설정이면 `db.pool_rule_skipped` + 통과. 자식 프로세스 통합 테스트 3개로 exit 0/3 두 경로 모두 실제 로컬 DB(max_connections=100 실측)로 확인
- Docker 데몬 없는 클라우드 세션(`docker info` 실패 확인) — Dockerfile 구조·문법은 단위 테스트로 텍스트 검증, 실제 이미지 빌드는 01-07 GitHub Actions에서 처음 일어난다(플랜에 이미 명시)

## Task Commits

1. **Task 1: 컨테이너 이미지 — Dockerfile 멀티스테이지 + esbuild CLI 번들 + db-bootstrap Job 스크립트** - `e072cfa` (feat)
2. **Task 2: 16A 커넥션 규칙 — domain/ops/pool-rule + migrate-runner의 SHOW max_connections 검사** - `b89f89e` (feat)

**Plan metadata:** (이 커밋 다음에 기록됨)

## Files Created/Modified

- 컨테이너: `Dockerfile`, `.dockerignore`
- CLI 번들러: `scripts/build-cli.mjs`
- DB 부트스트랩: `scripts/db-bootstrap.ts`
- 16A 규칙: `domain/ops/pool-rule.ts`, `scripts/migrate-runner.ts`(확장)
- 테스트: `test/unit/{dockerfile,db-bootstrap-sql,pool-rule}.test.ts`, `test/integration/{db-bootstrap,migrate-runner}.test.ts`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심은 (1) esbuild `packages: 'external'`로 정정한 실측 발견(대형 gRPC 코드베이스 풀 번들이 Node 런타임에 크래시), (2) `CREATE DATABASE`를 순수 함수 밖 별도 단계로 분리(존재 확인 뒤에만 실행), (3) db-bootstrap 통합 테스트의 env 재주입 패턴(01-01 `env.test.ts`와 동일).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] esbuild `external: ['pg-native']` → `packages: 'external'`로 정정**
- **Found during:** Task 1 (`node --env-file=.env.local dist/cli/migrate-runner.mjs` 실제 실행 확인 — 플랜의 필수 verify 단계)
- **Issue:** 플랜이 지정한 esbuild 옵션(`external: ['pg-native']`만)대로 빌드하면 `@google-cloud/cloud-sql-connector`의 전이 의존성(`@google-cloud/sql` → `google-gax` → gRPC/protobuf 대형 코드베이스)이 전부 단일 ESM 파일로 인라인되어 11~13MB 번들이 나오고, 실행 시 Node 22.22.2가 `ReferenceError: Cannot determine intended module format because both require() and top-level await are present`로 즉시 크래시했다(esbuild의 CJS interop 래퍼가 이 코드베이스의 동적 require()/optional import 패턴과 ESM 최상위 await(db/client.ts) 조합에서 충돌)
- **Fix:** `external: ['pg-native']`를 `packages: 'external'`로 바꿔 첫 파티 코드(scripts/domain/repositories/db/lib)만 번들하고 node_modules 전체는 런타임 해석에 맡겼다. 이 패키지들은 이미 Next 앱(`app/admin/system-status` → `domain/system-status` → `lib/gcp/cloud-sql-admin.ts`, `db/client.ts`)이 실제로 쓰고 있어 `.next/standalone/node_modules`에 Next의 파일 트레이싱으로 이미 포함되고, 같은 이미지에서 `dist/cli`는 standalone과 같은 `/app` 루트 밑에서 실행되므로(Node 모듈 해석이 상위 디렉터리로 올라간다) 정상 resolve된다
- **Files modified:** scripts/build-cli.mjs
- **Verification:** `pnpm build:cli`(11~13MB → 8~21KB), `node --env-file=.env.local dist/cli/migrate-runner.mjs` exit 0(실제 로컬 DB 마이그레이션 성공), `node dist/cli/account-cli.mjs`(인자 없이) exit 2(정상 사용법 에러), `node dist/cli/db-bootstrap.mjs`(더미 IAM 역할)이 역할 부재 에러로 exit 1(정상 동작 확인, DB 정리함)
- **Committed in:** e072cfa

**2. [Rule 3 - Blocking] test/unit/db-bootstrap-sql.test.ts의 배열 인덱스 접근에 `noUncheckedIndexedAccess` 대응**
- **Found during:** Task 1 (`pnpm typecheck`)
- **Issue:** tsconfig의 `noUncheckedIndexedAccess: true`(01-01 기존 설정) 아래서 `groups[0].database` 같은 접근이 `Object is possibly 'undefined'`(TS2532)로 실패
- **Fix:** `groups[0]`을 변수에 담아 `toBeDefined()` 단언 뒤 옵셔널 체이닝으로 접근
- **Files modified:** test/unit/db-bootstrap-sql.test.ts
- **Verification:** `pnpm typecheck` 0 에러
- **Committed in:** e072cfa

**3. [Rule 3 - Blocking] `parsePoolEnv(process.env)` 타입 불일치 수정**
- **Found during:** Task 2 (`pnpm typecheck`)
- **Issue:** `NodeJS.ProcessEnv`(인덱스 시그니처만 있음)를 `parsePoolEnv`의 명시적 프로퍼티 타입과 직접 매칭할 수 없어 TS2559(weak type 검사) 발생
- **Fix:** `parsePoolEnv({ MAX_INSTANCES: process.env.MAX_INSTANCES, DB_POOL_MAX: process.env.DB_POOL_MAX })`로 명시적 객체 리터럴 전달
- **Files modified:** scripts/migrate-runner.ts
- **Verification:** `pnpm typecheck` 0 에러, 통합 테스트 3개 그대로 통과
- **Committed in:** b89f89e

---

**Total deviations:** 3 auto-fixed (1 Rule 1 - 런타임 버그, 2 Rule 3 - 타입 차단 이슈)
**Impact on plan:** 전부 "번들이 로컬 DB에 실제로 실행된다"는 플랜의 명시적 필수 확인(action 4)을 충족하기 위해 필요했다. esbuild 옵션 변경은 승인된 의존성 목록·아키텍처를 벗어나지 않는 빌드 설정 조정이며, 새 패키지를 추가하지 않았다(CLAUDE.md "새 의존성은 이유+승인" 규칙과 무관). 범위 확장 없음.

## Known Stubs

없음 — 이 플랜은 배포 파이프라인 인프라 코드(Dockerfile·CLI 번들러·부트스트랩·커넥션 규칙)만 다루고 화면/도메인 스텁을 만들지 않는다.

## Issues Encountered

- Docker 데몬이 이 클라우드 세션에 없다(`docker info` 실패 확인, 환경 노트에 이미 예견됨) — Dockerfile 문법·구조는 단위 테스트(`test/unit/dockerfile.test.ts`)로 텍스트 검증했고, 실제 `docker build`는 01-07 GitHub Actions에서 처음 실행된다(플랜에 이미 명시된 계획, 결함 아님)
- 세션 시작 직전(09:21:59, 커밋 22515ad) `app/layout.tsx`에 CI TypeScript 수정이 이미 존재했다 — 이 플랜의 범위 밖(다른 세션/에이전트의 작업)이며 내 작업에 영향 없음, 되돌리지 않았다

## User Setup Required

None - no external service configuration required. 로컬 개발은 `pnpm db:dev && pnpm db:migrate && pnpm build:cli`로 전체 검증 가능.

## Next Phase Readiness

- OPS-01·OPS-02는 이 플랜에서 이미지·CLI 번들·부트스트랩·16A 규칙까지 구현·증명했지만, 두 요구사항을 01-06·01-07·01-08도 공유 선언한다(shared-ID gate) — 마지막 선언 플랜이 끝날 때까지 REQUIREMENTS.md는 `Complete`로 바뀌지 않는다(의도된 동작, `requirements.ready-ids` 확인: 0/2 ready)
- `dist/cli/{migrate-runner,account-cli,db-bootstrap}.mjs`는 `.gitignore`로 빌드 산출물 취급(커밋 안 함) — 01-06의 `deploy.sh`가 CI에서 `pnpm build:cli`를 다시 실행해야 함(01-04 CI의 `pnpm build`만으로는 CLI 번들이 안 생김 — 01-06/01-07이 `pnpm build:cli` 단계를 deploy 워크플로에 추가해야 한다)
- `db-bootstrap`이 쓰는 `AuthTypes.PASSWORD` + `DB_ADMIN_PASSWORD`는 01-06의 db-bootstrap Job에만 주입되어야 한다(threat register T-1-27) — 서비스·migrate Job에는 넣지 않는다
- migrate-runner의 exit 코드 계약(0/1/3)이 확정됐다 — 01-06 `deploy.sh`가 exit 3을 "PoolRuleViolation"으로 구분해 배포를 중단해야 한다(16A, §Error & Rescue `deploy` 행)
- `pnpm build`·`pnpm build:cli`·`pnpm lint`·`pnpm typecheck`·`pnpm test:unit`(133)·`pnpm test:integration`(25) 전부 통과 확인(이 플랜 종료 시점). `pnpm test:e2e`는 이 플랜이 건드리지 않은 영역이라 재실행하지 않았다(Dockerfile·CLI 번들·부트스트랩·pool-rule 코드는 브라우저 흐름과 무관)

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*

## Self-Check: PASSED

- All 11 listed files verified present on disk (`[ -f ]`, 0 missing): Dockerfile, .dockerignore, scripts/build-cli.mjs, scripts/db-bootstrap.ts, domain/ops/pool-rule.ts, scripts/migrate-runner.ts, test/unit/{dockerfile,db-bootstrap-sql,pool-rule}.test.ts, test/integration/{db-bootstrap,migrate-runner}.test.ts.
- Both task commits verified in `git log --oneline --all`: `e072cfa`, `b89f89e`.
- All plan-level `<acceptance_criteria>` for Task 1 and Task 2 re-run and passing (see Deviations section for exact commands/output; dist/cli files exist, `grep -c 'from "next'` = 0 per file, Dockerfile structural greps pass, db-bootstrap.ts has `AuthTypes.PASSWORD`/`DB_ADMIN_URL` with no password in log calls, pool-rule.ts boundary/precision behavior confirmed).
- Plan-level `<verification>` re-run: `pnpm test:unit` (133/133) && `pnpm test:integration` (25/25) && `pnpm build:cli` (exit 0) — all pass; `pnpm lint && pnpm typecheck` — both clean (lint shows only pre-existing eslint-plugin-boundaries deprecation warnings from 01-04, no errors).
- Beyond plan minimum: `pnpm build` (Next.js standalone build) re-run and succeeds after migrate-runner.ts changes — no regression.
- `git status --porcelain` clean at commit time after both task commits; `.planning/config.json` shows `commit_docs: true` so this SUMMARY and STATE/ROADMAP updates will be committed normally (no skip).
