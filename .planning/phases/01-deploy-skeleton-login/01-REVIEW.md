---
phase: 01-deploy-skeleton-login
reviewed: 2026-09-18T19:10:00Z
depth: deep
files_reviewed: 52
files_reviewed_list:
  - proxy.ts
  - app/layout.tsx
  - app/page.tsx
  - app/session-refresh.tsx
  - app/(app)/account/actions.ts
  - app/(app)/account/change-password-form.tsx
  - app/(app)/account/logout-button.tsx
  - app/(app)/account/page.tsx
  - app/(auth)/login/login-form.tsx
  - app/(auth)/login/page.tsx
  - app/admin/system-status/page.tsx
  - app/api/auth/[...all]/route.ts
  - app/api/health/route.ts
  - domain/auth/accounts.ts
  - domain/auth/hooks.ts
  - domain/auth/lockout.ts
  - domain/auth/password.ts
  - domain/auth/provider.ts
  - domain/health.ts
  - domain/ops/pool-rule.ts
  - domain/system-status/index.ts
  - domain/viewer.ts
  - repositories/health.ts
  - repositories/login-attempts.ts
  - repositories/system-status.ts
  - repositories/users.ts
  - db/client.ts
  - db/schema/auth.ts
  - db/schema/index.ts
  - db/schema/login-attempts.ts
  - db/migrations/0000_init.sql
  - db/migrations/0001_login_attempts.sql
  - db/migrations/0002_rate_limits_id_column.sql
  - lib/auth.ts
  - lib/auth-client.ts
  - lib/env.ts
  - lib/client-ip.ts
  - lib/log.ts
  - lib/viewer.ts
  - lib/actions/client.ts
  - lib/gcp/cloud-sql-admin.ts
  - scripts/account-cli.ts
  - scripts/migrate-runner.ts
  - scripts/db-bootstrap.ts
  - scripts/build-cli.mjs
  - scripts/deploy.sh
  - scripts/rollback.sh
  - scripts/promote-guard.sh
  - scripts/bootstrap-gcp.sh
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .github/workflows/account.yml
  - eslint.config.mjs
  - eslint/index.mjs
  - eslint/rules/require-action-client.mjs
  - eslint/rules/repository-viewer-param.mjs
  - eslint/rules/money-boundary.mjs
  - Dockerfile
  - infra/names.sh
findings:
  critical: 1
  warning: 8
  info: 16
  total: 25
status: issues_found
---

# Phase 1: Code Review Report (사후 게이트)

**Reviewed:** 2026-09-18T19:10:00Z
**Depth:** deep
**Files Reviewed:** 52
**Status:** issues_found

심각도 표기: **BLOCKER = Critical(CR-)**, **MAJOR = Warning(WR-)**, **MINOR = Info(IN-)**.
각 항목 끝의 `[고칠 수 있음]`은 코드 수정으로 바로 닫히는 것, `[판단 필요]`는 설계 결정이 먼저 필요한 것.

## Summary

Phase 1 소스(app·domain·repositories·db·lib·scripts·workflows·eslint) 52개 파일을 읽고, better-auth 1.7.5·next-safe-action 8.7.3·Next 16 내부 코드(node_modules)와 단위·통합 테스트, 01-07 배포 로그를 대조해 확인했다. 추측으로 적은 항목은 없다.

핵심 우려는 셋이다.

1. **배포마다 리비전이 2개 생기고, `rollback.sh`는 그 중간 리비전으로 "롤백"한다** (CR-01). `deploy_service`가 잘못된 `BETTER_AUTH_URL`로 100% 트래픽을 먼저 열고 나서 env를 고치므로, 롤백은 같은 이미지 + 로그인 403인 리비전에 도착한다. 프로덕션에서 실제 회귀가 나면 지금의 롤백 절차는 동작하지 않는다.
2. **이메일 대소문자 정규화가 계층마다 다르다** (WR-01). better-auth와 잠금 훅은 소문자로, CLI·domain은 입력 그대로 비교한다. 관리자가 `Kim@plant8.co.kr`처럼 입력하면 reset은 "사용자를 찾을 수 없습니다", unlock은 `resolved=0`으로 조용히 실패한다.
3. **임시 비밀번호가 Cloud Logging과 GitHub Actions 로그에 영구히 남는데, D-08이 배너만 띄우고 강제하지 않아 노출 창이 무한하다** (WR-03). 판단이 필요한 설계 항목이다.

이미 아는 것(/api/health 사유, 카나리 제거, status.url 정본, APP_GIT_SHA 가드, db-bootstrap 커넥터 미종료)은 재보고하지 않았다. 다만 db-bootstrap과 같은 계열의 누수 후보를 WR-08에 묶어 두었다.

인증·세션 경계는 대체로 견고하다: `disableSignUp`, `x-client-ip` 단일 헤더 + fail-closed, before/after 훅이 실패 시에도 실행되는 것(dispatch.mjs:236-245에서 APIError를 잡아 after까지 진행)을 확인했고, D-17의 `notFound()` + `NotAdminError` 이중 방어, `authedActionClient`의 세션 강제, `redirect()`가 next-safe-action에서 프레임워크 오류로 재던져지는 것도 확인했다.

## Critical Issues

### CR-01: 배포마다 리비전 2개가 생겨 `rollback.sh`가 깨진 중간 리비전으로 롤백하고, 배포 직후 로그인 403 창이 생긴다

**File:** `scripts/deploy.sh:417-457`, `scripts/rollback.sh:66-87`
**Issue:**
`deploy_service`는 (1) `gcloud run deploy`로 **계산한** `SERVICE_URL`(`https://<svc>-<project#>.<region>.run.app`)을 `BETTER_AUTH_URL`에 심어 100% 트래픽으로 리비전 A를 만들고, (2) `--to-latest`로 고정한 뒤, (3) `describe --format='value(status.url)'`이 다르면 `gcloud run services update --update-env-vars=BETTER_AUTH_URL=<status.url>`로 리비전 B를 만든다.

이 프로젝트에서는 실제 `status.url`이 항상 `*-du.a.run.app` 대체 호스트명이라(01-07-DEPLOY-LOG run #14, deploy.sh 440-449 주석, 단위 테스트 `deploy-sh.test.ts:177-193`·`204-256`이 두 시나리오 모두에서 `services update` 호출을 **기대**한다) 분기 (3)은 **모든 배포에서** 발동한다. 결과:

- **리비전 A가 100%로 서빙되는 동안(1~2분) `BETTER_AUTH_URL ≠ 실제 Origin`** → better-auth Origin 검사로 `/api/auth/sign-in/email`이 403. 스크립트 자신도 이를 `SmokeFailed(origin)`으로 정의하고 있다(517행). 배포 중 로그인하는 직원은 실패를 본다.
- **`rollback.sh`는 "서빙 리비전보다 하나 오래된 리비전"을 고른다**(71-80행). 서빙 = B, 그 바로 앞 = 같은 배포의 A(같은 이미지, 잘못된 URL). 즉 롤백을 실행하면 코드는 그대로이고 로그인만 깨진다. `rollback-sh.test.ts`의 픽스처(`["v3","v2","v1"]`)는 배포당 리비전 1개를 가정해 이 상황을 모델링하지 못한다.

**Impact:** 프로덕션에서 실제 회귀 시 롤백 절차가 작동하지 않는다(현재 설계가 "자동 롤백 없음 → rollback.sh 수동"이므로 유일한 복구 경로가 무효). 배포마다 로그인 403 창이 생긴다.

**Fix:** `[고칠 수 있음]`
1. `deploy_service`에서 `EXISTS=1`이면 **배포 전에** `status.url`을 읽어 `SERVICE_URL`을 확정하고 그 값으로 한 번만 배포한다(리비전 1개). 첫 배포(`EXISTS=0`)만 지금처럼 2단계를 허용한다.
```bash
if run gcloud run services describe "$svc" ... >/dev/null 2>&1; then
  EXISTS=1
  local pre_url
  pre_url="$(run gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" --format='value(status.url)')"
  [ -n "$pre_url" ] && SERVICE_URL="$pre_url"
fi
# ... 이후 env_vars 조립 → deploy → update-traffic → (EXISTS=0일 때만) describe/update 분기
```
2. `deploy_jobs`도 같은 `SERVICE_URL`을 쓰므로 `resolve_project_number` 직후(서비스가 이미 있으면) 한 번에 확정하는 편이 낫다.
3. `rollback.sh`는 "직전 리비전"이 아니라 **APP_GIT_SHA가 서빙 리비전과 다른 가장 최근 리비전**을 고른다(promote-guard.sh:77-79와 같은 방식으로 `revisions describe`에서 env를 읽는다). 회귀 테스트: 픽스처를 `["deployN-b","deployN-a","deployN-1-b","deployN-1-a"]` + SHA 매핑으로 바꿔 `deployN-1-b`가 선택되는지 단언.

## Warnings

### WR-01: 이메일 대소문자 정규화가 계층마다 달라 reset·unlock·create 사전검사가 조용히 어긋난다

**File:** `domain/auth/accounts.ts:27,73,99`, `repositories/users.ts:12-16`, `scripts/account-cli.ts:43-44`, `domain/auth/hooks.ts:17`
**Issue:**
- better-auth는 생성 시 `email.toLowerCase()`로 저장하고(`internal-adapter.mjs:145`), 로그인 조회도 소문자로 한다(`sign-in.mjs:315`). 잠금 훅도 `getBodyEmail`에서 소문자로 기록·집계한다(hooks.ts:17).
- 반면 `findUserByEmail`은 `eq(users.email, email)` 정확 일치이고, `createAccount`·`resetPassword`·`unlockAccount`·`parseArgs`는 입력을 정규화하지 않는다.

**Repro/Impact:**
- `account:reset --email Kim@plant8.co.kr` → DB에는 `kim@…` → "사용자를 찾을 수 없습니다".
- `account:unlock --email Kim@…` → `resolveOpenFailures("Kim@…")`가 0건 → `account unlocked (resolved=0)`로 **성공처럼** 종료. 잠금은 그대로.
- `account:create --email Kim@…`로 기존 `kim@…`이 있을 때 → 사전검사 통과 → `createUser`가 unique 위반 → 사전검사가 막으려던 원시 SQL 에러가 그대로 노출.
테스트에는 대소문자 케이스가 없다(`account-cli.test.ts`, `lockout.test.ts` grep 결과 0건).

**Fix:** `[고칠 수 있음]` `parseArgs`에서 `flags.email = value.trim().toLowerCase()` 한 줄 + domain 진입점(`createAccount`/`resetPassword`/`unlockAccount`)에서도 한 번 더 정규화(호출자가 CLI뿐이 아니게 될 때 대비). 단위 테스트에 `"Kim@Plant8.co.kr"` 입력 케이스 추가.

### WR-02: `ensure_sql_db_users`의 시크릿 저장 → DB 비밀번호 설정 순서가 부분 실패 시 영구 불일치를 만든다

**File:** `scripts/deploy.sh:239-250`
**Issue:** 새 관리자 비밀번호를 (a) Secret Manager 버전으로 먼저 저장하고(247행), (b) 그 다음 `gcloud sql users set-password`(249행)를 실행한다. (b)가 실패하면(API 일시 오류, 인스턴스 유지보수 중) 다음 실행은 `has_version`이 비어 있지 않아 **둘 다 건너뛴다** → Secret ≠ 실제 postgres 비밀번호가 영구 고정되고 `db-bootstrap` Job은 계속 인증 실패한다. 스크립트 어디에도 이 상태를 감지·복구하는 경로가 없다. 또 240행의 `2>/dev/null || true`는 `versions list`의 인증·권한 실패까지 "버전 없음"으로 해석해 불필요한 로테이션을 유발한다.

**Fix:** `[고칠 수 있음]` 순서를 뒤집는다 — `set-password` 성공 후에 버전을 추가하면, 추가 실패 시 다음 실행이 "버전 없음"으로 보고 다시 로테이션해 스스로 수렴한다. `versions list`는 `|| true`를 빼고 실패를 그대로 올린다(errtrace가 잡는다).
```bash
admin_password="$(openssl rand -base64 32)"
run gcloud sql users set-password postgres ... --password="$admin_password"
printf '%s' "$admin_password" | run gcloud secrets versions add "$admin_secret" ... --data-file=-
```

### WR-03: 임시 비밀번호가 Cloud Logging과 GitHub Actions 로그에 영구 저장되고, D-08(배너만)이라 노출 창이 무한하다

**File:** `scripts/account-cli.ts:59-61`, `.github/workflows/account.yml:97-111`, `app/(app)/account/page.tsx:5,14-16`
**Issue:** `printTempPassword`는 stdout에 쓰고, Cloud Run Job의 stdout은 Cloud Logging에 그대로 적재된다(기본 30일). `account.yml`은 그 줄을 `gcloud logging read`로 꺼내 `echo "$FOUND"`(111행)로 Actions 로그에 다시 남긴다(기본 90일, 저장소 읽기 권한자 전원 열람). 코드 주석 "어떤 로그에도 비밀번호 값 자체는 절대 남기지 않는다"(accounts.ts:9-10)와 실제 동작이 다르다. 여기에 `passwordIsTemporary`는 배너만 띄우고 강제·만료가 없어, 직원이 바꾸지 않으면 로그에 남은 값이 무기한 유효하다.

**Impact:** logging.viewer 또는 저장소 read 권한만 있으면 발급된 계정으로 로그인 가능(관리자 계정 포함). 직원 30명 규모의 인트라넷이라 위협 모델상 "내부자"이지만, 관리자 계정 발급 로그가 90일 남는 것은 과하다.

**Fix:** `[판단 필요]` 최소 두 가지 중 하나:
1. **만료**: `before` 훅(또는 sign-in 후)에서 `passwordIsTemporary && updatedAt < now-24h`면 로그인 거부 + "관리자에게 재발급 요청" 메시지. `resetPassword`/`createAccount`가 `updatedAt`을 갱신하므로 추가 컬럼 없이 가능.
2. **강제 변경**: `passwordIsTemporary`면 `/account` 외 경로에서 리다이렉트(현재 D-08 결정을 뒤집는 것이므로 결정 기록 필요).
운영상 보완: Actions 로그에서는 `echo "::add-mask::$PW"` 후 Step Summary에만 1회 표시(Summary도 로그이긴 하나 검색·API 노출이 줄어든다), 또는 관리자가 Cloud Logging에서 직접 읽도록 하고 워크플로는 execution name만 출력.

### WR-04: `handleServerError`가 임의 `Error.message`를 클라이언트에 그대로 돌려준다

**File:** `lib/actions/client.ts:7-9`
**Issue:** `e instanceof Error ? e.message : "서버 오류…"` — pg 드라이버 오류(`connect ECONNREFUSED 10.x.x.x:5432`, `relation "…" does not exist`), better-auth 내부 메시지, zod 내부 오류가 전부 `result.serverError`로 브라우저에 노출된다(`change-password-form.tsx:46`이 그대로 렌더). 의도된 사용자 메시지는 `WeakPasswordError`와 액션 내부의 `new Error("현재 비밀번호가…")` 둘뿐이다.

**Fix:** `[고칠 수 있음]` 사용자 노출용 오류 타입을 허용목록으로 두고 나머지는 로그 + 일반 메시지.
```ts
import { WeakPasswordError } from "@/domain/auth/password";
export class UserFacingError extends Error {}
handleServerError(e) {
  if (e instanceof WeakPasswordError || e instanceof UserFacingError) return e.message;
  log.error("action.unhandled", { name: e.name, message: e.message });
  return "서버 오류가 발생했습니다.";
}
```
actions.ts:36의 `new Error(...)`와 `authedActionClient`의 `"로그인이 필요합니다."`는 `UserFacingError`로 바꾼다.

### WR-05: `ensure_alerts`가 `deploy_service`와 `smoke` 사이에 있어, 경보 upsert 실패가 "검증되지 않은 100% 배포"를 남긴다

**File:** `scripts/deploy.sh:596-617`
**Issue:** `main`의 순서가 `deploy_service → ensure_alerts → smoke`다. `ensure_alerts`는 `gcloud alpha/beta monitoring`(불안정 트랙)을 쓰고, 실패하면 ERR 트랩이 `deploy failed at ensure_alerts`로 끝낸다. 그 시점에 서비스는 이미 100% 트래픽을 받고 있으나 스모크는 돌지 않았고, 종료 메시지는 이를 말해주지 않는다. `deploy.yml`도 이 실패를 배포 실패로만 보고한다.

**Fix:** `[고칠 수 있음]` `smoke`를 `deploy_service` 바로 뒤로 옮기고 `ensure_alerts`는 그 뒤(또는 `deploy_service` 앞)로. 순서 테스트(`deploy-sh.test.ts:239-247`의 `order`)를 함께 갱신.

### WR-06: `require-action-client` 규칙이 `export { fn }`·`export * from` 형태를 검사하지 않는다

**File:** `eslint/rules/require-action-client.mjs:228-247`
**Issue:** `checkTopLevelExports`는 `ExportNamedDeclaration`에 `declaration`이 있을 때만 검사한다(230행). 따라서 "use server" 파일에서
```ts
const raw = async (input: unknown) => { /* 세션 검사 없음 */ };
export { raw };            // 검사되지 않음
export * from "./other";   // 검사되지 않음
```
는 통과한다. 이 규칙이 "이후 모든 페이즈의 유일한 Server Action 진입점"을 강제하는 장치(lib/actions/client.ts:4-5)이므로 우회 경로가 있으면 의미가 없다.

**Fix:** `[고칠 수 있음]` `ExportNamedDeclaration`에 `specifiers`가 있으면 각 `local` 이름의 바인딩을 `context.sourceCode.getScope(node)`로 찾아 `VariableDeclarator.init`에 `getRootIdentifierName`을 적용해 판정하고, `ExportAllDeclaration`은 무조건 보고. `require-action-client.test.ts`에 두 케이스 추가.

### WR-07: 4계층 경계 — `lib`가 db·repositories를 자유롭게 import할 수 있고 app이 `lib`를 통해 그 경로를 탄다

**File:** `eslint.config.mjs:34,46`, `app/(app)/account/actions.ts:8,27-31`, `domain/system-status/index.ts:8`
**Issue:**
- 34행 주석은 "db는 아무도 import 안 함"이라 하지만 46행은 `lib → db, repositories, domain`을 허용한다. `app → lib`도 허용되므로 어떤 `lib/*` 모듈이든 app에서 DB까지 닿는 통로가 된다. 지금은 `lib/auth.ts`·`lib/viewer.ts`만 그렇지만, 린트가 막지 않는다.
- `actions.ts`는 `auth.api.changePassword`(비밀번호 해시 갱신 + 세션 삭제·생성 = 데이터 쓰기)를 app 계층에서 직접 호출한다. domain 함수 `finalizePasswordChange`는 후처리만 맡는다. "app → domain → repositories → db, domain 출구는 DTO" 규칙에서 보면 app이 domain을 건너뛴 쓰기다.
- `domain/system-status`가 `lib/gcp/cloud-sql-admin`(외부 API I/O)을 직접 부른다 — 이건 사실상 repository 역할인데 `lib`에 있다.

**Fix:** `[판단 필요]` 둘 중 하나로 결정해 린트에 반영:
(a) `lib`를 "횡단 유틸"로 좁히고, db/repositories를 import해야 하는 파일(`lib/auth.ts`, `lib/viewer.ts`)만 별도 element(`{ type: "lib-auth", pattern: "lib/auth.ts" }`)로 허용. `changePassword` 호출은 `domain/auth/password.ts`의 `changeOwnPassword(viewer, headers, input)`로 옮긴다.
(b) 현재 구조를 인정하고 34행 주석과 ARCHITECTURE.md의 규칙을 실제 허용 범위로 고친다.

### WR-08: Cloud SQL 커넥터·타이머 누수 — db-bootstrap과 같은 계열 2건 (db-bootstrap 자체는 알려진 미결)

**File:** `scripts/db-bootstrap.ts:48-67,89-101`, `lib/gcp/cloud-sql-admin.ts:20-24,42`
**Issue:**
- `createAdminPool`은 호출마다 `new Connector()`를 만든다. 한 실행에서 `ensureDatabaseExists` + 그룹 2개 = **커넥터 3개**가 생기고 모두 닫히지 않는다(알려진 미결이지만 3개라는 점과 `pool.end()`만 `finally`에 있다는 점을 기록). `CLOUD_SQL_CONNECTION_NAME`·`DB_ADMIN_URL`이 둘 다 비면 `getOptions({instanceConnectionName: undefined})`로 들어가 커넥터 내부 오류가 그대로 뜬다.
- `getLastBackup`의 `timeout()`은 `setTimeout` 핸들을 버린다. `list()`가 먼저 끝나도 5초 타이머가 살아 있다. 서비스에서는 무해하지만 CLI 번들에 들어가면 db/client.ts가 고친 것과 같은 "종료 안 됨" 패턴이 된다(지금은 CLI가 이 함수를 쓰지 않는다).

**Fix:** `[고칠 수 있음]`
- db-bootstrap: 모듈 수준 `let connector: Connector | null`로 하나만 만들고 `main()`의 `finally`에서 `connector?.close()`. 진입 검사: `if (!env.DB_ADMIN_URL && !env.CLOUD_SQL_CONNECTION_NAME) throw new Error("DB_ADMIN_URL 또는 CLOUD_SQL_CONNECTION_NAME이 필요합니다")`.
- cloud-sql-admin: 타이머 핸들을 보관해 race 종료 후 `clearTimeout`, 또는 생성 시 `.unref()`.

## Info

### IN-01: `gcloud run deploy` 실패를 무조건 조직 정책 탓으로 출력한다
**File:** `scripts/deploy.sh:417-429`
**Issue:** 이미지 pull 실패, 컨테이너 기동 실패(env 파싱 예외 등), 쿼터 초과도 전부 "org policy blocks unauthenticated ingress"로 안내한다. `deploy_output`이 함께 찍히긴 하나 안내문이 오진을 유도한다.
**Fix:** `printf '%s' "$deploy_output" | grep -q 'allowedPolicyMemberDomains\|SetIamPolicy'`일 때만 그 힌트를 출력.

### IN-02: Cloud SQL 인스턴스 RUNNABLE 대기 루프가 만료돼도 실패하지 않는다
**File:** `scripts/deploy.sh:205-215`
**Issue:** 90×10초 뒤에도 `state != RUNNABLE`이면 그냥 다음 단계로 진행해 `connectionName` 조회·Job 실행이 더 늦은 곳에서 알 수 없는 이유로 실패한다.
**Fix:** 루프 뒤 `[ "$state" = "RUNNABLE" ] || { echo "sql instance not RUNNABLE after 15m ($state)" >&2; exit 1; }`.

### IN-03: 관리자 비밀번호가 `--password=` 인자로 프로세스 목록에 노출된다
**File:** `scripts/deploy.sh:249`
**Issue:** argv는 같은 호스트의 `/proc/*/cmdline`·`ps`에 보이고, 누군가 `set -x`를 켜면 로그에 남는다. Actions 러너는 일회용이라 영향은 작다.
**Fix:** `printf '%s' "$admin_password" | run gcloud sql users set-password postgres ... --prompt-for-password` (stdin 입력) 사용.

### IN-04: Job 3개의 `BETTER_AUTH_URL`은 계산값으로 남고 서비스만 실측값으로 고쳐진다
**File:** `scripts/deploy.sh:315,455-456`
**Issue:** Job은 HTTP를 받지 않아 지금은 무해하지만, `env.ts` refine을 만족시키는 값이 서비스와 다른 상태가 배포마다 재생산된다. CR-01 수정(배포 전 URL 확정)으로 함께 해소된다.

### IN-05: 잠금 메시지의 "15분"이 하드코딩, `LOCKOUT_THRESHOLD=0`은 전원 잠금
**File:** `domain/auth/lockout.ts:19-20`, `lib/env.ts:64-66`
**Issue:** `LOCKOUT_WINDOW_MINUTES`를 바꾸면 메시지가 거짓이 된다. `numberWithDefault`는 `int().min(1)`을 강제하지 않아 0·음수·소수가 통과하고, `isLocked(0, 0)`은 true라 모든 로그인이 403이 된다.
**Fix:** 메시지를 `lockedMessage(windowMinutes)` 함수로; env 스키마에 `z.number().int().min(1)`.

### IN-06: 비밀번호 변경 액션이 세션을 만들었다가 즉시 지우고, 후처리 실패 시 상태가 어긋난다
**File:** `app/(app)/account/actions.ts:28-43`, `domain/auth/password.ts:106-110`
**Issue:** `revokeOtherSessions: true`는 better-auth가 전 세션 삭제 → 새 세션 생성 → Set-Cookie까지 한다(`update-user.mjs:180-188`). 그 쿠키는 `auth.api` 직접 호출이라 브라우저에 전달되지 않고, 직후 `finalizePasswordChange`가 그 세션도 지운다 — 불필요한 쓰기 2회. 또 `changePassword` 성공 뒤 `finalizePasswordChange`가 실패하면 비밀번호는 이미 바뀌었는데 `passwordIsTemporary`는 true로 남고 사용자는 오류만 본다. 재시도하면 옛 비밀번호가 틀려 "현재 비밀번호가 올바르지 않습니다"가 뜬다.
**Fix:** `revokeOtherSessions: false`로 두고 세션 만료는 `revokeAllSessions`에만 맡긴다. `setPasswordTemporary` 실패는 로그 후 리다이렉트를 계속한다(다음 로그인 시 배너가 다시 뜰 뿐).

### IN-07: 로그인 폼이 better-auth의 영어 원문 오류를 그대로 보여준다
**File:** `app/(auth)/login/login-form.tsx:28-32`
**Issue:** `result.error.message ?? GENERIC_ERROR` — 실패 시 message는 거의 항상 존재하므로("Invalid email or password", "Too many requests. Please try again later.") `GENERIC_ERROR`는 사실상 쓰이지 않고, UI 언어가 섞인다. 잠금(403)의 한국어 메시지만 의도대로 보인다.
**Fix:** `result.error.status === 403 || 429`면 서버 메시지, 그 외는 `GENERIC_ERROR`.

### IN-08: 계정 생성·재발급이 트랜잭션이 아니다
**File:** `domain/auth/accounts.ts:39-55,82-86`
**Issue:** `createUser` 성공 후 `linkAccount` 실패 → 자격증명 없는 user 행이 남고, 재실행은 "이미 존재하는 이메일"로 거부돼 수동 DB 정리가 필요하다. `resetPassword`도 `updatePassword → deleteUserSessions → setPasswordTemporary` 3단계가 각각 실패할 수 있다.
**Fix:** 최소한 `linkAccount` 실패 시 `internalAdapter.deleteUser(user.id)`로 보상. 근본적으로는 repositories에 `withTransaction(viewer, fn)`을 두고 domain이 감싼다(Phase 3 scopeFor와 함께 설계).

### IN-09: `account.yml`의 쉼표 결합 `--args`가 쉼표 포함 값을 쪼갠다
**File:** `.github/workflows/account.yml:65-71`
**Issue:** 이름에 쉼표가 있으면(`"Kim, Min"`) 토큰이 갈라져 `parseArgs`가 "알 수 없는 플래그"로 거부하거나, 값이 잘린 채 생성될 수 있다.
**Fix:** gcloud 구분자 지정: `--args="^|^${INPUT_ACTION}|--email|${INPUT_EMAIL}|--name|${INPUT_NAME}"`.

### IN-10: `--admin`이 reset/unlock에서도 조용히 받아들여진다
**File:** `scripts/account-cli.ts:36-37,54`
**Issue:** `reset --email x --admin`은 통과하고 플래그는 버려진다. 운영자가 "관리자로 승격됐다"고 오해할 수 있다.
**Fix:** `cmd !== "create" && flags.admin`이면 `UsageError`.

### IN-11: 실제 스테이징 호스트명이 테스트 파일과 커밋 이력에 들어가 있다
**File:** `test/unit/deploy/deploy-sh.test.ts:179,186,188,191` (이력: deploy.sh 주석에도 한때 포함)
**Issue:** `plant8-staging-67rumhdgba-du.a.run.app`은 실제 서비스 URL이다. 서비스가 `--allow-unauthenticated`라 비밀은 아니지만 D-03("실제 식별자를 절대 적지 않는다")과 어긋나고, 저장소가 유출되면 표적 URL이 함께 나간다.
**Fix:** 테스트 픽스처를 `plant8-staging-abc123-du.a.run.app` 같은 가짜 값으로 통일(207행 시나리오는 이미 그렇게 돼 있다).

### IN-12: migrate-runner가 `lib/env`를 두고 `process.env`를 직접 읽는다
**File:** `scripts/migrate-runner.ts:15-23`
**Issue:** `MAX_INSTANCES`·`DB_POOL_MAX`는 `lib/env.ts:54,76`에서 이미 숫자로 파싱된다. 같은 키를 두 곳에서 다르게 해석하면(`"__unset__"` 센티널 처리 등) 드리프트가 생긴다.
**Fix:** `parsePoolEnv({ MAX_INSTANCES: env.MAX_INSTANCES, DB_POOL_MAX: env.DB_POOL_MAX })`.

### IN-13: `0002_rate_limits_id_column.sql`은 행이 있는 테이블에서 실패한다
**File:** `db/migrations/0002_rate_limits_id_column.sql:4`
**Issue:** `ADD COLUMN "id" text NOT NULL`에 DEFAULT가 없다. 0000 적용 후 트래픽이 있었던 DB(로컬 개발 DB 등)에서는 실패한다. 스테이징·프로덕션은 세 파일이 한 트랜잭션으로 적용돼 문제없었다. 기록용.

### IN-14: `proxy.ts`가 XFF 부재 시 `127.0.0.1`로 대체해 한 버킷을 공유한다
**File:** `proxy.ts:10`
**Issue:** Cloud Run에서는 XFF가 항상 있어 실제 영향은 없지만, 대체값이 "실제 IP처럼 보이는" 값이라 `login_attempts.ip`에 loopback이 기록되고 잠금·레이트리밋 분석을 흐린다. 훅은 fail-closed인데 프록시는 fail-open이라 정책이 둘로 갈린다.
**Fix:** `"unknown"` 같은 명시적 센티널을 쓰거나, 비로컬(`APP_ENV !== "local"`)에서는 헤더를 설정하지 않아 훅의 500으로 떨어뜨린다.

### IN-15: 잠금·해제 로그에 이메일 원문이 남는다
**File:** `domain/auth/hooks.ts:62`, `domain/auth/accounts.ts:100`
**Issue:** `auth.lockout`·`auth.unlock`이 이메일(PII)을 Cloud Logging에 남긴다. 다른 이벤트는 `userId`만 쓴다.
**Fix:** 해당 사용자가 있으면 `userId`, 없으면 `sha256(email).slice(0,12)` 같은 식별자로 통일.

### IN-16: 서버 액션 경유 `changePassword`는 better-auth 레이트리밋 밖이다
**File:** `app/(app)/account/actions.ts:28-31`
**Issue:** `auth.api.*` 직접 호출은 HTTP 핸들러의 rateLimit을 타지 않는다. 세션을 가진 공격자가 `currentPassword`를 무제한 시도할 수 있다. 세션이 전제라 영향은 작다.
**Fix:** Phase 2 이후 액션 레벨 레이트리밋을 둘 때 이 경로를 포함하거나, 실패 N회 시 세션을 무효화한다.

---

## 확인했으나 문제 없음 (기록)

- **훅 실행 순서**: `dispatch.mjs:209-245` — before 훅이 throw하면 핸들러·after 모두 생략, 핸들러가 APIError를 던지면 잡아서 after까지 실행. `after`의 `ctx.context.newSession`은 `setSessionCookie → setNewSession`(cookies/index.mjs:179)으로만 세팅되므로 성공 판정이 정확하다.
- **`x-client-ip`**: proxy.ts가 `/api/auth/*`에서 항상 덮어쓰고, better-auth는 `ipAddressHeaders: ["x-client-ip"]`만 읽는다. 훅은 헤더 부재 시 500(fail-closed). 통합 테스트가 이를 검증한다.
- **D-17**: `system-status/page.tsx:15` `notFound()` + `getSystemStatus`의 `NotAdminError` 이중 방어 확인.
- **`redirect()` in action**: next-safe-action 8.7.3은 Next 내비게이션 오류를 `handleServerError` 전에 분리 처리(`isNextRouterError`), e2e `change-password.spec.ts:25`가 리다이렉트를 검증한다.
- **시크릿**: `.env.local`은 추적되지 않음(`git ls-files` 확인), 이력에 `BETTER_AUTH_SECRET=<hex>` 없음, Dockerfile 빌드 더미 값은 런타임 env로 덮임, `.dockerignore`가 `.env.*`·`gha-creds-*.json` 제외, `lib/env.ts`는 키 이름만 오류에 담음. 워크플로는 `vars.*`만 쓰고 프로젝트 번호는 로그에 안 찍힌다.
- **db/client.ts `closeDb`**: `finally`에서 `connector.close()` — 오늘 수정분 정상.
- **deploy.yml**: `shell: bash`가 `-eo pipefail`이라 `deploy.sh | tee`의 실패가 전파된다. `concurrency: deploy / cancel-in-progress: false` 적절.

---

_Reviewed: 2026-09-18T19:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
