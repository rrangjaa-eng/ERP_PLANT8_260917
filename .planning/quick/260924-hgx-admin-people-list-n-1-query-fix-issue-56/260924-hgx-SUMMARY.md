---
phase: quick-260924-hgx
plan: 01
subsystem: api
tags: [drizzle, postgres, n+1, listPeople, admin]

requires: []
provides:
  - "findMembershipsAtDate(viewer, userIds, date) — 사람별 시점 소속 발령을 selectDistinctOn 한 번으로 묶음 조회"
  - "findTeamsByIds(viewer, ids) / findRolesByIds(viewer, ids) — inArray 묶음 조회"
  - "domain/org teamsAtDate(viewer, userIds, date, deps?) — teamAtDate의 묶음판, Map<userId, TeamDto> 반환"
  - "domain/people listPeople이 호출 한 번짜리 메모이즈 visible로 재배선됨"
affects: [admin-people, org]

actuals:
  tokens: 3735
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "selectDistinctOn 묶음 시점 조회 선례(repositories/projects.ts currentRevisionsSubquery)를 team_memberships에 재사용"
    - "listPeople 호출 안 지역 Map<string, Promise<boolean>>로 visible() 메모이즈 — 모듈 전역 캐시 금지"

key-files:
  created: []
  modified:
    - repositories/team-memberships.ts
    - repositories/teams.ts
    - repositories/roles.ts
    - domain/org/index.ts
    - domain/people/index.ts
    - test/integration/people.test.ts

key-decisions:
  - "Task 1(RED→GREEN 구현)과 Task 2(게이트·커밋)를 계획 원문대로 fix: 커밋 하나로 합쳤다 — objective·Task 2 action·success_criteria가 명시적으로 단일 커밋을 요구했다"

patterns-established:
  - "묶음 조회 함수는 ids가 비면 조회 없이 []를 반환한다(findQuoteLinesByIds 선례와 일치)"

requirements-completed: [QUICK-260924-hgx, ISSUE-56]

coverage:
  - id: D1
    description: "listPeople의 DB 조회 횟수가 사람 수와 무관하다(1명 = 4명 = 9쿼리)"
    requirement: "ISSUE-56"
    verification:
      - kind: integration
        ref: "test/integration/people.test.ts#사람이 늘어도 DB 조회 횟수가 그대로다"
        status: pass
    human_judgment: false
  - id: D2
    description: "목록의 현재 소속은 오늘까지 발령된 가장 최근 팀이고, 목록 항목이 getPerson().person과 deep-equal이다"
    requirement: "ISSUE-56"
    verification:
      - kind: integration
        ref: "test/integration/people.test.ts#현재 소속은 오늘까지 발령된 가장 최근 팀이고 미래 발령은 아직 반영되지 않는다"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-24
status: complete
---

# Quick Task 260924-hgx: listPeople N+1 조회 제거(이슈 #56) Summary

**listPeople이 사람마다 팀·계급·노출표를 따로 조회하던 N+1(1인당 16쿼리)을 묶음 조회 3개 + teamsAtDate + 호출 한정 메모이즈 visible로 없애, 사람 수와 무관하게 9쿼리로 고정했다.**

## Performance

- **Duration:** ~20min
- **Tasks:** 2
- **Files modified:** 6

## Query Count: Before / After (issue #56)

측정은 `test/integration/people.test.ts`의 「사람이 늘어도 DB 조회 횟수가 그대로다」테스트가 `pool.query` 스파이로 잰 실제 호출 수다.

- **수정 전(RED, 계획서 수치):** 1명 19회 vs 4명 67회 — 사람이 늘수록 조회가 는다
- **수정 전 RED 실행 결과(직접 실측):** `AssertionError: expected 67 to be 19` — 계획서 수치와 일치
- **수정 후(GREEN, 직접 계측 — 임시 `console.log`로 1회 계측 후 즉시 원복, 커밋에는 포함되지 않음):** 1명 **9회**, 4명 **9회** — 사람 수와 무관하게 고정

## Accomplishments
- `repositories/team-memberships.ts`: `findMembershipsAtDate(viewer, userIds, date)` — `selectDistinctOn([teamMemberships.userId])`로 사람별 시점 소속을 한 번에 조회
- `repositories/teams.ts`: `findTeamsByIds(viewer, ids)` — `inArray` 묶음 조회, 보관 여부 안 거름
- `repositories/roles.ts`: `findRolesByIds(viewer, ids)` — `inArray` 묶음 조회, 보관 여부 안 거름
- `domain/org/index.ts`: `teamsAtDate(viewer, userIds, date, deps?)` — 발령 묶음 조회 → 팀 묶음 조회 → `project(..., TEAM_DTO_SPEC, deps)` → `Map<userId, TeamDto>`
- `domain/people/index.ts`: `listPeople`이 `projectPerson` 헬퍼(목록·상세 공통 투영)로 재배선. 호출 한 번짜리 `Map<infoItem, Promise<boolean>>` 메모이즈 `visible`을 `teamsAtDate`·`projectPerson` 양쪽에 주입
- `getPerson`은 기존 `teamAtDate` + `findRoleById` 경로 그대로 — 동작 무변경

## Task Commits

계획 원문(objective·Task 2 action·success_criteria)이 Task 1(RED→GREEN)과 Task 2(게이트·커밋)를 **fix: 커밋 하나**로 명시해, 표준 태스크별 원자 커밋 대신 계획 설계를 따랐다.

1. **Task 1+2: RED 확인 → 묶음 조회 재배선 → 게이트 → 커밋** — `a637516` (fix)

## Files Created/Modified
- `repositories/team-memberships.ts` — `findMembershipsAtDate` 추가
- `repositories/teams.ts` — `findTeamsByIds` 추가
- `repositories/roles.ts` — `findRolesByIds` 추가
- `domain/org/index.ts` — `teamsAtDate` 추가, `ProjectDeps`·`findMembershipsAtDate`·`findTeamsByIds` import 추가
- `domain/people/index.ts` — `projectPerson` 헬퍼 도입, `listPeople` 묶음 조회 + 메모이즈 `visible`로 재배선
- `test/integration/people.test.ts` — 이슈 #56 회귀 테스트 2개(오케스트레이터가 미리 작성한 RED, 수정 없이 그대로 커밋)

## Decisions Made
- Task 1·2를 계획 원문대로 fix: 커밋 하나로 합쳤다(위 key-decisions 참고)
- 그 외 계획에 없던 결정 없음 — 계획의 액션(①~⑤) 그대로 구현

## Deviations from Plan

None — plan executed exactly as written. `domain/permissions` 무수정(`git diff --stat -- domain/permissions` 빈 출력으로 확인), `getPerson` 경로 무변경.

## Issues Encountered

- `pnpm test:integration`을 두 번 연달아 백그라운드로 돌리다 두 프로세스가 겹쳐 실행되어(같은 로컬 Postgres에 대해 테스트마다 TRUNCATE가 서로 간섭) `vendors`·`quote-lines-conflict`·`revenue-entries`·`action-log-query`·`corp-cards`·`auth`·`archive`·`projects-list` 등 이 계획과 무관한 파일에서 대량 실패가 났다. 두 프로세스를 모두 종료(`kill -9`)하고 확인 후 단일 실행으로 재시도해 전부 통과했다 — 코드 변경이 아니라 실행 절차 실수였다.

## User Setup Required

None - no external service configuration required.

## Verification Gates (Task 2, counts only — failures quoted above under Issues Encountered)

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors (eslint + stylelint; pre-existing `[boundaries]` deprecation warnings only, unrelated to this change)
- `pnpm test:unit` — 76 files / 743 tests passed
- `pnpm test:integration` (단일 실행) — 38 files / 1029 tests passed
- `test/integration/people.test.ts` 단독 — 11 tests passed (이슈 #56 회귀 2건 포함)
- `git status --short -- db/migrations` — empty (마이그레이션 무변경)
- `git show --stat HEAD -- db/migrations package.json pnpm-lock.yaml app ui` — empty (의존성·UI 무변경)
- `git show --stat HEAD` 파일 목록 — 정확히 계획의 files_modified 6개
- `git log -1 --format=%s` — `fix:`로 시작

## Next Phase Readiness

- `/admin/people` 목록 화면이 사람 수와 무관한 상수 조회 횟수로 응답한다. 이후 Post-build 단계(`/review` → `/qa` → `/ship`)는 오케스트레이터가 별도로 돌린다 — 이 계획 범위 밖.

## Self-Check: PASSED

All 6 code/test files confirmed present on disk; commit `a637516` confirmed in `git log --oneline --all`.

---
*Quick task: 260924-hgx*
*Completed: 2026-09-24*
