---
phase: 07-schedule-notify-audit
plan: 26
subsystem: permissions
tags: [action-log, permissions, drizzle, postgres, transaction]
status: complete
requirements: [NOTI-03]
branch: claude/07-pr-perm-26
merge_owner: user
risk: permissions

requires:
  - phase: 07-04
    provides: "domain/action-log/changes.ts buildChanges(before, after, sensitive?)"
provides:
  - "permission_change.detail.changes — allowed · visible · name · workScope · viewScope"
  - "setVisibilityCell 이전 값 읽기 · upsert · 기록 한 트랜잭션"
  - "repositories/permissions.ts findVisibility(..., tx = db)"
affects: [07-15, 07-05, PR-PERM]

actuals:
  tokens: 3851
  tasks: 2
  commits: 2
plan_head_before: 9135c252642662aff2f52a55fe570d4123810704

tech-stack:
  added: []
  patterns:
    - "기록 detail에 기존 칸은 두고 changes만 더한다(07-04 buildChanges 재사용)"

key-files:
  created:
    - test/integration/action-log-permission-changes.test.ts
  modified:
    - domain/permissions/matrix.ts
    - domain/permissions/roles.ts
    - repositories/permissions.ts
    - test/integration/admin-cap-permissions.test.ts
    - test/integration/roles.test.ts

key-decisions:
  - "createRole의 changes 이후 값은 저장된 행의 이름(row.name = 정규화된 이름)"
  - "renameRole 이전 이름은 저장 전 defaultFindRoleById — 행이 없으면 null, 새 오류 없음"
  - "판정 순서 · 잠금 · 반환 꼴 · 상한 판정 위치(노출표는 tx 밖) 그대로"

metrics:
  duration: "약 90분(형제 작업 트리 lint 메모리 경합 대기 포함)"
  completed: 2026-10-22
---

# Phase 07 Plan 26: 권한 경로 permission_change 전후 값 Summary

권한표 · 정보 노출표 · 계급 네 경로(여섯 함수)가 07-04 `buildChanges`로 `detail.changes = {칸: [이전, 이후]}`를 남기고, 노출표 저장과 기록이 한 트랜잭션이 됐다.

## 만든 것

- `setPermissionCell`: 기존 tx 안 upsert 직전 `findPermission(..., tx)`로 이전 값을 읽어 `changes: {allowed: [이전 ?? null, 이후]}`. 기존 detail 네 칸 유지.
- `setVisibilityCell`: `assertCanEditRole` 뒤 「`findVisibility(..., tx)` → `upsertVisibility(..., tx)` → `recordAction(..., {tx})`」를 `withTransaction` 하나로. `changes: {visible: [이전 ?? null, 이후]}`.
- `findVisibility`에 마지막 인자 `tx: DbOrTx = db`(기존 호출 `visible.ts` · 시험 그대로).
- `createRole` `{name: [null, 이름]}` · `renameRole` `{name: [이전, 이후]}`(같은 이름이면 `{}`) · `setRoleWorkScope` `{workScope: [이전, 이후]}` · `setRoleViewScope` `{viewScope: [이전, 이후]}` — 기존 `{from, to}` 칸 유지.
- 새 행동 유형 없음(전부 기존 `permission_change`). 칸 비교 · 가림은 `buildChanges`만 사용.

## 커밋

| 태스크 | 커밋 | 파일 |
|---|---|---|
| 1 (tracer) 권한표 칸 전후 값 | `33340757` | domain/permissions/matrix.ts · test/integration/action-log-permission-changes.test.ts · test/integration/admin-cap-permissions.test.ts |
| 2 노출표 tx · 계급 전후 값 | `a97eb98a` | domain/permissions/matrix.ts · domain/permissions/roles.ts · repositories/permissions.ts · test/integration/action-log-permission-changes.test.ts · test/integration/roles.test.ts |

`git diff --name-only 9135c252..HEAD`(SUMMARY 제외) = files_modified 여섯 개와 정확히 같다. `test/integration/action-log-changes.test.ts`(07-04 몫) 변경 커밋 없음.

## 검증 (전용 DB `erp_w0726_test`, W2-RULES)

- Task 1 RED: 새 파일 2건 + admin-cap 정확 일치 1건 실패(`changes` 없음) 확인 → GREEN 2 files / 25 passed. 「기록 실패 → 칸 그대로」는 기존 tx 덕에 처음부터 통과(회귀 가드).
- Task 2 RED: 8건 실패(노출표 changes 2 · 노출표 기록 실패 시 값이 바뀜 1 · 계급 이름 3 · roles 범위 정확 일치 2) 확인 → GREEN.
- DB 비운 뒤 `action-log-permission-changes` · `roles` · `admin-cap-permissions` · `seed-permissions` · `leak-scan` — 5 files / 5100 passed.
- 관련 추가: `custom-field-visibility` · `admin-cap-concurrency` — 2 files / 33 passed.
- `pnpm typecheck` exit 0 · `pnpm lint`(전체) exit 0.
- acceptance: `buildChanges(` roles.ts 4 · matrix.ts 2 · `findVisibility`에 `tx: DbOrTx = db` · 새 시험 파일 git 추적됨.

## Deviations from Plan

None - plan executed exactly as written.

환경 메모(코드 편차 아님): 첫 `pnpm lint`가 형제 작업 트리의 `eslint .` 여러 개와 메모리를 다퉈 V8 heap OOM(134) · OOM kill(137)로 진단 없이 죽었다. 원인은 동시 실행 메모리 경합 — 형제 lint가 빠질 때까지 기다린 뒤 `NODE_OPTIONS=--max-old-space-size=5120 pnpm lint`로 다시 돌려 exit 0. 저장소 설정은 바꾸지 않았다.

## 독립 검토 · 07-15에 넘길 메모

- 이전 값 읽기는 잠금 없는 SELECT다. 관리자 칸 끄기는 `lockSeatKeys` 뒤라 직렬화되지만, 그 밖의 같은 칸을 두 관리자가 동시에 저장하면 두 기록의 「이전」이 같은 값일 수 있다(저장 결과 · 판정은 영향 없음, 기록의 전후 값만). 07-04 설정 경로는 잠금으로 막았다 — 필요하면 07-15에서 칸 잠금 여부를 판단.
- 계급 쓰기 네 함수는 저장 · 기록이 여전히 갈라져 있다(플랜 Deferred — `repositories/roles.ts` 쓰기에 tx 인자 없음).
- `roles.test.ts` · `matrix.ts` · `roles.ts`는 07-15가 이어 고친다. 새 시험의 보기 칸 켬 사례는 딸린 칸이 없어 07-15 뒤에도 한 줄이어야 한다.

## Threat Flags

없음 — 새 엔드포인트 · 인증 경로 · 스키마 변경 없음. T-07-26-01 · 02는 위 시험으로 mitigate, T-07-26-03은 판정 순서 무변경 + 기존 admin-cap · roles 통합 녹색.

## Self-Check: PASSED

- FOUND: test/integration/action-log-permission-changes.test.ts
- FOUND: 33340757 · a97eb98a
