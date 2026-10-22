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
    - test/integration/lockout.test.ts
    - test/integration/rate-limit.test.ts

key-decisions:
  - "/qa ISSUE-002(N번째 응답 403 잠금 문구) 미룸 — better-auth 1.7.5 dispatch가 after 훅 APIError의 상태를 원래 401로 덮는다. 플랜 지시(우회 구현 금지)대로 멈추고 기록"
  - "미리 기록 행의 attempted_at은 DB 기본값(트랜잭션 시작 시각) — action_log.occurred_at과 같은 시계로 「잠금 기록 확인」 비교"

duration: ~2h
completed: 2026-10-22
---

# Phase 7 Plan 09: 인증 묶음(PR-AUTH) Summary

퇴직일이 지난 사람의 로그인 · 세션 차단(D-743), 상한 판정을 거친 비밀번호 초기화가 잠금까지 풀며 끌 수 없는 `password_reset`을 남기고, 로그인 잠금 확인-후-기록 경쟁(F1)을 기존 `lockLoginEmail` 한 키로 직렬화했으며, 로그인 IP 한도 기본값을 60으로 올렸다. N번째 시도 403(ISSUE-002)은 better-auth 제약으로 미뤘다.

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
- 「잠금 기록 확인」은 DB 시각(트랜잭션 시작) 비교다. 한 트랜잭션이 BEGIN을 먼저 하고도 이메일 잠금을 임계 수의 다른 시도보다 늦게 얻는 극단적 경합에서는 `account_lock`이 한 행 더 남을 수 있다(기록 누락 쪽이 아니라 중복 쪽, 경합한 트랜잭션 수로 유한). 시험의 동시 8건은 정확히 1행.
- before 훅이 사용자를 한 번 더 읽는다(`reserveLoginAttempt`가 eng E5대로 tx 전에 `findUserByEmail`) — 로그인당 쿼리 하나.

## Deviations from Plan

### 멈추고 기록(플랜 지시)

**1. /qa ISSUE-002 — N번째 시도 응답을 403 잠금 문구로 바꾸지 못함**
- **근거(systematic-debugging):** `better-auth/dist/api/dispatch.mjs:245-260` — after 훅이 던진 `APIError`는 `result.response`만 바꾸고, 요청형 경로(`auth.handler`)는 `toResponse(result.response, { status: result.status })`로 응답을 만든다. better-call `toResponse`는 `status: init?.status ?? data.statusCode` — 원래 엔드포인트 실패의 401이 403을 덮는다. 실측: after에서 `APIError("FORBIDDEN")`을 던져도 N번째 응답 401(본문만 잠금 문구). 화면(`app/(auth)/login/login-error.ts:23`)은 `status === 403`일 때만 잠금 문구를 보여 준다.
- **한 일:** after 실패 경로는 `settleLoginFailure`로 잠금 기록만 확인하고 응답은 바꾸지 않는다(본문만 바뀐 401 반쪽 상태를 만들지 않음). lockout 사례 E는 원래 꼴 그대로, G는 「N번째에 account_lock 1행 · 뒤 403에도 1행」으로, H는 「임계 밖 3건 403」으로 고정. 플랜 truth 「N번째 시도의 응답이 이미 잠금 문구다」는 **미충족**.
- **선택지(사용자 · 오케스트레이터 결정):** (a) after 훅이 `APIError` 대신 `new Response(JSON, { status: 403 })`를 돌려줌 — `toResponse`가 Response를 그대로 통과시켜 요청형 경로는 403이 되지만, `auth.api.signInEmail` 직접 호출 경로에는 Response 객체가 값으로 새어 나가는 우회(플랜이 금지한 「우회 구현」에 해당한다고 봄) · (b) 화면 `login-error.ts`가 401 + 잠금 문구도 잠김으로 읽음(app/ 화면 플랜 몫) · (c) better-auth 판 올림 · 상류 이슈 · (d) 미룸 유지.

### Auto-fixed

**1. [Rule 2 - Correctness] `recordAttempt`의 `attemptedAt`을 선택으로** — 미리 기록 행을 DB 기본 시각으로 남겨 `action_log.occurred_at`(DB `now()`)과 같은 시계로 비교한다. 앱 · DB 시계 차이로 `account_lock`이 「열린 실패의 처음」보다 앞서 찍히면 잠긴 시도마다 기록이 계속 쌓이는(공격자가 늘릴 수 있는) 갈래를 막는다. 스키마 변경 없음. 커밋 2d096e41.

**2. [Rule 3] 전체 `pnpm lint` OOM** — 병렬 작업 트리로 메모리 부족(exit 134). 힙 6GB로 재실행해 0. 코드 변경 없음.

## Known Stubs

없음.

## Deferred

- /qa ISSUE-002(위 선택지) — `.planning/WINDOWS.md` 기록은 오케스트레이터 몫(공유 파일).

## Next

- 07-17(사람 화면 잠금 풀기 · 초기화)은 `resetPassword(viewer, email)` · `unlockAccount(viewer, email)`를 그대로 부르면 상한 판정이 따라온다 — `RoleGrantForbiddenError`를 화면 문구로 바꾸는 처리는 07-17 몫.
- PR-AUTH 게이트: `/review` + `/cso` + 독립 검토 1 → 사용자 머지(D-726).

## Self-Check: PASSED

- 파일: retiree-login.test.ts · reset-unlocks.test.ts · env-login-limit.test.ts 있음
- 커밋: 739358f7 · 2d096e41 · c9864ef2 있음
