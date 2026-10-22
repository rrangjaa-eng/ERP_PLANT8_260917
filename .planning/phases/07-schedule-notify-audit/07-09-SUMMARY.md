---
phase: 07-schedule-notify-audit
plan: 09
subsystem: auth
tags: [better-auth, lockout, advisory-lock, action-log, rate-limit, resignation]
status: complete

requires:
  - phase: 07-04
    provides: "행동 유형 password_reset(ALWAYS_ON) 등록"
provides:
  - "퇴직일(KST)이 지난 사람의 새 로그인 · 기존 세션 차단(D-743, 당일까지 허용)"
  - "lib/auth.ts additionalFields.resignationDate(input:false)"
  - "resetPassword — 상한 판정 · 외부 단계 → 잠금 해소(admin_reset) + password_reset 한 tx · 실패 주입 deps"
  - "unlockAccount 상한 판정(assertCanGrantRoles)"
  - "reserveLoginAttempt · settleLoginFailure · 공용 「잠금 기록 확인」(F1 — 기존 lockLoginEmail 키)"
  - "RATE_LIMIT_LOGIN_MAX 기본 60(D-723)"
affects: [07-17, 07-08]

actuals:
  tokens: 12400
  tasks: 3
  commits: 3
plan_head_before: c8961448f3a43e60a8050810eee2e79811eab63e

tech-stack:
  added: []
  patterns:
    - "로그인 실패 행 미리 기록(before, 이메일 advisory lock 아래) + after 재세기"
    - "잠금 기록은 「열린 실패의 처음 이후 account_lock 없음」일 때만 — 잠금 한 번에 한 행"

key-files:
  created:
    - test/integration/auth/retiree-login.test.ts
    - test/integration/auth/reset-unlocks.test.ts
    - test/unit/env-login-limit.test.ts
  modified:
    - domain/auth/hooks.ts
    - domain/auth/lockout.ts
    - domain/auth/accounts.ts
    - repositories/login-attempts.ts
    - repositories/action-log.ts
    - lib/auth.ts
    - lib/viewer.ts
    - lib/env.ts
    - .env.example
    - docs/OPERATIONS.md
    - docs/ARCHITECTURE.md
    - test/integration/lockout.test.ts
    - test/integration/rate-limit.test.ts

key-decisions:
  - "/qa ISSUE-002(사용자 결정 2026-10-22, 후속 수정): N번째 틀린 시도부터 403 잠금 문구 — after 훅이 요청형 문맥에서는 403 Response를 반환(공개 훅 반환 계약), auth.api 직접 호출에서는 APIError(FORBIDDEN)를 던진다. 본문은 로그인 전 훅 잠금 403과 같은 꼴({message})"
  - "퇴직 · 보관 계정(사용자 결정 2026-10-22, 후속 수정): 거부 전에 같은 잠금 계수를 지난다 — 퇴직 · 보관 · 재직 · 없는 이메일이 같은 횟수에 같은 상태 · 본문. 플랜 behavior 「퇴직 시도는 실패 수에 넣지 않는다」를 대체"
  - "미리 기록 행의 attempted_at은 DB 기본값(트랜잭션 시작 시각) — action_log.occurred_at과 같은 시계로 「잠금 기록 확인」 비교"
  - "Codex 지적 (2)(사용자 결정 2026-10-22): settle의 잠금 기록 실패만 잡아 log.error(auth.lockout_record_failed) 뒤 잠김을 돌려준다 — N번째 응답 403 잠금 문구, 다음 시도가 기록을 채운다(D-712)"
  - "Codex 지적 (1) 성공 로그인의 동시 예약 행 해소는 수용(사용자 결정 2026-10-22) — 고치려면 스키마(정산 표시)가 필요"
  - "DB 세션 TimeZone=UTC 가정 수용 · recordLoginFailure 유지 · 퇴직 · 보관 세션의 better-auth 자체 엔드포인트 틈은 후속 플랜 · /cso 대체 인정(사용자 결정 2026-10-22)"

duration: ~2h
completed: 2026-10-22
---

# Phase 7 Plan 09: 인증 묶음(PR-AUTH) Summary

퇴직일이 지난 사람의 로그인 · 세션 차단(D-743), 상한 판정을 거친 비밀번호 초기화가 잠금까지 풀며 끌 수 없는 `password_reset`을 남기고, 로그인 잠금 확인-후-기록 경쟁(F1)을 기존 `lockLoginEmail` 한 키로 직렬화했으며, 로그인 IP 한도 기본값을 60으로 올렸다. 후속 수정(독립 검토 · 사용자 결정)에서 N번째 틀린 시도부터 403 잠금 문구(ISSUE-002), 퇴직 · 보관 거부의 같은 잠금 계수, 해제 · 초기화의 이메일 잠금 직렬화를 넣었다.

## Tasks

| # | 태스크 | 커밋 |
|---|---|---|
| 1 | 트레이서 — 퇴직자 로그인 · 세션 차단(훅 · `additionalFields` · `getSession`) | 739358f7 |
| 2 | 초기화 잠금 해소 · 상한 · `password_reset` · F1 · 재잠금 · CLI 번들 | 2d096e41 |
| 3 | IP 한도 기본 60 · `.env.example` · OPERATIONS §11 · rate-limit 시험 | c9864ef2 |

## 검증 (전용 DB erp_w0709_test, W2-RULES)

- Task 1 통합: retiree-login · archived-session · auth · lockout · first-login-hook — 32/32 (RED 4건 확인 뒤 GREEN; 전제 사례 `resignationDate` undefined → `'YYYY-MM-DD'`)
- Task 2 통합: reset-unlocks · lockout · action-log · account-cli · auth · people-login-status · retiree-login · archived-session · first-login-hook — 70/70 (RED 10건 확인). lockout + action-log 두 번 더 반복 27/27 · 27/27(동시 8건 사례 안정)
- `pnpm build:cli` 성공 · `test/unit/deploy/cli-bundle.test.ts` 4/4
- **CLI 번들 실제 실행**(`node dist/cli/account-cli.mjs`, 시험 DB): create 종료 코드 0 · **reset 종료 코드 0** · **unlock --operator 종료 코드 0** — action_log에 `password_reset {email, resolved:0}` · `account_unlock {email, operator, resolved:0}` 확인(임시 비밀번호는 출력에서 걸러 어디에도 옮기지 않음)
- Task 3: 단위 env-login-limit · env 30/30(RED: 10 ≠ 60 확인) · 통합 rate-limit · lockout 13/13(rate-limit은 기본 10에서도 60에서도 녹색)
- `pnpm lint` 0(전체 — 첫 시도는 다른 작업 트리와 겹친 메모리 부족 OOM, `NODE_OPTIONS=--max-old-space-size=6144`로 재실행) · `pnpm typecheck` 0
- 수락 grep: `resignationDate` hooks 1 · viewer 3 · auth 1 / `password_reset` accounts 4 · `assertCanGrantRoles` 3 · `admin_reset` 1 · `lockLoginEmail(` lockout 3 · 새 `pg_advisory_xact_lock` 줄 0 · `db/` 변경 0 · `numberWithDefault(60)` 1 · `RATE_LIMIT_LOGIN_MAX=60` 1 · `RATE_LIMIT_LOGIN_MAX + 1` 1 · OPERATIONS `D-723` 1 · `lib/auth.ts` 바뀐 줄은 `resignationDate` 등록 + 주석뿐(`customRules` · `rateLimit` 변경 0)

## 초기화 단계표(K33 — 시험으로 고정)

① 권한 → `UserFacingError` · ② 대상 없음 → `UserFacingError` · ③ 상한 밖 → `RoleGrantForbiddenError`(위 셋 모두 비밀번호 · 세션 · 잠금 · 로그 그대로) · ④ `updatePassword` 실패 → 그대로 · 오류 전파 · ④ 세션 삭제 실패 → 비밀번호만 새 값 · 잠금 · 로그 그대로 · 재초기화 정상 · ⑤ 기록 실패 → 비밀번호 · 세션 · 임시 표시 바뀜, 해소 롤백, `password_reset` 0행, `auth.password_reset_audit_failed {userId, name}` 뒤 다시 던짐(임시 비밀번호 미반환) · 성공 → 열린 실패 0(`admin_reset`) · 새 비밀번호 로그인 · `password_reset` 1행(선택 행동 로그를 모두 꺼도) · detail · 로그 출력에 임시 비밀번호 없음.

## 알려진 대가

- **동시 시도 중 맞는 비밀번호가 잠깐 「잠김」을 볼 수 있다**(부록 NA): 다른 동시 시도의 미리 기록 행이 임계를 채우면 맞는 비밀번호도 before에서 403 — 미리 기록한 시도가 성공하면 곧 풀린다.
- 「잠금 기록 확인」은 DB 시각(트랜잭션 시작) 비교다. 한 트랜잭션이 BEGIN을 먼저 하고도 이메일 잠금을 임계 수의 다른 시도보다 늦게 얻는 극단적 경합에서는 `account_lock`이 한 행 더 남을 수 있다(경합한 트랜잭션 수로 유한). 시험의 동시 8건은 정확히 1행.
  - **정정(독립 검토):** 처음 적은 「누락이 아니라 중복 쪽만」은 틀렸다. 해제 · 초기화가 끼어들면 누락도 이론상 가능하다 — ① 해제가 잠금 기록 tx 사이에 해소 · `account_unlock`을 커밋해 행동 로그가 「해제 → 잠금」 순인데 실제로는 풀려 있는 오도, ② 직전 `account_lock` tx보다 먼저 시작한 미리 기록 tx가 해제 뒤에 행을 넣으면(attempted_at이 그 `account_lock`보다 이름) 다음 잠금의 기록이 빠질 수 있음(추정, 극히 좁음). 후속 수정이 해제 · 초기화의 해소 tx에 `lockLoginEmail`을 쥐게 해 ①을 닫았다. ②는 tx 시작 시각 비교라 남는다(추정 · 미재현).
- **성공 로그인이 동시 시도의 예약 실패 행까지 해소한다**(Codex 지적 (1)): after의 `resolveOpenFailures(email, "success")`가 그 순간 핸들러 안에 있던 다른 요청의 미리 기록 행까지 해소해, 잠금이 그 수(보통 0~1)만큼 늦을 수 있다. 비밀번호를 모르면 그 시점을 고를 수 없고 결과는 「W → C 순차」와 같다. 고치려면 스키마(정산 표시)가 필요해 수용한다 — 사용자 결정 2026-10-22.
- **D-712 불변식이 바뀌었다:** 04.2는 「N번째 실패 기록도 함께 롤백 → 잠겼는데 기록 0건 없음」이었다. 07-09는 「after의 잠금 기록이 실패하면 다음 시도가 채움」이다 — 그 사이 잠겼는데 `account_lock` 0건인 구간이 있다. 후속 수정 2(A)로 그 경우 N번째 응답은 403 잠금 문구이고 `auth.lockout_record_failed` 오류 로그가 남는다.
- before 훅이 사용자를 한 번 더 읽는다(`reserveLoginAttempt`가 eng E5대로 tx 전에 `findUserByEmail`) — 로그인당 쿼리 하나.

## Deviations from Plan

### 멈추고 기록(플랜 지시)

**1. /qa ISSUE-002 — 실행 때 멈춤 → 후속 수정에서 해결(사용자 결정 2026-10-22)**
- **실행 때 근거와 정정:** 「after 훅이 던진 `APIError`의 상태는 HTTP 경로에서 반영되지 않는다」는 맞다 — `better-auth/dist/api/dispatch.mjs`는 `result.response`만 바꾸고 상태는 핸들러의 401로 남으며, better-call `toResponse`는 `init.status ?? data.statusCode`라 401이 이긴다. 그러나 이를 「after 훅은 응답 상태를 못 바꾼다」로 일반화한 것은 **틀렸다**(독립 검토 판정) — `runAfterHooks`는 훅의 반환값을 응답으로 갈아 끼우고 `toResponse`는 `Response`를 그대로 통과시킨다. 또 앱의 로그인 경로는 `authClient.signIn.email`(HTTP) 하나뿐이라, 값으로 `Response`가 새는 곳은 시험의 `auth.api.signInEmail` 직접 호출뿐이었다.
- **해결:** after 실패 경로에서 `settleLoginFailure`가 잠김이면 요청형 문맥(`ctx.request` 있음)은 403 `Response`(본문 = 로그인 전 훅 잠금 403과 같은 `{message: lockedMessage(분)}`)를 반환하고, 그 밖은 `APIError("FORBIDDEN")`을 던진다. 의존성 수정 · 패치 없음, `login-error.ts`(403 + `isLockedMessage`) 계약 그대로. 시험 G는 `auth.handler`(HTTP)로 N번째 상태 403 · 본문이 이후 잠금 403과 같음을, G2는 직접 호출 경로 403을 잰다(둘 다 RED 확인 뒤 GREEN). 플랜 truth 「N번째 시도의 응답이 이미 잠금 문구다」 충족.

### Auto-fixed

**1. [Rule 2 - Correctness] `recordAttempt`의 `attemptedAt`을 선택으로** — 미리 기록 행을 DB 기본 시각으로 남겨 `action_log.occurred_at`(DB `now()`)과 같은 시계로 비교한다. 앱 · DB 시계 차이로 `account_lock`이 「열린 실패의 처음」보다 앞서 찍히면 잠긴 시도마다 기록이 계속 쌓이는(공격자가 늘릴 수 있는) 갈래를 막는다. 스키마 변경 없음. 커밋 2d096e41.

**2. [Rule 3] 전체 `pnpm lint` OOM** — 병렬 작업 트리로 메모리 부족(exit 134). 힙 6GB로 재실행해 0. 코드 변경 없음.

## Known Stubs

없음.

## Deferred

- ~~/qa ISSUE-002~~ — 후속 수정에서 해결.
- ~~독립 검토 [P3 추정] 미리 기록 행 `attempted_at`(DB `now()`, `timestamp without time zone`)은 DB 세션 TimeZone = UTC를 가정한다(Cloud SQL 기본 · 로컬 모두 UTC, action_log도 같은 가정).~~ — 수용(사용자 결정 2026-10-22). OPERATIONS.md 300줄 한도라 문서 줄도 더하지 않는다.

## Next

- 07-17(사람 화면 잠금 풀기 · 초기화)은 `resetPassword(viewer, email)` · `unlockAccount(viewer, email)`를 그대로 부르면 상한 판정이 따라온다 — `RoleGrantForbiddenError`를 화면 문구로 바꾸는 처리는 07-17 몫.
- PR-AUTH 게이트: `/review` + `/cso` + 독립 검토 1 → 사용자 머지(D-726).
- 07-17(또는 별도 quick): 퇴직 · 보관 계정의 기존 세션이 better-auth 자체 엔드포인트(get-session · change-password · update-user · list-sessions)에서 계속 인증되는 틈을 닫는다 — /review P3, 보관은 기존 M-2.

## 후속 수정 (독립 검토 · 사용자 결정 2026-10-22)

결정 두 건:
1. ISSUE-002 = 「403 Response 반환」(위 Deviations 1).
2. 퇴직 · 보관 계정 = 「같은 잠금 계수」 — 로그인 전 훅이 미리 기록(`reserveLoginAttempt`) → 잠김이면 403 → 퇴직 · 보관이면 더미 해시 → `settleLoginFailure` → 잠김이면 403 잠금 문구, 아니면 기존 401 일반 문구. 재직자의 before → 핸들러 → after와 같은 순서. 시험: 퇴직 · 보관 · 재직 · 없는 이메일 네 경우가 임계 + 1번 시도에서 상태 · 본문 순서열이 같다(`[401×(N-1), 403, 403]`).

고친 것(독립 검토 P3):
- 해제 · 초기화의 해소 tx 첫 줄 `lockLoginEmail`(새 키 없음) — 시험: 이메일 잠금을 쥔 동안 `unlockAccount` · `resetPassword`가 해소하지 않음(RED 확인).
- `lockout.ts` `settleLoginFailure` 주석을 실제 동작과 맞춤.
- 퇴직 KST 경계 시험: 시각을 UTC 16:00으로 고정, 퇴직일 = UTC 날짜(KST 어제) → 거부(UTC 판정으로 바꾸면 실패 — 변이 확인).
- D-712 자가 회복 시험: settle 잠금 기록 실패 주입 → 0행 → 다음 시도 403 · 1행(잠금 기록 확인을 빼면 실패 — 변이 확인).
- `docs/ARCHITECTURE.md` IP 속도 제한 60초 60회(D-723). `docs/OPERATIONS.md` §11 문단을 앞 문단에 이어 302 → 300줄(문장 그대로, docs-limits 녹색).

커밋(first-parent 8da6d3cb..: 6 — origin/main 머지 1 포함): 43a3b57e 머지 · 492c716a ISSUE-002 · f59ff4a1 퇴직 · 보관 계수 · 50abae06 해제 · 초기화 직렬화 · f3436de9 시험 · ffd07051 문서.

검증(전용 DB erp_w0709_test): 통합 lockout · retiree-login · reset-unlocks · action-log · account-cli · archived-session · auth · rate-limit · archive · people-login-status 10파일 91/91 · 단위 docs-limits · env · env-login-limit 121/121 · `pnpm typecheck` 0 · `pnpm lint` 0. 로그인 화면 E2E 중 잠금 문구를 다루는 스펙 없음(`login-logout.spec.ts`에 잠금 사례 없음) — E2E 미실행.

## 후속 수정 2 (Codex 지적 · 사용자 결정 2026-10-22)

고친 것(A, Codex 지적 (2)): N번째 틀린 시도의 after `settleLoginFailure`에서 `ensureLockRecorded`가 실패하면 오류가 훅 밖으로 나가 **HTTP 응답이 500**이었다(시험 K2 RED에서 실측, `auth.lockout` 로그도 없음). settle이 잠금 기록 확인의 실패만 잡아 tx를 롤백한 뒤 `log.error("auth.lockout_record_failed", {email, name})`를 남기고 잠김을 그대로 돌려준다 → 응답 **403 잠금 문구**(요청 문맥은 기존 403 Response 경로). 실패 행 재계수 등 다른 오류는 그대로 던진다. 다음 시도가 before에서 기록을 채우는 D-712 자가 회복은 그대로다. 퇴직 · 보관 거부도 같은 settle을 지나 같은 결과다. reserve(before)의 잠금 기록 실패는 지시 범위 밖이라 그대로 던진다. 시험: K(직접 호출이 잠김을 돌려줌) · K2(HTTP 경로 기록 실패 주입 → 403 잠금 문구 · 오류 로그 1건 · `auth.lockout` 없음 · 0행 → 다음 시도 403 · 1행) — 둘 다 RED 확인 뒤 GREEN. 커밋 c607db21.

결정(사용자 결정 2026-10-22):
- DB 세션 TimeZone=UTC 가정은 그대로 수용한다(OPERATIONS.md 300줄 한도) — Deferred 항목을 닫았다.
- `recordLoginFailure`(프로덕션 호출처 없음, 시험만)는 남긴다.
- 퇴직 · 보관 계정의 기존 세션이 better-auth 자체 엔드포인트(get-session · change-password · update-user · list-sessions)에서 계속 인증되는 틈(/review P3, 보관은 기존 M-2)은 후속 플랜(07-17 또는 별도 quick)으로 넘긴다.
- /cso는 스냅숏 64MiB 한도로 실행할 수 없었다. /review 보안 항목, Codex 봇 보안 검토 0건, Opus 독립 검토로 대체를 인정한다.

검증(전용 DB erp_w0709_test): 통합 lockout · retiree-login · reset-unlocks · auth 4파일 44/44 · `pnpm typecheck` 0 · `pnpm lint` 0.

## Self-Check: PASSED

- 파일: retiree-login.test.ts · reset-unlocks.test.ts · env-login-limit.test.ts 있음
- 커밋: 739358f7 · 2d096e41 · c9864ef2 있음
- 후속 커밋: 43a3b57e · 492c716a · f59ff4a1 · 50abae06 · f3436de9 · ffd07051 있음
- 후속 수정 2 커밋: c607db21 있음
