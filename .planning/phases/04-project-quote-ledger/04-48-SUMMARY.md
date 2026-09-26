---
phase: 04-project-quote-ledger
plan: 48
subsystem: projects-list
status: complete
tags: [project-list, period-filter, url-normalization, year-auto-switch, empty-states, phone-first-screen, loading-skeleton]
requires:
  - phase: 04-17
    provides: list-view.ts(resolveListRange · attributionLabel · exclusionText · totalsTitle · resolveListPage) · loadProjectList · 합계 줄 · 번호 페이지
  - phase: 04-46
    provides: ui/button(Button 2차 — 폰 44×44 규칙)
provides:
  - list-view.ts — parseListPeriod · normalizeListParams(+ normalizeListYear · firstListParam · isTeamIdShape) · isUserFiltered · listEmptyKind · yearOptions · formatListPeriod · periodOverlapsYear · reconcileListYear · filterSummary
  - loadProjectList 결과의 periodErrors · emptyKind(none · default-view · filtered) · hasFilter · params(정규화된 teamId · search · from · to)
  - ProjectListQuery가 URL 값(string | string[] | number)을 그대로 받고 입구에서 정규화(C-08)
  - page.tsx 연도 자동 전환 redirect(DR-30) · 빈 목록 세 갈래 · 필터 줄 primaryAction
  - filter-bar.tsx 기간 두 칸(묶음 focusout 제출 · 서버 오류 한 줄) · 연도 바꿀 때 어긋난 기간 비우기 · sort/dir 숨은 값 · 폰 「필터」 disclosure + 요약
  - loading.tsx 합계 줄 자리 라벨만(tfoot 합계 행 뼈대 제거)
affects: [04-18, 04-19]
actuals:
  tokens: 20312
  tasks: 3
  commits: 7
plan_head_before: b7ed0f625b4214eb76a03b7587cbcbcc765457ff
tech-stack:
  added: []
  patterns:
    - URL 파라미터는 도메인 입구 한 곳(normalizeListParams)에서 정규화 — 페이지는 string으로 단정하지 않는다
    - 조회 전 redirect로 모순 조합(연도 ∩ 기간 = ∅)을 없앤다 — 도메인·리포지토리에 빈 교집합 갈래 없음
    - 빈 갈래 판정용 필터 없는 건수는 0건일 때만 기존 집계를 한 번 더(리포지토리 변경 없음)
    - 폰/PC 두 배치를 한 DOM + 700 중단점 CSS만으로(display: contents · order)
key-files:
  created:
    - test/unit/app/projects-loading.test.ts
    - .planning/phases/04-project-quote-ledger/04-48-SUMMARY.md
  modified:
    - domain/projects/list-view.ts
    - domain/projects/index.ts
    - app/(app)/projects/filter-bar.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects-table.tsx
    - app/(app)/projects/projects.module.css
    - app/(app)/projects/loading.tsx
    - test/unit/domain/project-list-view.test.ts
    - test/integration/projects-list.test.ts
    - test/integration/quote-line-kinds.test.ts
    - test/e2e/projects-list.spec.ts
key-decisions:
  - "04-48: URL 파라미터 정규화는 loadProjectList 입구 한 곳 — 팀 목록은 uuid 모양의 teamId가 왔을 때만 listTeams(필터 줄과 같은 조회)로 읽는다"
  - "04-48: emptyKind의 none 판정은 0건일 때만 기존 aggregate를 필터 없이 한 번 더 부른다(새 리포지토리 함수 없음)"
  - "04-48: 연도를 바꿔 기간이 어긋나면 두 칸을 비우고 disabled로 둬 GET 주소에 from=·to=가 남지 않게 한다"
  - "04-48: 폰 배치는 DOM 순서를 PC 한 줄에 맞추고 폰에서 CSS order로 검색을 맨 위 · 1차를 「필터」 줄로 올린다 — 폰의 Tab 순서는 「필터」 → (네 칸) → 검색 → 필터 지우기 → 1차로 시각 순서와 다르다(독립 DOM 감사가 판정)"
  - "04-48: 기간 칸 서버 오류가 있으면 폰 disclosure를 펼친 채 연다(오류 한 줄이 접힌 칸 안에 숨지 않게)"
requirements-completed: [PROJ-01, UX-04]
coverage:
  - id: D1
    description: "기간 두 칸 묶음 제출 · 서버 형식/거꾸로 판정 · 오류 시 기간 필터 미적용 · 기간 귀속 합계"
    requirement: PROJ-01
    verification:
      - kind: unit
        ref: "test/unit/domain/project-list-view.test.ts#parseListPeriod — 목록 기간 필터 판정"
        status: pass
      - kind: integration
        ref: "test/integration/projects-list.test.ts#loadProjectList — 기간 필터 (04-48, 실제 Postgres)"
        status: pass
      - kind: e2e
        ref: "test/e2e/projects-list.spec.ts#프로젝트 목록 — 기간 필터 (04-48)"
        status: pass
    human_judgment: false
  - id: D2
    description: "틀린 URL 파라미터 정규화(C-08) · 창 밖 연도 선택지 · 정렬 유지 · 필터 지우기 · 빈 목록 세 갈래 · 기간 칸 서식"
    requirement: UX-04
    verification:
      - kind: unit
        ref: "test/unit/domain/project-list-view.test.ts#normalizeListParams · yearOptions · formatListPeriod · listEmptyKind"
        status: pass
      - kind: integration
        ref: "test/integration/projects-list.test.ts#loadProjectList — 파라미터 정규화 · 빈 갈래 (04-48, 실제 Postgres)"
        status: pass
      - kind: e2e
        ref: "test/e2e/projects-list.spec.ts#프로젝트 목록 — 조회 조건 (04-48)"
        status: pass
    human_judgment: false
  - id: D3
    description: "연도 자동 전환(DR-30) — 같은 해 기간 → 그 해, 걸친 기간 → 전체 연도, 연도를 바꿔 어긋나면 기간 비움"
    requirement: PROJ-01
    verification:
      - kind: unit
        ref: "test/unit/domain/project-list-view.test.ts#reconcileListYear — 연도 자동 전환(DR-30)"
        status: pass
      - kind: e2e
        ref: "test/e2e/projects-list.spec.ts#(DR-30) 기간이 선택 연도 밖이면 …"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 첫 화면(DR-26) · 로딩 뼈대(합계 줄 라벨만) · 목록 화면 세 폭 DOM 감사"
    requirement: PROJ-01
    verification:
      - kind: unit
        ref: "test/unit/app/projects-loading.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/projects-list.spec.ts#프로젝트 목록 — 폰 첫 화면 (04-48)"
        status: pass
    human_judgment: true
    rationale: "독립 DOM 감사(1280·1024·375, (a)~(i))와 전체 게이트는 오케스트레이터가 실행할 예정 — 실행자 범위 밖"
duration: 39min
completed: 2026-09-26
---

# Phase 4 Plan 48: 목록 조회 조건 · 연도 자동 전환 · 빈/로딩/폰 상태 Summary

**목록에 기간 필터(묶음 focusout 제출 · 서버 판정)를 더하고, 틀린 URL 값을 도메인 입구에서 정규화해 22P02·22008 오류 화면을 없앴으며, 기간이 연도 밖이면 조회 전 redirect로 연도를 고치고, 빈 목록 세 갈래 · 정렬 유지 · 폰 「필터」 disclosure · 라벨만 있는 로딩 합계 줄을 만들었다.**

## Performance

- 시작 2026-09-26T14:56Z · 끝 15:35Z(약 39분)
- 작업 3개 · 커밋 7개(RED 3 · GREEN 3 · 주석 정리 1) + 이 문서 커밋
- 파일 12개(+1,147 / −146), 의존성·토큰·마이그레이션 변경 없음(`git diff d6b41cf -- docs/design/tokens.css pnpm-lock.yaml` 0줄, `package.json` 의존성 변화 없음 — T-04-SC)

## Task Commits

| Task | 이름 | RED | GREEN |
|------|------|-----|-------|
| 1 (tracer) | 기간 두 칸 묶음 제출 · 서버 판정 · 기간 보기 | b7f1844 | 166ad32 |
| 2 | 정규화 · 연도 자동 전환 · 창 밖 연도 · 정렬 유지 · 빈 갈래 · 기간 칸 서식 | bb9f584 | 6254ace |
| 3 | 폰 첫 화면 · 로딩 뼈대 | a1c4cf7 | 49f0efd |
| (NIT 4) | quote-line-kinds 낡은 주석 | — | 590f864 (chore, 주석만) |

Task 1 트레이서 게이트: `auto_advance` false · `human_verify_mode` end-of-phase · verify가 자동 검증뿐 → verify(단위·통합·`CI=true` E2E·lint·typecheck)를 다시 돌려 초록 확인 뒤 Task 2로 넘어갔다.

## RED 증거

- b7f1844 — 단위 `parseListPeriod` 6건(빈 골격이라 `expected { period: null, errors: {} } to deeply equal …`), 통합 2건(`length 2 but got 3` · `expected {} to deeply equal { from }`), `CI=true` E2E 2건(`#from` 없음).
- bb9f584 — 단위 23건(정규화·빈 갈래·연도 선택지·기간 서식·겹침·자동 전환·0건 건수 조회), 통합 3건(`teamId=abc`가 **22P02로 던지는 실제 결함 재현** · emptyKind null), `CI=true` E2E 5건(창 밖 연도 값 · 정렬 유지 · 틀린 파라미터 · 필터 0건 · DR-30).
- a1c4cf7 — 단위 5건(filterSummary 3 · 로딩 tfoot/합계 줄 2), `CI=true` E2E 폰 1건(「필터」 버튼 없음). PC 1280 「필터」 부재 단언은 RED에서도 참(부재 확인용).

## 검증(실행 결과, 실행자 범위)

- 단위: `project-list-view` + `app/projects-loading` — 62/62
- 통합: `projects-list` 23/23 · 목록 입구를 쓰는 5 파일(`projects-list`·`project-auto-settlement`·`quote-lines`·`quote-revisions`·`quote-line-kinds`) 142/142
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues · `CI=true pnpm build` exit 0
- `CI=true` E2E(프로덕션 빌드): `projects-list` + `projects-filter-reset` + `projects-list-number-nowrap` 18/18 · desktop `page-chrome`·`a11y`·`project-copy`·`project-register`·`keyboard-nav`·`projects-list` 60/60 · mobile-375(`--no-deps`) `mobile-320-no-overflow`·`mobile-list-empty`·`mobile-page-chrome`·`mobile-wordmark-home` 11/11 · Task 2 시점 `projects-list`·`filter-reset`·`number-nowrap`·`mobile-list-empty`·`page-chrome` 346/346
- 수용 grep: `grep -rn "empty: true" domain/projects repositories/projects.ts` 0 · `grep -c "더 보기" filter-bar.tsx` 0 · filter-bar에 `focusout`·`periodOverlapsYear` · page.tsx에 `reconcileListYear` · index.ts에 `normalizeListParams` · 기간 두 칸에 칸별 onBlur 없음(묶음 div의 onBlur 하나)

## 독립 DOM 감사: 오케스트레이터 실행 예정

Task 3 ⑤의 1280·1024·375 독립 DOM 감사((a)~(i) — 04-17 합계 줄·페이지 줄 포함, 폰 첫 화면 (g))는 실행자가 아닌 별도 에이전트가 해야 한다(CLAUDE.md §6). 실행자는 돌리지 않았다. 감사자에게 넘길 점: 폰 Tab 순서가 시각 순서와 다르다(key-decisions 넷째 줄) — 판정 대상.

## 전체 게이트: 오케스트레이터 실행 예정

`bash scripts/reset-test-db.sh && CI=true pnpm test` 한 번은 DOM 감사·수정 뒤 오케스트레이터가 돌린다. 실행자는 돌리지 않았다.

## 04-17 이월 NIT 처리

1. `year=0000`(및 2000–2100 밖) — `normalizeListYear`가 올해로(통합 C-08 표 · E2E 「틀린 teamId · year」). 기간 칸 `0000-01-01`도 형식 오류로 PG에 닿지 않는다.
2. 올해 기본 보기 0건 `{연도}년에 걸친 프로젝트가 없습니다 · 전체 연도 보기` — page.tsx `default-view` 갈래 + 단위/통합 판정 테스트.
3. `filter-bar.tsx` 낡은 머리 주석(「더 보기」) → 지금 규칙(1쪽 · 정렬 유지)으로, 연도 `?? ""` 폴백 → `year`를 필수 값으로 바꿔 제거.
4. `test/integration/quote-line-kinds.test.ts:95` 낡은 주석 정정(590f864, 주석만).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 필터 폼 Enter 제출을 직접 처리**
- **Found during:** Task 1
- **Issue:** 텍스트 칸이 셋(from·to·q)이고 제출 버튼이 없는 폼은 브라우저가 Enter로 제출하지 않는다(암묵 제출은 텍스트 칸 하나일 때만) — 기존 검색 칸 Enter도 끊긴다.
- **Fix:** 세 칸 `onKeyDown` Enter → `requestSubmit`. 커밋 166ad32

**2. [Rule 1 - Bug] 기존 unit 「0건이면 목록 행을 읽지 않는다」 기대 호출 순서 갱신**
- 0건일 때 빈 갈래 판정용 집계가 한 번 더 돈다(계획 ② 그대로) — `["settle","scope","aggregate","aggregate"]` + `emptyKind: "none"`. 커밋 bb9f584

**3. [Rule 1 - Bug] 기존 E2E 「팀 발령 없는 사람의 빈 목록」 대기 조건에 default-view 문구 추가**
- 전체 스위트 DB가 올해 밖 프로젝트만 가진 경우 이제 기본 보기 0건 갈래가 보인다. 커밋 bb9f584

**4. [계획 해석] 연도 자동 전환의 반대 방향에서 비운 칸을 disabled로**
- 비운 텍스트 칸도 GET에 `from=&to=`로 실린다 — 계획 E2E 「URL에 from·to가 없고」를 지키려고 제출 직전 disabled. 커밋 6254ace

**5. [계획 해석] default-view 갈래 E2E 대신 통합·단위로 판정**
- E2E DB는 모든 스펙이 공유하고 프로젝트 보기 범위가 `rows: "all"`이라, 「올해에 걸친 행이 없는」 상태를 사용자 필터 없이 만들 수 없다(격리 검색어는 곧 사용자 필터 → filtered 갈래). `default-view`는 통합(깨끗한 DB, 다른 해 프로젝트만)과 단위로 고정했고 E2E는 `filtered` 갈래를 렌더로 본다.

**6. [Rule 3 - Blocking] 폰 「필터」를 감싸는 div**
- 공유 Button이 `<span class=wrap>`으로 감싸 flex 항목이 span이 된다 — 표시·순서를 버튼 className으로 줄 수 없어 필터 줄 전용 div로 감쌌다(ui/button은 건드리지 않음). 커밋 49f0efd

**7. [정리] `projects.module.css`의 `.footerCell` 제거**
- 로딩 tfoot을 지워 이 모듈에서 고아가 됐다(상세 화면은 자기 모듈의 `.footerCell`을 쓴다). 커밋 49f0efd

---

**Total deviations:** 7(Rule 3 둘 · Rule 1 둘 · 계획 해석 둘 · 고아 정리 하나). **Impact:** 범위 확장 없음. 리포지토리·스키마·토큰 변경 없음.

## Plan truths 상태

- 충족(테스트로): 기간 필터 묶음 제출 · 서버 오류 한 줄 · 틀린 파라미터 기본 보기 · 창 밖 연도 선택 유지 · 정렬 유지/1쪽 · 필터 지우기 조건 · 빈 목록 세 갈래(default-view는 통합) · 연도 자동 전환 양방향 · 폰 요약 값 · 1차 생략 규칙 · 로딩 뼈대 · 기간 칸 서식.
- 미판정(오케스트레이터 몫): backstop 넷(합계 줄 폰 줄바꿈 · 폰 첫 화면 375 실측 · 페이지 줄 폰 44×44) 과 truth 「독립 DOM 감사 + 전체 게이트 한 번」.

## Known Stubs

없음.

## Threat Flags

없음 — redirect는 `/projects?…` 고정 경로, 연도 값은 `reconcileListYear`의 4자리 또는 `all`(T-04-367), 나머지 값은 다시 `normalizeListParams`를 지난다(T-04-90).

## Self-Check: PASSED

- FOUND: domain/projects/list-view.ts · app/(app)/projects/filter-bar.tsx · app/(app)/projects/loading.tsx · test/unit/app/projects-loading.test.ts · test/e2e/projects-list.spec.ts
- FOUND 커밋: b7f1844 · 166ad32 · bb9f584 · 6254ace · 590f864 · a1c4cf7 · 49f0efd (`git rev-list --count b7ed0f6..HEAD` = 7)
