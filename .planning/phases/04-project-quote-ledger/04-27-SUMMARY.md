---
phase: 04-project-quote-ledger
plan: 27
subsystem: permissions
tags: [roles, work-scope, drizzle, postgres, squawk, next-safe-action, playwright]

requires:
  - phase: 04-project-quote-ledger (04-06)
    provides: "마이그레이션 0012_project_status_five_values — 이 플랜의 0013이 그 뒤 idx 13"
provides:
  - "roles.work_scope(text NOT NULL DEFAULT 'team', 인라인 CHECK team·company) + 마이그레이션 0013_role_work_scope"
  - "ROLE_WORK_SCOPES · RoleWorkScope · SEED_ROLES[].workScope · RoleDto.workScope"
  - "domain setRoleWorkScope(viewer, id, workScope) — admin.people 쓰기, permission_change 로그 detail { workScope: { from, to } }"
  - "setRoleWorkScopeAction(등록) · 계급 표 「업무 범위」 select(자기 팀/전사)"
affects: [04-20, 04-21, 04-22]

actuals:
  tokens: 24930
  tasks: 2
  commits: 3
plan_head_before: a8c95fa85520f6c38a8d4063670cbcc79295c299

tech-stack:
  added: []
  patterns:
    - "두 값 CHECK를 ADD COLUMN 안에 인라인으로 손 편집(B-22) — drizzle 생성 ADD CONSTRAINT 문장은 지운다"
    - "E2E는 beforeAll에서 domain으로 만든 임시 계급만 바꾸고 afterAll에서 보관 — 공유 시드 계급은 읽기만"

key-files:
  created:
    - db/migrations/0013_role_work_scope.sql
    - db/migrations/meta/0013_snapshot.json
  modified:
    - db/schema/roles.ts
    - db/migrations/meta/_journal.json
    - repositories/roles.ts
    - domain/permissions/roles.ts
    - domain/seed/index.ts
    - app/(app)/admin/people/actions.ts
    - app/(app)/admin/people/actions.registry.ts
    - app/(app)/admin/people/roles/roles-client.tsx
    - test/integration/roles.test.ts
    - test/e2e/roles.spec.ts
    - test/e2e/mobile-roles.spec.ts
    - test/unit/account-cli.test.ts
    - test/unit/people/change-person-role.test.ts

key-decisions:
  - "업무 범위 값 이름은 team·company(계획 재량), 새 계급 기본값 team — DB DEFAULT가 정하고 insertRole은 값을 넘기지 않는다"
  - "없는 계급의 업무 범위 변경은 UserFacingError(계급을 찾을 수 없습니다.)로 거부 — 로그의 from 값을 읽으려고 저장 전에 한 번 조회한다"

patterns-established:
  - "게이트 입력 사실(업무 범위)은 계급 컬럼 — can·visible·scopeFor는 읽지 않는다"

requirements-completed: [PROJ-04]

coverage:
  - id: D1
    description: "roles.work_scope 컬럼과 마이그레이션 0013(인라인 CHECK · 시드 계급 셋 company) — squawk 0건, 번호 = 직전 최고 + 1"
    requirement: PROJ-04
    verification:
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 14 files) · 마이그레이션 번호 검증 node 스크립트(ok 0013_role_work_scope) · pnpm db:migrate"
        status: pass
    human_judgment: false
  - id: D2
    description: "시드 값(팀장·기획 PM team, 본부 책임자·대표·시스템 관리자 company) · 관리자 변경과 permission_change 로그 · 기획 PM 거부 · 재시드 보존 · 새 계급 기본값 team · all 거부 · 없는 계급 거부"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/roles.test.ts#계급 업무 범위(D11·D20)"
        status: pass
      - kind: integration
        ref: "test/integration/leak-scan.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "계급 화면 「업무 범위」 칸 — 임시 계급을 전사로 바꾸면 새로 고쳐도 남고 되돌릴 수 있다, 시드 값 표시, 375px 머리글 한 줄·가로 스크롤 없음"
    requirement: PROJ-04
    verification:
      - kind: e2e
        ref: "test/e2e/roles.spec.ts#계급 업무 범위 칸 (04-27 · D11·D20)"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-roles.spec.ts"
        status: pass
    human_judgment: true
    rationale: "화면 칸 추가 — CLAUDE.md §6에 따라 별도 에이전트의 CI=true 독립 DOM 감사와 /design-review가 판정한다"

duration: 15min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 27: 계급 업무 범위(자기 팀/전사) Summary

**계급마다 `work_scope`(team/company, 인라인 CHECK)를 두고 마이그레이션 0013·시드가 같은 기본값을 채우며, 관리자가 계급 표의 「업무 범위」 select로 바꾸면 permission_change 로그(from·to)와 함께 저장된다**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-09-25T01:06:31Z
- **Completed:** 2026-09-25T01:21:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- `roles.work_scope` + `db/migrations/0013_role_work_scope.sql` — 실제 이름이 계획 번호 0013과 같다(생성기 출력 그대로, journal idx 13). 락 타임아웃 한 쌍 → 인라인 CHECK `ADD COLUMN` → 시드 계급 셋 `company` UPDATE. `-- rollback-floor:` 표시 없음
- 시드(`SEED_ROLES`)와 마이그레이션의 계급별 값이 같다. 재시드는 `onConflictDoNothing`이라 관리자 변경을 덮지 않는다(통합 테스트로 고정)
- `setRoleWorkScope`(domain·repository) + `setRoleWorkScopeAction`(zod enum, 등록) + 계급 표 「업무 범위」 열 — 바꾸면 즉시 저장하고, 실패하면 서버 값으로 되돌리며 오류를 칸 아래 한 줄(이름 칸과 같은 `styles.registeredHint`)로 보인다. 확인 창 없음, 보관된 행은 select 비활성, 새 색·서체·폭 없음(`styles.select` 재사용)
- `can.ts`·`visible.ts`·`scope-for.ts` diff 0줄(금지 항목 지킴)

## 운영 안내 — 비시드 계급의 업무 범위

**경영관리는 시드 계급이 아니다.** 관리자가 만든 계급은 업무 범위 `자기 팀`으로 시작한다. 경영관리 같은 계급에 `projects.status`를 켜서 전사 프로젝트의 상태를 다루게 하려면 관리자가 계급 화면(`/admin/people/roles`)에서 그 계급의 「업무 범위」를 `전사`로 바꿔야 한다. 이 값을 읽는 판정(오늘 기준 발령 이력의 소속 팀 × 프로젝트 팀)은 04-20이 `domain/projects/status.ts`에 두고, 04-21·04-22가 같은 함수를 부른다. 04-20 SUMMARY의 권한표 기본값 안내에도 같은 문장을 적어야 한다.

## Task Commits

1. **Task 1 RED: 업무 범위 칸 E2E** — `97bb210` (test)
2. **Task 2 RED: 업무 범위 규칙 통합 테스트** — `4f2dfe4` (test)
3. **Task 1 GREEN(Task 2 규칙 포함): 컬럼·마이그레이션·시드·domain·액션·화면** — `5caf481` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## TDD / 검증 기록

- **RED(Task 1):** `CI=true pnpm playwright test test/e2e/roles.spec.ts test/e2e/mobile-roles.spec.ts` → exit 1. 대상 테스트가 `팀장 업무 범위` select `element(s) not found`로 실패. 모바일(`--project=mobile-375 --no-deps`)은 머리글 수 `Expected: 5 / Received: 4`로 실패
- **RED(Task 2):** `pnpm vitest run --project integration test/integration/roles.test.ts` → 기존 6건 통과, 새 7건 실패(`workScope` undefined · `setRoleWorkScope is not a function`)
- `gsd check tdd-red-evidence`는 두 기록 모두 `zero_tests_discovered`로 판정했다. 이 도구는 node:test TAP만 읽고 Playwright line·Vitest 중첩 TAP 출력은 읽지 못한다. 그래서 RED는 위 실패 줄로 직접 확인했다
- **GREEN:** `pnpm lint:sql` Found 0 issues · 번호 검증 `ok 0013_role_work_scope` · `bash scripts/dev-db.sh && pnpm db:migrate` exit 0 · `.squawk.toml` diff 0줄 · `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0 · E2E(CI=true) 175 passed · 통합(roles·leak-scan·migration-upgrade) 847 passed · 단위 949 passed
- **트레이서 게이트:** interactive · end-of-phase · automated-only verify라서 verify를 다시 돌렸고, 전부 초록이어서 계속 진행했다
- **전체 게이트 `CI=true pnpm test`는 이 실행자가 돌리지 않았다.** 오케스트레이터가 독립 DOM 감사 뒤에 한 번 돌린다(CLAUDE.md §6)

## Decisions Made

- 값 이름은 `team`·`company`, 화면 라벨은 `자기 팀`·`전사`. 새 계급 기본값은 DB DEFAULT `team`이 정한다
- 없는 계급의 업무 범위 변경은 `UserFacingError("계급을 찾을 수 없습니다.")`로 거부한다. 로그에 from을 남기려면 어차피 저장 전에 한 번 조회해야 한다

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] mobile-roles.spec.ts 머리글 수 4 → 5**
- **Found during:** Task 1
- **Issue:** 기존 폰 스펙이 `th` 개수를 4로 단언한다. 「업무 범위」 열이 생기면 이 단언이 깨지는데, 이 파일은 계획의 files_modified에 없다
- **Fix:** 기대값을 5로 바꿨다. RED 커밋에 포함했다
- **Files modified:** test/e2e/mobile-roles.spec.ts
- **Verification:** RED에서 Expected 5 / Received 4로 실패했고, GREEN에서 통과했다(375px 가로 스크롤·머리글 한 줄 두 테스트도 통과)
- **Committed in:** 97bb210

**2. [Rule 3 - Blocking] 단위 테스트 RoleRow 픽스처 둘에 `workScope` 추가**
- **Found during:** Task 1 (typecheck)
- **Issue:** `test/unit/account-cli.test.ts`·`test/unit/people/change-person-role.test.ts`의 가짜 RoleRow에 새 NOT NULL 컬럼이 없어 TS2322가 났다
- **Fix:** 두 픽스처에 `workScope: "team"` 한 줄씩 추가
- **Files modified:** 위 두 파일
- **Verification:** `pnpm typecheck` 0, 단위 949 passed
- **Committed in:** 5caf481

**3. [절차] Task 2의 RED 테스트를 Task 1 구현 전에 커밋**
- **Issue:** Task 2의 규칙(시드 값·로그·거부·재시드·기본값)은 Task 1 구현이 모두 만든다. Task 1 뒤에 테스트를 쓰면 처음부터 초록이라 RED가 성립하지 않는다
- **Fix:** 통합 테스트를 구현 전에 쓰고, 실패를 확인한 뒤 `test(04-27)`로 커밋했다(4f2dfe4). 그 뒤 feat 커밋 하나(5caf481)가 두 태스크의 테스트를 함께 초록으로 만들었다. Task 2에는 따로 고칠 빈틈이 없어서 별도 feat 커밋이 없다
- **Behavior 여섯 줄 외 한 건 추가:** 「없는 계급 거부」 케이스. Task 1 ③의 「없는 계급은 찾을 수 없음」을 고정한다

**4. [검증 명령] `git diff --stat d6b41cf -- .squawk.toml`의 기준 커밋이 이 저장소에 없음**
- **Issue:** `fatal: bad revision 'd6b41cf'`
- **Fix:** 플랜 시작 HEAD `a8c95fa` 기준으로 같은 diff를 봤다. `.squawk.toml`·`package.json`·`pnpm-lock.yaml`·`can.ts`·`visible.ts`·`scope-for.ts` 합계 0줄. `.squawk.toml`의 마지막 변경 커밋은 b2ebd61(Phase 2)이다

**5. [검증 대상 없음] 오케스트레이터가 가리킨 `test/unit/db/migration-journal.test.ts`가 없음**
- 저장소에 그 파일이 없다. 대신 계획의 번호 검증 node 스크립트(ok)와 `test/integration/migration-upgrade.test.ts`(통과)로 journal·번호를 확인했다

**6. [계획과 다른 부분] E2E 임시 계급을 화면 폼이 아닌 domain `createRole(SYSTEM_VIEWER)`로 만듦**
- **Issue:** 계획은 「기존 스펙의 계급 생성 방식 그대로」라고 했는데, 기존 스펙은 폼으로 만든다. `beforeAll`에는 `page`가 없다
- **Fix:** `archived-session.spec.ts` 선례를 따라 `beforeAll`에서 domain으로 만들고, `afterAll`에서 `archive(SYSTEM_VIEWER, "roles", id)`로 보관한다

---

**Total deviations:** 6건(Rule 3 둘, 절차·검증 환경 넷)
**Impact on plan:** 범위를 늘리지 않았다. 새 기능이나 리팩터 없음.

## Issues Encountered

- 보관된 계급은 계급 화면 목록(`listRoles` 기본값: 보관 제외)에 나오지 않는다. 그래서 「보관된 행 select 비활성」은 코드에만 있고 화면에서는 볼 수 없다. E2E로 단언하지 않았다
- 「두 값 밖(all)은 액션 스키마가 거부」: `actions.ts`는 "use server" → server-only 의존이라 Vitest에서 import할 수 없다. 그래서 액션이 쓰는 것과 같은 `z.enum(ROLE_WORK_SCOPES)`로 거부를 단언하고, domain 직접 호출은 DB CHECK가 거부하는지(DB 재조회로 무변경) 확인했다
- Playwright WebServer 로그의 `Error: The destination stream closed early.`는 RED·GREEN 두 실행 모두에 나왔다. 테스트 결과와는 무관하다

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-20이 `roles.work_scope`를 읽어 `actorCoversProjectTeam`(오늘 기준 발령 이력 × 프로젝트 팀)을 만들 수 있다. 04-21·04-22가 같은 함수를 부른다
- 화면 칸이 추가됐으므로 오케스트레이터의 독립 DOM 감사(CI=true)와 전체 게이트가 남아 있다

## Self-Check: PASSED

- 생성 파일: db/migrations/0013_role_work_scope.sql · db/migrations/meta/0013_snapshot.json 존재
- 커밋: 97bb210 · 4f2dfe4 · 5caf481 존재

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
