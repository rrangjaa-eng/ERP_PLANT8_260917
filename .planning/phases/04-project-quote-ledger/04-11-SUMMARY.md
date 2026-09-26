---
phase: 04-project-quote-ledger
plan: 11
subsystem: projects
tags: [auto-settlement, skip-locked, kst-date, drizzle, postgres, next-app-router]

requires:
  - phase: 04-20
    provides: changeProjectStatus · lockProjectForWrite · updateProjectStatusIfCurrent · recordAction tx 인자 · lock-race 도우미
  - phase: 04-21
    provides: lastStatusChangeOn · findLatestActionFor(tx) · 상세 머리 줄(StatusChange)
  - phase: 04-29
    provides: lib/kst-date(kstToday · kstDateOf · kstYear · addDays)
  - phase: 04-27
    provides: roles.work_scope(team · company)
  - phase: 04-32
    provides: withTransaction(lock_timeout 5s) · ARCHITECTURE §4-8 잠근 tx 안 풀 호출 금지
provides:
  - applyAutoSettlement(읽기 입구 — 짧은 별도 tx · SKIP LOCKED · fail-open) · loadProjectForGate(쓰기 입구 — 잠금 안 판정 · fail-closed) · effectiveOnFor
  - settleForProjectList(목록 요청당 한 번) · findProject 선판정(행 범위 · uuid 모양 확인 뒤)
  - settleOverdueProjects(리포 — FOR UPDATE SKIP LOCKED 하위 선택 + 직전 status_change 시각 RETURNING)
  - isEndDatePassed · projectResponsibles · teamLeadCandidatesAtDate(한 쿼리)
  - 상세 머리 줄 「종료일 지남」 / 「종료일 지남 · 팀장 {이름}」
  - createProject 번호 연도 KST(kstYear)
affects: [04-12, 04-14, 04-17, 04-18, 04-22, 04-30, 04-40, 04-44, phase-7-scheduler]

actuals:
  tokens: 18800
  tasks: 3
  commits: 6
plan_head_before: ca75dd9ebc2bd0221b2fb8d872cdce69899dfe85

tech-stack:
  added: []
  patterns:
    - "읽기 시점 판정 두 입구 — 읽기는 별도 짧은 tx + SKIP LOCKED + 실패 격리, 쓰기는 호출자 tx 안 잠금 뒤 판정(실패 전파)"
    - "상태 변경과 그 행동 로그는 같은 tx(recordAction { tx })"
    - "오늘(KST)은 앱이 now()에서 계산해 쿼리 인자로 — DB 현재 날짜 함수 금지"
    - "한글 이름순은 JS localeCompare('ko') — DB ORDER BY 정렬 규칙에 기대지 않음"

key-files:
  created:
    - domain/projects/auto-transition.ts
    - domain/projects/responsibles.ts
    - test/unit/domain/auto-transition.test.ts
    - test/integration/project-auto-settlement.test.ts
    - test/e2e/project-period.spec.ts
  modified:
    - domain/projects/status-transitions.ts
    - domain/projects/status.ts
    - domain/projects/index.ts
    - repositories/projects.ts
    - repositories/team-memberships.ts
    - app/(app)/projects/page.tsx
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css

key-decisions:
  - "settleOverdueProjects의 직전 변경 시각은 RETURNING 안 스칼라 하위 질의로 한 문장에서 읽는다(Drizzle에서 막히지 않아 두 번째 SELECT 대안은 쓰지 않음)"
  - "잘못된 id의 상세는 soft 404(404 화면 + noindex, HTTP 200) — app/(app)/projects/loading.tsx 스트리밍 때문에 상태 코드 404는 불가. 진짜 404는 loading.tsx 재배치 또는 proxy가 필요해 사용자 결정으로 넘김"
  - "팀장 이름은 「상태 바꾸기」가 없는 사람에게 종료일 지남일 때만 조회(이름이 실제로 쓰일 때만)"
  - "팀장 권한 결정(04-21 미답)은 04-11에 필요 없음 — 04-11 경로는 팀장 시드의 projects.status 쓰기만 쓴다. 시드·권한 손대지 않음"

patterns-established:
  - "쓰기 경로 선판정: 새 저장·차수 경로(04-12·04-22·04-14·04-40)는 lockProjectForWrite 대신 loadProjectForGate(viewer, id, { now, tx, afterLock })를 부르고 반환 행으로 from·seenStatus를 비교한다"
  - "목록 입구: 목록·합계를 나란히 읽기 전에 settleForProjectList(viewer) 한 번(04-17이 loadProjectList 안으로 옮김)"

requirements-completed: [PROJ-04]

coverage:
  - id: D1
    description: "진행 프로젝트가 종료일 다음 날 KST 00:00부터 정산 — 경계 · 멱등(두 번·동시) · 시스템 행위자 · 발효일 · 로그 실패 롤백 · 대상 밖 상태 불변"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/auto-transition.test.ts#applyAutoSettlement"
        status: pass
      - kind: integration
        ref: "test/integration/project-auto-settlement.test.ts#(a)(b)(c)(d)(e2) · 세션 시간대 UTC"
        status: pass
    human_judgment: false
  - id: D2
    description: "상세 읽기 선판정 — 행 범위·uuid 모양 확인 뒤에만 판정, 실패는 로그만 남기고 저장된 상태로 읽기 계속"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-auto-settlement.test.ts#(e)(e3)(e4)"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-period.spec.ts#(1) 종료일이 어제인 진행 프로젝트"
        status: pass
    human_judgment: false
  - id: D3
    description: "목록 요청당 판정 한 번(settleForProjectList) · 쓰기 경로 잠금 안 판정(loadProjectForGate) · SKIP LOCKED 경합 · fail-closed · 쓰기 거부 뒤 다음 읽기 정산 · 번호 연도 KST"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/auto-transition.test.ts#loadProjectForGate"
        status: pass
      - kind: integration
        ref: "test/integration/project-auto-settlement.test.ts#(f)(f2)(f3)(f4)(h)(i)(j)(k)(l)"
        status: pass
      - kind: integration
        ref: "test/integration/tx-safety.test.ts · project-status.test.ts · projects-list.test.ts · quote-lines.test.ts · document-numbering.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "잘못된 모양의 id · 없는 uuid → 404 화면(오류 화면 아님)"
    requirement: PROJ-04
    verification:
      - kind: e2e
        ref: "test/e2e/project-period.spec.ts#(0)"
        status: pass
    human_judgment: true
    rationale: "HTTP 상태 코드는 200(soft 404 + noindex)이다 — 플랜 수용 기준 「응답이 404」와 다르다. loading.tsx 재배치·proxy 중 무엇을 할지 사람이 정해야 한다"
  - id: D5
    description: "종료일 지남 표시 + 팀장 이름 출처(한 쿼리 · 보관·옮긴 사람·권한 끈 계급·company 계급 제외)"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/auto-transition.test.ts#isEndDatePassed · projectResponsibles"
        status: pass
      - kind: integration
        ref: "test/integration/project-auto-settlement.test.ts#팀장 이름 출처"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-period.spec.ts#(2)"
        status: pass
    human_judgment: true
    rationale: "머리 줄 1280·1024·375 overflow backstop은 오케스트레이터의 독립 DOM 감사(CI=true)가 판정한다 — 아직 안 돌았다"

duration: 32min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 11: 자동 정산 · 쓰기 선판정 · 종료일 지남 Summary

**종료일 다음 날(KST)부터 진행 → 정산을 읽기 시점에 판정한다: 읽기는 짧은 별도 트랜잭션 + `FOR UPDATE SKIP LOCKED` + 실패 격리(`applyAutoSettlement`), 쓰기는 잠근 트랜잭션 안 판정 + 실패 전파(`loadProjectForGate`), 상태 변경과 시스템 행위자 로그는 한 트랜잭션. 상세 머리 줄에 `종료일 지남`(· 팀장 {이름}) 표시.**

## Performance

- **Duration:** 약 32분
- **Started:** 2026-09-25T04:23:17Z
- **Completed:** 2026-09-25T04:55:28Z
- **Tasks:** 3 (트레이서 1 + tdd 2)
- **Files modified:** 14 (신규 5 · 수정 9)

## Accomplishments

- `settleOverdueProjects`: 대상을 `FOR UPDATE SKIP LOCKED` 하위 선택으로 잠그고, 바깥에 `AND status = from`을 둔 조건부 UPDATE 한 문장. RETURNING이 직전 `status_change` 시각을 함께 돌려준다. 오늘(KST)은 인자로만 받는다.
- `applyAutoSettlement`: 짧은 별도 tx 안에서 UPDATE와 행마다 `recordAction(SYSTEM_VIEWER, …, { tx })`를 함께 처리한다. 바뀐 행이 있으면 `project.auto_settle`(count)를 남긴다. 실패하면 `project.auto_settle_failed`(projectIds · reason)만 남기고 `[]`를 돌려준다.
- `loadProjectForGate`: 호출자 tx에서 잠금 → `afterLock` → 판정 대상이면 같은 tx로 UPDATE, `findLatestActionFor(…, tx)`, 시스템 로그를 처리하고 판정 뒤 행을 돌려준다. 실패는 그대로 던진다. `changeProjectStatus`가 이 함수를 쓴다.
- `findProject`: 행 범위 → uuid 모양 → 판정 → 읽기 순서로 돈다. `settleForProjectList`는 목록 `page.tsx`의 `Promise.all` 앞에서 한 번만 불린다. `listProjects`·`aggregateProjects`는 판정하지 않는다.
- 발효일 = `max(종료일 + 1, 직전 변경일 KST)`. `lastStatusChangeOn`은 최신 로그 detail에 `effectiveOn`이 있으면 그 날짜를 쓴다.
- `createProject` 번호 연도를 `kstYear(deps.now)`로 바꿨다(C-17).
- `isEndDatePassed`(status.ts)를 더했다. `teamLeadCandidatesAtDate`는 한 문장으로 조회하고, `projectResponsibles`는 JS `localeCompare('ko')`로 이름순 첫 사람을 고른다. 상세 머리 줄의 `.statusLine` 묶음 안에 `--fs-sm --warning` 글자를 넣었다.

## Task Commits

1. **Task 1: 트레이서 — 상세 읽기 자동 정산**: RED `aa0a7df` (test) → GREEN `bf8fc47` (feat)
2. **Task 2: 목록·합계·상태 전환·번호 연도**: RED `96433ce` (test) → GREEN `d5d5a59` (feat)
3. **Task 3: 종료일 지남 + 담당자 이름 출처**: RED `23abcd4` (test) → GREEN `371a94b` (feat)

리팩터 커밋은 없다(바꿀 것이 없었다).

## TDD 증거 (RED → GREEN)

모든 RED는 모듈 로드 실패가 아니라 단언 실패로 확인했다. 타입만 둔 뼈대를 RED 커밋에 함께 넣었다. `gsd-tools check tdd-red-evidence` 판정은 모두 `RED_EVIDENCE_OK`다(vitest `tap-flat` 출력에 node-test 요약 줄을 붙였다).

- Task 1 단위 RED 7건, 예: `effectiveOnFor … 직전 변경일이 이르면 종료일 + 1` → `expected '' to be '2026-09-18'`. 통합 RED 8건: (a)(b)(c)(e)(e2)(e3)(e4), 시간대(`Etc/UTC`). E2E RED 2건: (0)은 오류 화면, (1)은 태그 없음.
- Task 2 단위 RED 3건(loadProjectForGate). 통합 RED 7건: (f)(f3)(h)(i)(j)(k)(l). (f2)(f4)는 뼈대에서도 초록인 부정 단언이다.
- Task 3 단위 RED 3건(`isEndDatePassed` 참 케이스 · `projectResponsibles` 두 건). 통합 RED 3건. E2E (2) RED(`종료일 지남` 없음).
- 변이 확인:
  - `skipLocked` 제거 → (i)가 실패한다(잠금 대기 → lock_timeout → `project.auto_settle_failed`).
  - `findProject`의 uuid 모양 확인 제거 → E2E (0)이 실패한다(오류 화면).

## Gates Run (실행자)

| 게이트 | 결과 |
|---|---|
| `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` | 0 · 0 · 0 |
| `pnpm build` | 0 (Task 3 뒤) |
| 단위 `auto-transition` · `kst-date` · `project-status` · `import-cycles` | 133 통과 |
| 통합 `project-auto-settlement` · `project-status` · `projects-list` · `quote-lines` · `document-numbering` · `tx-safety` | 6파일 73 통과 |
| E2E(로컬 dev) `project-period` · `project-lifecycle` · `projects-list` · `quote-table` · `page-chrome` · `a11y` · `mobile-page-chrome` · `revenue-section` | 193 통과 |
| 날짜 리터럴 grep `test/e2e/project-period.spec.ts` | 0건 |
| 의존성(d6b41cf 대비) | `package.json` 의존성 객체 넷 동일 · `pnpm-lock.yaml` diff 0줄 — 기준 d6b41cf는 저장소에 있다(`git cat-file -t` = commit) |

## 오케스트레이터 후속 (실행자가 하지 않음)

- **독립 DOM 감사**(Task 3 ④): 오케스트레이터 후속이다. 별도 에이전트가 `CI=true`로 1280 · 1024 · 375 세 폭을 잰다. 볼 것은 담당 PM 시점(`종료일 지남 · 팀장 {이름}`)과 팀장 시점(「상태 바꾸기」 + `종료일 지남`)의 머리 줄이다. 판정 기준은 가로 스크롤 0, 글자 숨김 없음, PC 버튼 전부 보임, 375에서 태그 바로 옆 `종료일 지남`(DR-26)이다. 필요하면 `project-detail.module.css`만 고친다.
- **전체 게이트 `CI=true pnpm test`**: 오케스트레이터 후속.
- **Codex 교차 검토**: 한도 풀리면 Codex 재확인 필요.

## ARCHITECTURE §4-1 한 줄

`teamLeadCandidatesAtDate`는 「이 사람이 할 수 있나」를 판정하는 함수가 아니라 「누가 팀장인가」라는 목록 사실을 읽는 조회다. 그래서 `can`·`visible`·`scopeFor`·`canTransition`의 판정 함수 계약(§4-1)과 겹치지 않는다. 권한표·업무 범위는 판정 함수를 거치지 않고 한 문장의 조인으로 읽는다.

## Files Created/Modified

- `domain/projects/auto-transition.ts`: 두 입구, `effectiveOnFor`, deps 주입 지점.
- `domain/projects/responsibles.ts`: 담당 PM·팀장 이름.
- `domain/projects/status-transitions.ts`: `AUTO_TRANSITIONS` 한 줄.
- `domain/projects/status.ts`: `changeProjectStatus` → `loadProjectForGate`, `lastStatusChangeOn`의 발효일 처리, `isEndDatePassed`.
- `domain/projects/index.ts`: `findProject` 순서와 deps, `settleForProjectList`, `createProject`의 `deps.now` + `kstYear`.
- `repositories/projects.ts`: `settleOverdueProjects`.
- `repositories/team-memberships.ts`: `teamLeadCandidatesAtDate`.
- `app/(app)/projects/page.tsx`: `Promise.all` 앞에서 `settleForProjectList`를 한 번 부른다.
- `app/(app)/projects/[id]/page.tsx`: `endDateNote`를 만든다. 이름은 조건 안에서만 조회한다.
- `app/(app)/projects/[id]/quote-table.tsx`: `endDateNote` prop, `.statusLine` 묶음.
- `app/(app)/projects/[id]/project-detail.module.css`: `.statusLine`·`.endDateNote`(기존 토큰만).
- 테스트 3파일(신규).

## Decisions Made

- `settleOverdueProjects`는 RETURNING 안 스칼라 하위 질의로 직전 변경 시각을 읽는다. `.mapWith(actionLog.occurredAt)`로 UTC Date를 받는다. 두 번째 SELECT 대안은 쓰지 않았다.
- 팀장 이름 조회 조건을 `endDatePassed && statusChange === null`로 좁혔다. 플랜은 `endDatePassed`일 때 부른다고 했지만, 이름이 실제로 쓰이는 경우만 조회하려는 같은 규칙을 더 좁게 적용했다.
- 04-21의 팀장 권한 결정(미답)은 04-11에 필요 없다. 이 플랜의 팀장 경로는 시드의 `projects.status` 쓰기만 쓰고 `projects` 쓰기는 쓰지 않는다. 시드·권한은 바꾸지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] E2E (0)은 HTTP 404가 아니라 soft 404(404 화면 + noindex)로 단언한다**
- **Found during:** Task 1 (E2E 검증)
- **Issue:**
  - 플랜은 「상세의 기존 `notFound()`가 404를 낸다」고 가정했다.
  - 실제로는 `app/(app)/projects/loading.tsx`가 이 세그먼트를 Suspense로 감싼다. 그래서 응답이 200으로 먼저 흐르고, `notFound()`는 상태 코드를 바꾸지 못한다(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md` 「status code」, `03-file-conventions/loading.md` 「Status codes」).
  - uuid 모양 확인 전(RED)에도 상태 코드는 200이었고, 화면만 오류 화면이었다.
- **Fix:**
  - 사용자 증상(오류 화면)은 uuid 모양 확인으로 고쳤다.
  - E2E는 「`페이지를 찾을 수 없습니다` 제목 + `meta[name=robots][content*=noindex]` + 오류 화면 제목 0개」를 단언한다.
  - 변이 확인: 모양 확인을 빼면 실패한다.
- **Not done:** 수용 기준 「응답이 404다」는 충족하지 못했다. 진짜 404를 내려면 `loading.tsx` 재배치(목록 전용 라우트 그룹) 또는 proxy가 필요하다. 이는 파일 이동·구조 변경이라 **사용자 결정 필요**다.
- **Files modified:** `test/e2e/project-period.spec.ts`, `domain/projects/index.ts`
- **Committed in:** `bf8fc47`

**2. [Rule 3 - Blocking] 세션 시간대 단언을 `'UTC'` 한 값에서 「이름 `UTC`|`Etc/UTC` + 오프셋 0」으로 넓혔다**
- **Found during:** Task 1 RED
- **Issue:** 로컬 DB 이미지의 `current_setting('TimeZone')`은 `Etc/UTC`다.
- **Fix:** 이름 정규식과 `extract(timezone from now()) = 0`을 함께 단언한다. 경계 계산의 전제(오프셋 0)는 그대로 고정된다.
- **Committed in:** `aa0a7df`

**3. [Rule 3 - Blocking] 단위 테스트를 DB 없이 돌리려고 주입 지점을 더했다**
- **Found during:** Task 1·2·3
- **Issue:** 플랜이 적은 deps(now·recordAction·settle·logger)만으로는 `withTransaction`이 실제 DB를 연다.
- **Fix:** 주입 지점만 더했다. 기본값은 실제 구현이고, 호출자 동작은 바뀌지 않는다.
  - `AutoSettlementDeps.transaction`
  - `loadProjectForGate`의 네 번째 인자 `deps`(lockProject · updateStatus · findLatestAction · recordAction)
  - `projectResponsibles`의 `findPmName`
  - `findProject`의 `deps.autoSettlement`(통합 e3 로그 실패 주입용 — 플랜이 요구)
- `changeProjectStatus`는 자기 `deps.recordAction`을 게이트에도 넘긴다. 그래서 (j)는 전환 함수의 주입으로 게이트 로그 실패를 만든다.

**4. [Rule 1 - 순서] `changeProjectStatus`의 `afterLock`이 보관 확인 앞으로 왔다**
- **Issue:** `afterLock`이 `loadProjectForGate` 안(잠금 직후)으로 들어가면서 순서가 바뀌었다.
- **Impact:** 경합 테스트 도우미 전용 훅이라 동작 차이가 없다. OV-3 통합 테스트는 초록이다.

---

**Total deviations:** 4 (Rule 3 셋, 순서 변화 하나)
**Impact on plan:** 기능 범위는 그대로다. 수용 기준 「`/projects/abc` 응답 404」 한 줄만 미충족이다(soft 404) — 사용자 결정이 필요하다.

## Issues Encountered

- E2E (0) 404 상태 코드 — 편차 1.
- noindex meta가 dev에서 두 개 렌더된다. 그래서 `.first()`가 붙어 있는지로 단언했다.

## Known Stubs

없음. RED 커밋의 뼈대는 모두 GREEN 커밋에서 실제 구현으로 바뀌었다.

## Threat Flags

없음. 새 엔드포인트는 없다. 읽기 경로의 쓰기는 `SYSTEM_VIEWER` 행위자이고, 행 범위 확인 뒤에만 돈다(T-04-78·81). 팀장 이름은 같은 프로젝트를 볼 수 있는 사람에게만 상세 머리 줄로 보인다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-12·04-22·04-14·04-40: 저장·차수 경로에서 `lockProjectForWrite` 대신 `loadProjectForGate(viewer, id, { now, tx, afterLock })`를 부르고, 반환 행으로 `seenStatus`를 비교하면 된다.
- 04-17: 목록 `page.tsx`의 `settleForProjectList` 호출을 `loadProjectList` 안으로 옮긴다.
- 04-18 · 04-44: `isEndDatePassed`를 쓴다.
- 04-22 · 04-30: `projectResponsibles`를 쓴다.
- Phase 7: 예약 작업에서 `applyAutoSettlement({})`만 부르면 된다.
- 사용자 결정 필요:
  - 상세 잘못된 id의 HTTP 404(편차 1).
  - 04-21의 팀장 `projects` 쓰기 결정(여전히 미답 — 04-22 전).

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*

## Self-Check: PASSED

- 생성 파일 5개 존재: `domain/projects/auto-transition.ts` · `domain/projects/responsibles.ts` · `test/unit/domain/auto-transition.test.ts` · `test/integration/project-auto-settlement.test.ts` · `test/e2e/project-period.spec.ts`
- 커밋 6개 이력에 있음: `aa0a7df` · `bf8fc47` · `96433ce` · `d5d5a59` · `23abcd4` · `371a94b`

## 실행 후 검증 (Post-execution verification)

- **독립 DOM 감사 6/6 PASS** — 1280·1024·375 × 팀장·담당 PM 시점, `CI=true`(프로덕션 빌드) DOM 실측. 가로 넘침 0, 375 순서(h1 ≤ 태그/글자 ≤ 첫 버튼) 통과, 토큰 일치. 수정 없음(`project-detail.module.css` 그대로). 파일: `/mnt/project-files/phase4-prep/04-11-dom-audit.md`
- **Opus 코드 리뷰** — BLOCKING 0 · SHOULD-FIX 2 · NIT 9. 파일: `/mnt/project-files/phase4-prep/04-11-review-opus.md`
  - S1(잘못된 id의 HTTP 404): 아래 soft-404 결정 참고.
  - S2(화면 게이트 미완): 위 DOM 감사와 아래 전체 게이트로 닫음.
  - NIT 1 고침: `loadProjectForGate`의 조건부 UPDATE가 0행이면 상태 변경 로그를 남기지 않고 던져 호출자 tx를 되돌린다(쓰기 경로 fail-closed — 읽기 경로 실패 격리 A-15는 `applyAutoSettlement`에만 해당해 그대로). RED 확인 후 고침: `5b32bb6` test · `f47550a` fix.
  - NIT 2–9 보류(기록만): 2 scope 확인이 `none`까지만 · 3 `teamLeadCandidatesAtDate`의 쓰이지 않는 `tx?` · 4 `pmName` 조회 1회 낭비 · 5 보관 계급 미필터 · 6 SQL 안 `'project'` 리터럴 중복 · 7 게이트 미적용 쓰기 경로(`saveProjectLedger` — 04-12/04-22/04-14 몫, 머지 묶음 ② PR 전에 grep 확인) · 8 `captureLogLines`의 전 줄 `JSON.parse` · 9 상세 GET의 짧은 쓰기 tx.
- **soft-404 결정:** 잘못된 id는 404 화면+noindex, HTTP 200 — loading.tsx 스트리밍 제약(Next 16 not-found.md·loading.md). 사용자 결정 카드 올림, 답 전까지 추천안(지금대로)으로 진행.
- **전체 게이트(1회, 수정 후):** `pnpm lint && pnpm typecheck && pnpm lint:sql` 통과(squawk 0 issues) · `CI=true` 단위 88 파일/1079 통과 · 통합 46 파일/1139 통과 · E2E 230 통과(3.7m). 실패 0.
- **한도 풀리면 Codex 재확인 필요.**
