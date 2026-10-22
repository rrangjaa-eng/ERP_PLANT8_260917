---
phase: quick-261022-cwp
plan: 01
subsystem: settings · approvals(결재선 설정 로그) · e2e
tags: [settings, action-log, approvals, e2e, D-734]
status: complete
requires: []
provides:
  - "setSettingValue 이전 값 = 저장 행 원값, 없으면 def.default ?? null"
  - "결재선 단계 저장 — 특정 부서 칸 이전 값에도 빈 값 대체"
  - "PROJECT_COST_RATE_PCT — 공백 문자열 = 비움(null)"
  - "role-smoke open 행 최종 경로 단언"
affects: [action_log settings_change detail, test/e2e/role-smoke.spec.ts]
tech-stack:
  added: []
  patterns: ["이전 값 = 화면이 보인 값(기본값 · 빈 값 대체) — buildChanges가 같은 값 칸을 싣지 않음"]
key-files:
  created:
    - test/unit/domain/route-step-settings-changes.test.ts
  modified:
    - domain/settings/registry.ts
    - test/unit/settings/registry.test.ts
    - domain/approvals/route-step-settings.ts
    - domain/settings/keys.ts
    - test/unit/settings/phase7-keys.test.ts
    - test/e2e/role-smoke.spec.ts
decisions:
  - "setSettingValue 첫 저장 이전 값은 def.default ?? null(가져오기 · effectiveValueAt과 같은 규칙) — 오케스트레이터 확정 해석 그대로"
metrics:
  completed: 2026-10-22
  duration: "약 25분(커밋 09:33 → 09:51 UTC, 준비 포함)"
actuals:
  tokens: 3300
  tasks: 2
  commits: 4
plan_head_before: d8eb84ab07160d390e8971ff46b08b82356b3af0
commits: 4
---

# Phase quick-261022-cwp Plan 01: 07 사후 검토 main 결함 네 건 수정 Summary

설정 저장 로그의 이전 값을 화면이 보인 값(기본값 · 빈 특정 부서)으로 맞춰 가짜 변경을 없애고, 원가율 공백 입력을 0이 아닌 비움으로 읽게 하고, role-smoke가 리다이렉트 뒤 200을 「열림」으로 세지 않게 했다.

사용한 스킬(Skill 도구 실제 호출): `superpowers:test-driven-development`(구현 전) · `superpowers:verification-before-completion`(첫 커밋 전) · `superpowers:systematic-debugging`(`pnpm lint` 힙 부족 중단 때).

## ① 단순 설정 첫 저장 이전 값 = 기본값 — `ee0544b`

- 바꾼 줄: domain/settings/registry.ts `setSettingValue` — `(await findSimpleValue(...))?.value ?? null` → `const row = await findSimpleValue(...)` + `const previous = row ? row.value : (def.default ?? null)`(+ 주석 한 줄).
- 시험: registry.test.ts에 `PAYMENT_TERM_DAYS`(기본 60) 첫 저장 30 · 60 사례 2개.
- 고치기 전 RED(`Tests 2 failed | 29 passed (31)`):
  ```
  × 저장 행이 없는 키의 첫 저장은 기본값을 이전 값으로 기록한다
    "value": [ - 60, + null, 30 ]
  × 저장 행이 없는 키에 기본값과 같은 값을 저장하면 changes가 비어 있다
    - "changes": {}   + "changes": { "value": [ null, 60 ] }
  ```
- GREEN: registry + set-simple-setting-tx `Tests 32 passed (32)`. 기존 `[0.1, 0.4]` 사례 그대로 녹색.

## ② 결재선 단계 저장 — 바뀌지 않은 빈 특정 부서 칸 — `2463de7`

- 바꾼 줄: domain/approvals/route-step-settings.ts 특정 부서 entry `previous`에 `?? ""`(새 값의 `withOrgUnitFallback`과 같은 빈 값 대체). 나머지 세 entry · 기대값 비교 · 기록 루프 그대로.
- 시험(새 파일 test/unit/domain/route-step-settings-changes.test.ts): ②-1 연차 3단 생략 저장 → `{}` · ②-2 모든 종류 × 기본값 없는 특정 부서 단계(연차 · 지출 · 정산 3단, `listDocumentKinds`로 열거) → `{}` · ②-3 빈 값 → uuid → `["", uuid]`.
- 고치기 전 RED(`Tests 3 failed (3)`):
  ```
  AssertionError: expected { value: [ null, '' ] } to deeply equal {}
  - "approval_route.expense.step3.org_unit_id": {}  + { "value": [ null, "" ] }
  - "approval_route.leave.step3.org_unit_id": {}    + { "value": [ null, "" ] }
  - "approval_route.settlement.step3.org_unit_id": {} + { "value": [ null, "" ] }
  AssertionError: expected { value: [ null, …(1) ] } to deeply equal { value: [ '', …(1) ] }
  ```
- GREEN: 단위 세 파일 `Tests 35 passed (35)`. 통합 `action-log-changes.test.ts` + `settings-approval-route.test.ts` `Tests 39 passed (39)`(`[null, 10]` 시험 키 사례 포함 녹색 — 기존 기대값 충돌 없음).

## ③ 원가율 공백 = 비움 — `c52fed5`

- 바꾼 줄: domain/settings/keys.ts `PROJECT_COST_RATE_PCT` preprocess 빈 값 판정 `raw === ""` → `(typeof raw === "string" && raw.trim() === "")`(+ 주석 한 줄). 강제 변환 · refine · nullable 그대로.
- 고치기 전 RED(`Tests 1 failed | 18 passed (19)`): `AssertionError: " ": expected +0 to be null`
- GREEN: phase7-keys `Tests 19 passed (19)`("" · null → null, 0 · "0" → 0, 범위 거부 사례 그대로).

## ⑤ role-smoke 열림 = 그 경로 — `2c8dfed`

- 바꾼 줄: test/e2e/role-smoke.spec.ts — 행 판정을 같은 파일의 `expectRow(page, row, label)`로 꺼내고, open이면 `new URL(page.url()).pathname`이 `row.path`와 같아야 한다는 단언을 더함.
- 탐침(로그인 없이 `{ path: "/admin/permissions", expect: "open" }`) — 고치기 전 **통과**(구멍): `[7/7] … 탐침 — 세션 없이 /admin/permissions` / `7 passed (2.3m)`
- 고친 뒤 탐침 **실패**, 계급 사례 통과: `Error: 탐침 /admin/permissions` · `Expected: "/admin/permissions"` · `Received: "/login"` / `1 failed` · `6 passed (57.8s)`
- 탐침 지운 뒤 완료 판정 `CI=true pnpm exec playwright test test/e2e/role-smoke.spec.ts --project=desktop --no-deps --reporter=line`: `6 passed (2.4m)`. 커밋된 파일에 탐침 없음.

## ④

범위 밖 — 사용자 결정 대기(권한 설계).

## 전체 확인

- 단위 네 파일(registry · route-step-settings-changes · set-simple-setting-tx · phase7-keys): `Test Files 4 passed (4)` · `Tests 54 passed (54)`
- 통합 두 파일: `Tests 39 passed (39)`
- role-smoke `CI=true`: `6 passed`
- `pnpm typecheck`: exit 0
- `pnpm lint`: exit 0 — 단, 기본 Node 힙(약 2 GB)에서는 `eslint .`가 `JavaScript heap out of memory`로 중단(작업 전후 무관, 단독 실행에서도 재현). `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"`로 같은 명령 녹색. 프로젝트 설정은 바꾸지 않았다.
- `git diff --name-only d8eb84a..HEAD` = frontmatter files_modified 7개만(app/ · ui/ · 위험 경로 · admin-cap-restore · domain/archive 변경 없음).

## Deviations from Plan

1. **[Rule 1 - lint] registry.test.ts any 접근** — ①의 첫 시험 줄 `calls[0]?.[1].detail`이 `no-unsafe-member-access`에 걸려 `toEqual(expect.objectContaining({ detail: {...} }))`로 바꿔 ① 커밋에 amend(②보다 먼저, 같은 결함 커밋 유지). 고치기 전 코드로 되돌려 다시 RED(2 failed) 확인 뒤 GREEN.
2. ① 제품 코드는 「한 줄」 대신 두 줄(`row` 읽기 + `previous`) — 읽기 쉬움을 위해. 동작은 계획과 같다.
3. ②-2는 단계마다 바로 단언하지 않고 키 → changes 표를 모아 한 번에 비교 — RED 출력이 연차 · 지출 · 정산 3단을 모두 보이게.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 7개 존재, 커밋 ee0544b · 2463de7 · c52fed5 · 2c8dfed가 `git log`에 있음, plan_head_before..HEAD = 4.
