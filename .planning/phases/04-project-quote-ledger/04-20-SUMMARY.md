---
phase: 04-project-quote-ledger
plan: 20
subsystem: api
tags: [project-status, gate, permissions, seed, row-lock, drizzle, postgres, action-log]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-06 전이표(ALLOWED_TRANSITIONS·PROJECT_STATUSES)·게이트 진입점 · 04-27 계급 업무 범위(work_scope) · 04-32 withTransaction lock_timeout·recordAction tx 인자 · 04-29 kstToday"
provides:
  - "changeProjectStatus(viewer, projectId, { from, to }, deps?) — 트랜잭션 전 사실 읽기 · FOR UPDATE · 게이트 · 조건부 UPDATE(종료일 채움) + status_change 로그 한 트랜잭션 · 바깥 tx(Phase 5)"
  - "statusDestinations({ to, blockedReason }) · listProjectStatusCatalog · evaluateTransition · loadActorTeamScope · coversProjectTeam · actorCoversProjectTeam · loadStatusChangeFacts · statusChangedMessage · StatusChangedError"
  - "게이트 규칙 project.transition(전이표·메뉴·팀 범위) · project.start-date-required"
  - "denyWrite(viewer, rule, ids, err): never · DenyWriteIds — write.denied 운영 로그의 유일한 입구"
  - "권한표 메뉴 projects.status·projects.complete + 없을 때만 넣는 권한·노출 시드(insertVisibilityIfAbsent)"
  - "repositories/projects: lockProjectForWrite · updateProjectStatusIfCurrent"
  - "changeProjectStatusAction(zod from·to enum) + 레지스트리 등록"
  - "test/integration/lock-race.ts — deferred · waitForLockWaiter(sleep 없는 경합 재현)"
affects: [04-21, 04-22, 04-11, 04-12, 04-26, 04-13, 04-14, 04-40, 04-07, 04-15, phase-05-approval]

actuals:
  tokens: 20900
  tasks: 3
  commits: 5
plan_head_before: efa73d0016f19941ae97de8b0598c5cb31363962

tech-stack:
  added: []
  patterns:
    - "트랜잭션 전 사실 읽기(loadStatusChangeFacts) → 잠근 tx 안에서는 tx만 — 풀 2 동시 셋으로 증명"
    - "거부는 전부 denyWrite(허용 목록 키 복사 · 이유 문자열 제외) 한 함수"
    - "시드: 시스템 관리자만 upsert, 나머지 계급은 없을 때만(권한·노출)"
    - "경합 테스트: deps.afterLock + deferred + pg_stat_activity 잠금 대기 폴링"

key-files:
  created:
    - domain/projects/status.ts
    - domain/rules/deny-write.ts
    - test/unit/domain/project-status.test.ts
    - test/integration/lock-race.ts
  modified:
    - domain/permissions/menus.ts
    - domain/permissions/roles.ts
    - domain/seed/index.ts
    - repositories/permissions.ts
    - repositories/projects.ts
    - domain/rules/register.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/actions.registry.ts
    - test/integration/project-status.test.ts
    - test/integration/tx-safety.test.ts
    - test/unit/domain/rules-gate.test.ts
    - test/integration/visibility.test.ts
    - test/integration/projects-list.test.ts
    - test/integration/revenue-entries.test.ts

key-decisions:
  - "전환 판정을 evaluateTransition 하나로 모아 changeProjectStatus와 statusDestinations가 같은 게이트 판정을 쓴다 — 종료일 채움 여부도 start-date 규칙에 「시작일 없이」 물어 정하므로 전환 함수 본문에 상태 이름 리터럴이 없다"
  - "write.denied의 errorName은 err.constructor.name — UserFacingError 계열은 name을 두지 않아 err.name이 늘 \"Error\"다(lib/gcp/cloud-sql-admin.ts 선례)"
  - "동시 변경·보관 행 거부도 denyWrite로 남긴다(rule: project.status-current · projects.view) — 전환 함수의 거부가 전부 한 입구를 지난다"
  - "Phase 5 연결점으로 loadStatusChangeFacts를 내보낸다 — 결재 호출자는 자기 트랜잭션을 열기 전에 사실을 읽어 deps.facts로 넘긴다"
  - "액션 레지스트리는 대표 메뉴 projects.status · dtoName null(DTO를 돌려주지 않음) — 쌍별 메뉴 판정은 게이트"

patterns-established:
  - "denyWrite: 거부 운영 로그의 한 입구 — 뒤 플랜(04-11·04-22·04-12·그룹 B)이 부른다"
  - "lock-race.ts: afterLock에서 A를 멈추고 waitForLockWaiter로 B의 대기를 확인한 뒤 A를 푼다(finally에서 반드시 푼다)"

requirements-completed: [PROJ-04]

coverage:
  - id: D1
    description: "사람의 전환 넷(수주중→진행·수주중→미수주·미수주→진행·정산→완료)이 권한표·팀 범위·시작일 규칙대로 실제 DB에서 동작하고 status_change 한 줄(trigger manual)을 남긴다"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#(a)(b) 네 전환이 실제 DB에서 상태를 바꾸고"
        status: pass
      - kind: unit
        ref: "test/unit/domain/project-status.test.ts#evaluateTransition — 전환 × 주체 결정표"
        status: pass
    human_judgment: false
  - id: D2
    description: "시드만 있는 DB에서 자기 팀 팀장이 전환하고 상세를 본다 · 노출을 꺼도 권리는 그대로(ENG-D2)"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#자기 팀 팀장이 시작일만 있는 수주중 프로젝트를 진행으로"
        status: pass
      - kind: integration
        ref: "test/integration/project-status.test.ts#(l) ENG-D2"
        status: pass
    human_judgment: false
  - id: D3
    description: "완료는 대표·시스템 관리자만, 다른 팀 팀장·담당 PM 거부, 어제 팀을 옮긴 팀장은 오늘 옛 팀 프로젝트 거부"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#(h) D-79"
        status: pass
      - kind: integration
        ref: "test/integration/project-status.test.ts#(j) D11"
        status: pass
    human_judgment: false
  - id: D4
    description: "상태 변경과 로그가 한 트랜잭션 · 오래된 화면·두 연결 경합에서 한 사람만 성공 · 바깥 tx 롤백 · 풀 2 동시 셋 시간 초과 0"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#원자성·경합·시드 보존"
        status: pass
      - kind: integration
        ref: "test/integration/tx-safety.test.ts#풀 2 · 동시 상태 전환 셋(04-20)"
        status: pass
    human_judgment: false
  - id: D5
    description: "배포 시드가 관리자가 끈 권한(팀장 projects.status)·노출(기획 PM quote.amount·대표 revenue.issued_amount)을 되살리지 않는다(PR #38 알려진 문제 종결)"
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#A-05 · ENG-D3 ③"
        status: pass
    human_judgment: false
  - id: D6
    description: "갈 곳 목록(막힘 이유)·상태 코드표 목록·denyWrite 허용 목록"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/project-status.test.ts#statusDestinations · listProjectStatusCatalog"
        status: pass
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#denyWrite"
        status: pass
      - kind: integration
        ref: "test/integration/project-status.test.ts#(k) A-10"
        status: pass
    human_judgment: false

duration: 38min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 20: 사람의 상태 전환 넷(서버) Summary

**팀장·본부 책임자·대표가 권한표 메뉴 `projects.status`·`projects.complete`와 계급 업무 범위(오늘 KST 발령 이력)로 전환하고, 판정은 게이트 두 규칙 하나로, 상태 변경과 `status_change` 로그는 `FOR UPDATE` 잠금 아래 한 트랜잭션으로 묶었다. 시드는 시스템 관리자 밖 계급의 권한·노출을 없을 때만 넣어 관리자 변경을 더 이상 되돌리지 않는다.**

## Performance

- **Duration:** 약 38분
- **Started:** 2026-09-25T01:52:17Z
- **Completed:** 2026-09-25T02:30:38Z
- **Tasks:** 3/3
- **Files modified:** 18(생성 4 + 수정 14)

## Accomplishments

- 권한표 메뉴 `projects.status`(프로젝트 상태 변경)·`projects.complete`(프로젝트 완료). 시드는 팀장·본부 책임자·대표에게 `projects` 보기 + `projects.status` 쓰기, 대표에게 `projects.complete` 쓰기를 `insertPermissionIfAbsent`로 넣는다(시스템 관리자는 전 메뉴 upsert 그대로)
- 노출 시드: 기획 PM·팀장·본부 책임자 = `staffDefault`, 대표 = `staffDefault` + `revenue.*` — 전부 `insertVisibilityIfAbsent`. 시스템 관리자 루프만 `upsertVisibility`. **PR #38 알려진 문제 「시드가 기본 직급의 노출표를 매 배포 되돌림」을 닫았다**(회귀 테스트: ENG-D3 ③)
- `domain/projects/status.ts` — `changeProjectStatus`(트랜잭션 전: 행 범위·두 메뉴·업무 범위·라벨 → 트랜잭션 안: `lockProjectForWrite` → `afterLock` → from 비교 → 게이트 → 조건부 UPDATE → `recordAction({ tx })`), `statusDestinations`, `listProjectStatusCatalog`, `evaluateTransition`, 업무 범위 판정 셋, `statusChangedMessage`
- 업무 범위·소속은 `findRoleById`·`findMembershipAtDate`로 직접 읽는다 — `teamAtDate`·`project()`를 거치지 않는다(관리자가 「팀 정보」 노출을 꺼도 권리 그대로, 통합 (l))
- `domain/rules/deny-write.ts` — `denyWrite`가 허용 목록 키만 하나씩 복사해 `write.denied` 한 줄을 남기고 던진다. 이유 문자열·금액 키는 실리지 않는다(캐스팅으로 넣어도)
- `changeProjectStatusAction`(zod: `projectId` uuid · `from`/`to` = `PROJECT_STATUSES` enum) + 레지스트리 등록(누수 스캔 커버리지 통과)
- `can.ts`·`visible.ts`·`scope-for.ts` diff 0줄, 새 의존성 0개

## 운영 안내 — 권한표 기본값과 비시드 계급

- **비시드 계급은 자기 팀(업무 범위)으로 시작 — 전사 업무라면 관리자가 계급 화면에서 전사로 바꿔야 함.**
- **경영관리는 시드 계급이 아니다.** 경영관리가 프로젝트 상태를 다뤄야 하면 관리자가 권한표에서 그 계급에 `projects.status`(필요하면 `projects` 보기도)를 배정하고, 전사 프로젝트를 다루는 업무라면 계급 화면(`/admin/people/roles`)에서 「업무 범위」를 `전사`로 바꾼다. 바꾸지 않으면 그 계급은 오늘 발령 이력상 자기 팀 프로젝트만 전환한다. 정산 → 완료는 `projects.complete`가 따로 있어야 한다(시드는 대표에게만 켠다).
- Phase 4에서 정산 → 완료를 할 수 있는 사람은 대표와 시스템 관리자뿐이다. **Phase 5 호출자는 결재 트랜잭션을 열기 전에 `loadStatusChangeFacts`로 사실을 미리 읽어 `deps.facts`로 넘기고, 결재 트랜잭션을 `deps.tx`로 넘긴다** — 사실을 넘기지 않으면 바깥 tx 안에서 풀을 부르게 된다(ARCHITECTURE §4-8).
- `SYSTEM_VIEWER`로 남는 로그는 `actorRoleId='role-sysadmin'`이다 — 계급으로 로그를 거르는 화면은 시스템과 시스템 관리자를 섞을 수 있다(동작 변경 없음, A-39 NOTE).

## 새 문구(rev 5에 없는 서버 방어 — 화면은 이 요청을 만들지 않는다)

| 문구 | 언제 | 규칙 |
|---|---|---|
| `갈 수 없는 상태 · 새로 고침` | 전이표에 없는 쌍 | project.transition |
| `상태 바꾸기 권한 없음` | 그 쌍의 메뉴 권한 없음 | project.transition |
| `다른 팀 프로젝트 · 상태 바꾸기 권한 없음` | 업무 범위가 프로젝트 팀을 덮지 않음 | project.transition |

화면에 닿는 두 문구는 rev 5 원문 그대로다: `시작일 없음 · 기간 적기`(`blockedReason`) · `상태가 {라벨}{으로|로} 바뀜 · 새로 고침`. rev 5 Copywriting에 셋을 올릴지는 페이즈 검증 때 보고한다. 프로젝트가 없을 때는 기존 `domain/revenue`와 같은 `존재하지 않는 프로젝트입니다.`를 쓴다.

**사용성 원칙(CLAUDE.md §7)과의 관계:** 방어 문구 셋은 화면이 버튼을 그리지 않아(`statusDestinations`가 빈 목록) 정상 사용 중에는 보이지 않는다. 화면이 스스로 막힘 이유를 만들지 않고 서버의 `blockedReason` 한 줄만 쓰는 계약이라 문구·결정 최소화 원칙과 충돌하지 않는다고 판단했다 — 범위는 넓히지 않았다.

## Task Commits

1. **Task 1 (tracer) RED** — `70b9897` test: 시드만 있는 DB의 팀장 진행 전환 · PM 직접 호출 거부
2. **Task 1 GREEN** — `22abaf5` feat: 메뉴·시드·게이트 규칙·denyWrite·잠금 리포지토리·전환 함수·액션
3. **Task 2 RED** — `00f87bc` test: 결정표·갈 곳·코드표·경계·denyWrite 단위 + 통합 (a)~(d)(h)(j)(k)(l)
4. **Task 2 GREEN** — `3823ee3` feat: evaluateTransition·statusDestinations·listProjectStatusCatalog
5. **Task 3** — `e8fa3f6` test: lock-race 도우미 · 원자성·경합·시드 보존 · 풀 2 동시 전환 셋

**Plan metadata:** 이 SUMMARY 커밋(docs)

## TDD / 검증 기록

- **Task 1 RED:** 처음엔 새 모듈이 없어 파일 로드가 깨졌다(INVALID_RED). 서명만 있고 던지기만 하는 `domain/projects/status.ts` 뼈대를 RED 커밋에 넣었다. 그 뒤 새 2건이 실패하고(`not implemented` · `expected Error ... to be an instance of GateBlockedError`) 기존 2건은 통과했다
- **Task 1 GREEN / 트레이서 게이트:** lint 0 · typecheck 0 · build 0 · import-cycles 2 통과 · 통합(project-status·leak-scan·visibility·roles) 통과. interactive + end-of-phase + automated-only verify라 verify를 다시 돌렸고 초록이어서 확장했다
- **Task 2 RED:** 단위 79건 실패(`evaluateTransition`·`statusDestinations`·`listProjectStatusCatalog is not a function`), 통합 (k) 실패. Task 1이 이미 만든 부분의 케이스(`changeProjectStatus` 통합 (a)~(d)(h)(j)(l), `denyWrite`, `statusChangedMessage`, 업무 범위)는 처음부터 통과했다 → **GREEN 뒤 변이 4건으로 검출력을 확인했다**: denyWrite를 `...ids` 펼침으로 → 실패, 조사에서 ㄹ받침 예외 제거 → 실패, `coversProjectTeam` 항상 참 → 단위 6·통합 (j) 실패, 종료일 채움 항상 참 → 통합 (a) 실패
- **Task 3:** 구현은 Task 1·2에서 끝나 새 케이스가 처음부터 통과했다(플랜 순서상 트레이서가 시드 수정을 먼저 넣었다). **RED는 결함을 되살리는 변이 6건으로 확인했다:**
  - 노출 시드를 `upsertVisibility`로 되돌림(PR #38 알려진 문제 재현) → ENG-D3 ③ `expected true to be false`(기획 PM `quote.amount`가 재시드로 되살아남)
  - 권한 시드를 `upsertPermission`으로 되돌림 → A-05 실패
  - `FOR UPDATE` 제거 → OV-3 `waitForLockWaiter: 4000ms 안에 잠금 대기 연결이 생기지 않았다`
  - `recordAction`에서 `tx` 제거 → A-23 로그 1줄 남음
  - 로그 실패를 삼킴 → A-01 `promise resolved instead of rejecting`
  - 사실 읽기를 잠근 tx 안으로 옮김 → 풀 2 동시 셋 `expected [] to have a length of 1`(한 건도 성공 못 함)
- `gsd check tdd-red-evidence`는 Vitest 출력을 읽지 못해(04-27 기록과 같음) 위 실패 줄로 직접 확인했다
- **최종 실행(이 실행자):** lint 0 · typecheck 0 · build 0 · 단위 전체 1047 통과(86 파일) · 통합 전체 1106 통과(43 파일). 전체 게이트 `CI=true pnpm test`(E2E 포함)는 돌리지 않았다 — 오케스트레이터가 돌린다
- 플랜 `<verification>`: `register.ts` 규칙 셋(`project.line-edit`·`project.transition`·`project.start-date-required`) · `status.ts`에 `teamAtDate`·`project(`·`log.warn(` 0건 · `grep -rn "먼저 상태를 바꿨" domain app` 0건 · `package.json` 의존성 객체 넷이 d6b41cf와 같고 `pnpm-lock.yaml` diff 0

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 시드 변경으로 전제가 깨진 기존 통합 테스트 셋**
- **Found during:** Task 1 verify
- **Issue:** 셋 다 「대표(role-ceo)에게는 시드 권한·노출 행이 없다」를 전제했다. 이 플랜이 대표에게 `projects` 보기와 노출 기본값을 주면서 깨졌다 — `visibility.test.ts` (c)(행 없는 계급), `revenue-entries.test.ts` 「projects view 권한이 없는 viewer」, `projects-list.test.ts`의 금액 미노출 계급(대표가 이제 `quote.amount`를 받음)
- **Fix:** 앞 둘은 권한·노출 행이 전혀 없는 새 계급(`insertRole`)으로 바꿨다. 셋째는 `quote.amount`를 명시적으로 끈다(e2e `quote-table.spec.ts`와 같은 결). 단언은 바꾸지 않았다
- **Files modified:** test/integration/visibility.test.ts, test/integration/revenue-entries.test.ts, test/integration/projects-list.test.ts
- **Commit:** 22abaf5

**2. [계획 밖 파일] `domain/permissions/roles.ts`에 계급 id 상수 셋 추가**
- **Issue:** 플랜은 「계급 id는 roles.ts의 상수에서 가져온다」고 했는데 `role-ceo`·`role-division-head`·`role-team-lead` 상수가 없었다
- **Fix:** `CEO_ROLE_ID`·`DIVISION_HEAD_ROLE_ID`·`TEAM_LEAD_ROLE_ID` 세 줄을 더했다. `SEED_ROLES` 리터럴은 건드리지 않았다
- **Commit:** 22abaf5

**3. [계획과 다른 부분] `denyWrite`의 `errorName`이 `err.name`이 아니라 `err.constructor.name`**
- **Issue:** `UserFacingError`·`GateBlockedError`는 `name`을 두지 않아 `err.name`이 늘 `"Error"` — 오류 종류를 식별하지 못한다
- **Fix:** 클래스 이름을 쓴다(`lib/gcp/cloud-sql-admin.ts` 선례). 단위 테스트가 `GateBlockedError`를 단언한다. **주의:** 프로덕션 빌드가 서버 코드 클래스 이름을 줄이면 값이 짧아질 수 있다(`next.config.ts`에 별도 설정 없음) — 로그 검색은 `rule`로 하면 된다

**4. [계획과 다른 부분] 공개 함수 둘 추가 — `evaluateTransition` · `loadStatusChangeFacts`**
- 플랜의 exports 목록에는 없다. `evaluateTransition`은 전환 함수와 갈 곳 목록이 같은 판정을 쓰게 하는 한 곳이고(단위 결정표가 이 함수를 직접 친다), `loadStatusChangeFacts`는 플랜이 요구한 「Phase 5 호출자는 사실을 미리 읽어 넘긴다」의 진입점이다

**5. [계획과 다른 부분] `project.start-date-required`는 `ALLOWED_TRANSITIONS`를 읽지 않는다**
- 수용 기준 문장은 「두 규칙이 `ALLOWED_TRANSITIONS`를 읽으며」인데, 시작일 규칙은 목적지가 진행인지만 보면 된다(규칙 안의 `"in_progress"` 비교 — 상태 이름 비교가 허용된 자리). 전이표 조회는 `project.transition`만 한다

**6. [절차] Task 1 RED 커밋에 서명만 있는 뼈대 파일 포함**
- 새 모듈이 없으면 파일 로드 오류(INVALID_RED)라서, 던지기만 하는 `changeProjectStatus` 서명을 RED 커밋(70b9897)에 넣었다. GREEN 커밋이 전부 대체했다

**7. [절차] Task 3에 feat 커밋 없음 · Task 2 일부와 Task 3 전체는 처음부터 초록**
- 플랜 순서상 Task 1 트레이서가 시드 보존·잠금·원자성까지 구현했다. 그래서 오케스트레이터가 요구한 「노출 재시드 회귀 테스트가 수정 전에 RED」는 **수정 전 동작(upsertVisibility)으로 되돌리는 변이**로 증명했다(위 TDD 기록). 테스트는 Task 3 커밋(e8fa3f6)에 있다

**8. [테스트 위생] OV-3 테스트가 대기 확인 실패 시 A를 풀지 않던 문제**
- 변이 실행 중 `waitForLockWaiter`가 던지자 A가 잠금을 쥔 채 남아 뒤 테스트의 TRUNCATE가 10초 시간 초과로 줄줄이 실패했다. `finally`에서 A를 풀도록 고쳤다(e8fa3f6). 도우미 쓰는 법 주석에도 적었다

**9. [기준 커밋] 플랜이 가리킨 d6b41cf가 처음엔 없었음**
- 얕은 복제였다(`is-shallow-repository` true). 규칙대로 `git fetch --deepen=400 origin claude/gsd-progress-e1nzgu` 뒤 d6b41cf가 보였고, 그 커밋 기준으로 의존성 객체·lockfile을 비교했다(같음). 다른 커밋으로 바꾸지 않았다

**Total deviations:** 9건(자동 수정 1 · 계획 밖 파일 1 · 계획과 다른 구현 3 · 절차 3 · 기준 커밋 1). **Impact:** 동작 범위는 플랜 그대로다. 공개 함수 둘과 상수 셋이 늘었다.

## Issues Encountered

- 기존 테스트 파일 몇 곳의 주석(`revenue-entries.test.ts` 43행 등 「role-ceo는 시드가 sysadmin·pm 둘만 채운다」)이 이제 사실이 아니다. 동작에는 영향이 없어 이 플랜에서 고치지 않았다(요청 밖 주석 수정 금지)

## Next Phase Readiness

- 04-21(화면)은 `changeProjectStatusAction`·`statusDestinations`·`listProjectStatusCatalog`·게이트 문자열을 그대로 쓴다. 04-22는 `statusChangedMessage(label, "전부 거부")`·`actorCoversProjectTeam`을, 04-11·04-12·그룹 B는 `denyWrite`·`lock-race.ts`를 쓴다
- E2E는 이 실행자가 돌리지 않았다 — 시드 변경(대표·팀장·본부 책임자 노출·권한)이 E2E 전제를 바꾸는지는 오케스트레이터의 `CI=true pnpm test`에서 확인된다. 대표 계정을 쓰는 E2E 셋(`number-format`·`quote-table`·`revenue-section`)은 필요한 값을 upsert로 직접 정하므로 영향이 없을 것으로 본다(미확인)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*

## Self-Check: PASSED

생성 파일 5개(status.ts·deny-write.ts·단위 테스트·lock-race.ts·이 SUMMARY)가 디스크에 있고, 커밋 5개(70b9897·22abaf5·00f87bc·3823ee3·e8fa3f6)가 `git log --all`에 있다. `commits: 5`는 `git rev-list --count efa73d0..HEAD`로 잰 값이다.
