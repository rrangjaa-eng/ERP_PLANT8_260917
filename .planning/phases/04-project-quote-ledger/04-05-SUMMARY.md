---
phase: 04-project-quote-ledger
plan: 05
subsystem: ui
tags: [drizzle, postgres, nextjs, server-actions, settings-registry, document-numbering, ui-table]

# Dependency graph
requires:
  - phase: 04-01
    provides: "projects/quote_revisions/quote_lines 스키마, domain/document-numbering(상수 서식), ui/table(읽기 형태), domain/projects의 트레이서 listProjects/findProject/createProject, domain/permissions/project()·visible() 투영 패턴"
provides:
  - "프로젝트 목록 완성 — 월별 그룹(종료일, 기간 미정은 맨 아래)·상태/팀/연도/검색 필터·서버 정렬(URL 파라미터, 클릭 UI는 04-04 이후)·더 보기(count 파라미터)·집계 쿼리 한 번(전체 건수·견적·실행가·차익 합계)"
  - "domain/projects: listProjects(filter/sort/limit)·aggregateProjects(filter) — 같은 필터 서술자, quote.amount 정보 항목 하나로 금액 열 셋을 표 단위 게이트"
  - "repositories/projects: listProjectsPage·aggregateProjects — 현재 차수(최신 seq) 파생 조인 + 견적/실행가/차익 합계 서브쿼리, 정렬 키 허용 목록"
  - "domain/document-numbering: documentNumberFormat(순수 함수) + counterKey별 설정 키 조회 — 프로젝트 문서 번호 서식이 상수에서 domain/settings/keys.ts로 이동(ADMN-09)"
  - "app/(app)/projects/{page,projects-table,filter-bar,loading,error}.tsx — 필터 한 줄·읽기 표·로딩/오류 스켈레톤"
affects: ["04-06", "04-07", "05", "06", "09"]

actuals:
  tokens: 18900
  tasks: 2
  commits: 2
  plan_head_before: 920bfbc

tech-stack:
  added: []
  patterns:
    - "리포지토리 레벨 공유 필터 함수(projectFilterConditions) — 목록 쿼리와 집계 쿼리가 이 함수 하나만 호출해 서로 다른 조건을 쓰는 경로를 원천적으로 없앤다(T-04-28)"
    - "현재 차수 파생 조인 — selectDistinctOn(quoteRevisions.projectId ORDER BY seq DESC)으로 project_id당 정확히 한 행을 얻고, quote_lines 합계 서브쿼리와 조인해 D-54(최신 차수만 현재)를 SQL 레벨에서 강제한다"
    - "그룹은 SQL 1차 정렬(종료일 IS NULL → 월 → 요청 정렬 키)로 만들고 domain은 라벨만 파생 — 요청 정렬 키는 그룹 macro-구조를 깨지 않도록 그룹 안에서만 순서를 바꾼다"
    - "서식 조립 순수 함수 + 얇은 설정 조회 층 — documentNumberFormat(parts, format)은 DB 없이 단위 테스트되고, formatDocumentNumber가 counterKey별 설정 키 묶음을 조회해 그 함수를 감싼다. seqStart는 카운터(document_counters, 항상 1부터 증가)가 아니라 표시값에 더하는 오프셋"

key-files:
  created:
    - app/(app)/projects/projects-table.tsx
    - app/(app)/projects/filter-bar.tsx
    - app/(app)/projects/loading.tsx
    - app/(app)/projects/error.tsx
    - test/integration/projects-list.test.ts
    - test/integration/document-numbering.test.ts
    - test/unit/domain/document-number-format.test.ts
    - test/e2e/projects-list.spec.ts
  modified:
    - repositories/projects.ts
    - domain/projects/index.ts
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects.module.css
    - docs/ARCHITECTURE.md
    - domain/settings/keys.ts
    - domain/document-numbering/index.ts
    - .planning/WINDOWS.md

key-decisions:
  - "서식 키 형태 = 문서 종류별 키 묶음(document_number.project.*), JSON 한 개가 아니다 — 근거 셋: (a) 기존 설정 화면은 키 하나당 한 줄을 그려 JSON 한 덩어리는 편집 불가능한 텍스트 영역이 된다 (b) SettingDef 스키마 검증이 필드 단위로 이유를 말할 수 있다(JSON이면 형식 오류 한 줄뿐) (c) Phase 5·6·11이 문서 종류를 더할 때 이 파일에 키만 더하면 된다"
  - "must_haves.truths의 '빈 구분자를 거부한다'를 문자 그대로 구현하지 않았다 — 확정된 프로젝트 기본 서식(`26001`, docs/inputs §5)이 연도·순번 사이에 구분자가 없다(빈 문자열)는 사실과 직접 충돌한다. separator 스키마는 z.string()(빈 문자열 허용)으로 두고, 순번 자릿수·순번 시작값의 0/음수만 리터럴대로 거부한다 — 기본 서식 자체를 저장 불가능하게 만드는 쪽보다 이 재해석이 낫다고 판단했다"
  - "연도 필터는 종료일 기준이고 기본값은 '전체'(선택 안 함) — 종료일이 없는(기간 미정) 행은 특정 연도를 고르면 자연히 빠진다(정의상 그 연도에 속하지 않는다). 연도 select에 '전체' 옵션을 명시적으로 뒀다 — 목록 truths의 '기본 보기 = 전체'와 대칭"
  - "정렬은 그룹(종료일 월, D-51) 구조를 깨지 않는다 — SQL ORDER BY가 (종료일 NULL 여부 → 월) → 요청 정렬 키 → id 순이라, 열 머리글 정렬은 같은 월 그룹 **안**에서만 순서를 바꾼다. 그룹이 사방으로 흩어지는 것을 막는 설계 선택"
  - "money 셋(견적·실행가·차익)에 계급별 시각적 fallback('견적이 없으면 실행가')을 구현하지 않았다 — 셋 다 quote.amount 정보 항목 하나로 묶여 있어(Phase 4 한 항목), 이 항목이 안 보이는 계급은 셋 다 안 보인다(field가 서로 다르게 노출될 경로가 없다). 항목을 쪼개는 것은 아키텍처 변경(Rule 4)이라 이 플랜 범위 밖으로 판단했다"
  - "quote_lines 합계는 line_status(미착수/취소)와 무관하게 전 줄을 더한다 — 04-01/04-02가 만든 상세 화면 합계 행('합계 (공급가액 · N줄)')이 이미 같은 규칙(전 줄 카운트)을 쓴다. 목록 합계만 다른 규칙을 쓰면 두 화면의 숫자가 어긋난다"

patterns-established:
  - "Pattern: 공유 필터 서술자 함수 — 목록/집계처럼 같은 행 집합을 다른 모양으로 보여주는 쿼리 쌍은 필터 조건 생성을 함수 하나로 강제 공유한다"
  - "Pattern: 표시 오프셋 vs 저장 카운터 분리 — 카운터 증가 규약(항상 1부터)을 건드리지 않고 표시값에 오프셋을 더해 '순번 시작값' 같은 사용자 설정을 반영한다"

requirements-completed: [PROJ-01, ADMN-09]

coverage:
  - id: D1
    description: "목록이 종료일 기준 월로 그룹되고(기간 미정은 맨 아래), 상태·팀·연도·검색 필터가 걸리며, 「더 보기」가 count 파라미터로 50건씩 늘어나고, 합계 행이 불러온 페이지가 아니라 필터 전체의 합을 집계 쿼리 한 번으로 보여준다"
    requirement: "PROJ-01"
    verification:
      - kind: integration
        ref: "test/integration/projects-list.test.ts#(a)~(e)"
        status: pass
      - kind: e2e
        ref: "test/e2e/projects-list.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "견적·실행가·차익 열이 계급에 따라 서버가 DTO에서 아예 빼는 필드 부재이고(빈 값이 아니다), 집계도 같은 정보 항목(quote.amount)으로 표 단위 게이트된다"
    verification:
      - kind: integration
        ref: "test/integration/projects-list.test.ts#(d)"
        status: pass
    human_judgment: false
  - id: D3
    description: "프로젝트 문서 번호 서식(접두어·연도 자릿수·순번 자릿수·구분자·순번 시작값)이 상수가 아니라 설정 키이고, 서식을 바꾼 뒤에도 이미 매긴 번호는 그대로이며 연도가 바뀌면 순번이 1부터 다시 시작한다"
    requirement: "ADMN-09"
    verification:
      - kind: unit
        ref: "test/unit/domain/document-number-format.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/document-numbering.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "목록·검색이 쓰는 인덱스 목록이 docs/ARCHITECTURE.md에 있고(마이그레이션 0009와 일치), 300줄 상한을 지킨다"
    verification:
      - kind: unit
        ref: "test/unit/docs-limits.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "필터 한 줄·로딩 뼈대(반짝임 없음)·오류 문구·번호 열 고정폭(nowrap)의 시각 정합이 SYSTEM.md/UI-SPEC 문체를 따른다"
    verification: []
    human_judgment: true
    rationale: "자동 테스트는 텍스트·구조·CSS 속성 일부만 단언한다 — 전체 문체·간격·색 정합은 /design-review(Post-build)에서 사람이 확인한다"

duration: 1h2m
completed: 2026-09-22
status: complete
---

# Phase 4 Plan 5: 프로젝트 목록 완성 + 문서 번호 서식 설정화 Summary

**04-01의 목록 트레이서를 월별 그룹·필터 한 줄·서버 정렬·더 보기·집계 쿼리 한 번짜리 전체 합계로 완성하고, 프로젝트 문서 번호 서식(접두어·자릿수·구분자·시작값)을 상수에서 설정 레지스트리 키로 옮겨 관리자가 화면에서 바꿀 수 있게 했다.**

## Performance

- **Duration:** 약 1h2m
- **Started:** 2026-09-22T21:53:00Z(추정 — 04-02 완료 직후)
- **Completed:** 2026-09-22T22:54:45Z
- **Tasks:** 2/2 완료
- **Files modified:** 16 (생성 8 + 수정 8, 2개 커밋)

## Accomplishments

- `repositories/projects.ts`에 `listProjectsPage`·`aggregateProjects`를 더했다 — 둘 다 `projectFilterConditions` 하나만 호출해 같은 행 필터를 쓰고, `selectDistinctOn`으로 만든 현재 차수(최신 seq) 파생 조인 + 견적/실행가/차익 합계 서브쿼리를 공유한다. 집계가 SQL 왕복 한 번임을 `pool.query` 스파이로 실측 증명했다
- `domain/projects/index.ts`의 `listProjects`가 필터(상태·팀·연도·검색)·정렬·페이지 인자를 받고 종료일 기준 월 그룹(없으면 「기간 미정」)을 domain에서 계산해 붙인다 — 화면 컴포넌트에는 월 계산 로직이 없다. `aggregateProjects`는 견적·실행가·차익 셋을 `quote.amount` 정보 항목 하나로 표 단위 게이트한다(04-02의 발행/입금 선례와 같은 결)
- `app/(app)/projects/page.tsx`를 필터 한 줄(GET 폼, action-log 선례와 같은 패턴) + `projects-table.tsx`(읽기 전용 `ui/table` 사용, 그룹·번호 nowrap·계급별 금액 열 유무) + `loading.tsx`/`error.tsx`(§7-7 로딩·오류 뼈대)로 재구성했다. EMPTY는 데이터 0건과 필터 0건 두 갈래로 나뉜다
- `domain/document-numbering/index.ts`의 서식 조립을 순수 함수 `documentNumberFormat`으로 빼고, `formatDocumentNumber`가 `domain/settings/keys.ts`의 `document_number.project.*` 다섯 키(전부 단순값)를 조회해 감싼다. 순번이 자릿수를 넘쳐도 자르지 않는다(padStart는 늘어난 문자열을 그대로 둔다)
- `docs/ARCHITECTURE.md`에 §4-7(목록·검색 인덱스, 마이그레이션 0009 실측)을 더하고 300줄 상한(237줄) 안에 유지했다
- 단위 1 · 통합 2 · E2E 1을 전부 새로 만들었고, `pnpm test`(단위 719 · 통합 1007 · E2E 157) 전부 그린 상태로 확인했다

## Task Commits

1. **Task 1: 목록 완성 — 월별 그룹·필터 한 줄·정렬·더 보기·집계 쿼리 한 번** — `568294d` (feat)
2. **Task 2: 문서 번호 서식을 상수에서 설정 키로** — `9d35d0f` (feat)

**Plan metadata:** (이 커밋 직후 기록)

## Files Created/Modified

전체 목록은 frontmatter `key-files` 참고. 핵심만:
- `repositories/projects.ts` — 현재 차수 파생 조인 + 목록/집계 공유 필터
- `domain/projects/index.ts` — `listProjects`/`aggregateProjects`, 그룹 라벨 파생
- `app/(app)/projects/{page,projects-table,filter-bar,loading,error}.tsx` — 목록 화면 전체
- `domain/document-numbering/index.ts`, `domain/settings/keys.ts` — 서식 설정화

## Decisions Made

frontmatter `key-decisions` 참고(서식 키 형태 · 빈 구분자 재해석 · 연도 필터 기본값 · 정렬-그룹 상호작용 · 금액 fallback 미구현 · 견적 줄 합계 규칙).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] `/projects` 목록이 상태 원문(enum 값)을 그대로 렌더**
- **Found during:** Task 1 (목록 표 재구성 중 기존 코드 재검토)
- **Issue:** 04-01의 트레이서 표가 `<StatusTag>{item.status}</StatusTag>`로 `bidding` 같은 내부 값을 그대로 보여주고 있었다 — 한글 라벨이 아니다
- **Fix:** `projects-table.tsx`에 `STATUS_LABELS`/`STATUS_TAG_KIND` 맵을 추가(상세 화면의 기존 로컬 맵과 같은 패턴)
- **Files modified:** `app/(app)/projects/projects-table.tsx`
- **Verification:** `pnpm build`, E2E 목록 스모크
- **Committed in:** `568294d`

**2. [Rule 3 - 막힘] `app/(app)/projects/page.tsx`가 `repositories/projects`를 직접 import해 boundaries 위반**
- **Found during:** Task 1 (`pnpm lint`)
- **Issue:** 정렬 키 허용 목록(`PROJECT_SORT_KEYS`)을 화면에서 검증하려다 app→repositories 직접 import가 걸렸다(app은 domain만 거친다)
- **Fix:** `domain/projects/index.ts`가 `PROJECT_SORT_KEYS`/`ProjectSortKey`를 재수출, `page.tsx`는 `@/domain/projects`에서만 가져온다
- **Files modified:** `domain/projects/index.ts`, `app/(app)/projects/page.tsx`
- **Verification:** `pnpm lint` 0 errors
- **Committed in:** `568294d`

**3. [Rule 1 - 버그] `<a href="/projects">` 필터 지우기 링크가 next/next lint 규칙에 걸림**
- **Found during:** Task 1 (`pnpm lint`)
- **Issue:** 리터럴 문자열 href의 `<a>` 태그가 `no-html-link-for-pages`에 걸렸다(동적 표현식 href를 쓰는 다른 화면들과 달리 이 링크는 정적 문자열이었다)
- **Fix:** `next/link`의 `<Link>`로 교체
- **Files modified:** `app/(app)/projects/filter-bar.tsx`
- **Verification:** `pnpm lint` 0 errors
- **Committed in:** `568294d`

**4. [Rule 1 - 버그, CI E2E로 발견] `projects-table.tsx`가 함수 prop을 Server Component에서 Client Component(`ui/table`)로 그대로 넘겨 `/projects` 렌더가 크래시**
- **Found during:** Task 2 완료 후 `CI=true` Playwright 전체 재검증(초안은 `"use client"` 없이 작성했었다)
- **Issue:** `column.cell`(함수)·`groupBy`(함수)를 포함한 `columns` 배열을 서버 컴포넌트가 `<Table>`(`"use client"`)에 그대로 전달해 "Functions cannot be passed directly to Client Components" 런타임 오류로 `/projects`와 `/projects?new=1` 전체가 깨졌다 — 이 플랜의 신규 회귀이고 기존 `project-register.spec.ts` E2E 2건도 같이 실패했다(같은 페이지를 공유)
- **Fix:** `projects-table.tsx` 머리에 `"use client"` 추가
- **Files modified:** `app/(app)/projects/projects-table.tsx`
- **Verification:** `CI=true` Playwright 재실행 — 4/4(신규) + 2/2(기존 project-register) 통과
- **Committed in:** `9d35d0f`

**5. [Rule 1 - 버그, CI E2E로 발견] `loading.tsx`의 부제 중복이 기존 `page-chrome.spec.ts`의 strict-mode 텍스트 조회를 깨뜨림**
- **Found during:** Task 2 완료 후 `CI=true pnpm test` 전체 재검증
- **Issue:** `loading.tsx`가 `page.tsx`와 완전히 같은 부제("진행 중인 프로젝트 원장")를 렌더해, Next.js가 뒤로가기 캐시용으로 남겨 두는 숨김 Suspense 폴백과 겹쳐 `getByText(부제)`가 요소 2개에 걸렸다 — 이 플랜이 새로 만든 파일이 일으킨 기존 스펙의 회귀
- **Fix:** 로딩 뼈대에서 부제를 빼고 제목만 남긴다(레이아웃 밀림 방지라는 뼈대의 목적은 제목만으로도 충분)
- **Files modified:** `app/(app)/projects/loading.tsx`
- **Verification:** `CI=true` Playwright `page-chrome.spec.ts` 14/14 재통과, 이어서 전체 `pnpm test` 재실행 157/157
- **Committed in:** `9d35d0f`

---

**Total deviations:** 5건 자동 수정(Rule 1: 3건, Rule 3: 1건, Rule 1 중 CI E2E로만 드러난 회귀 2건 포함해 실질 버그 성격 4건) — 전부 이 플랜 자신의 변경이 직접 일으킨 문제였고 범위를 벗어난 신규 기능 추가는 없다.
**Impact on plan:** 전부 `pnpm build`/`pnpm lint`/`CI=true pnpm test` 통과에 필요한 수정. 4·5번은 dev 서버 통과만으로는 잡히지 않고 `CI=true`(프로덕션 빌드) 전체 재검증에서만 드러났다 — CLAUDE.md의 "로컬 dev 통과는 완료 신호가 아니다" 규칙이 실제로 작동한 사례.

## Issues Encountered

없음 — 전체 `pnpm test`(단위 719 · 통합 1007 · E2E 157, 총 1883건)가 `CI=true CLAUDE_CODE_REMOTE=true`로 그린 상태다.

## Known Stubs

- **열 머리글 클릭 정렬 + `aria-sort`** — `app/(app)/projects/projects-table.tsx`. `ui/table`의 `TableColumn.header`는 `string` 타입이고 `sortable`/`SortState`는 04-01이 만들어 둔 미사용 placeholder일 뿐, 실제 클릭·`aria-sort` 렌더링은 `Table.tsx`에 없다. 이 플랜은 `ui/table` 디렉터리를 건드리지 않기로 계획서 자신의 `<probe_fallback>`이 정했고(같은 웨이브의 04-04가 그 파일을 소유), 서버 정렬(검색 파라미터 → domain → repo SQL ORDER BY, 허용 목록 검증)은 완전히 구현·테스트했다 — 남은 것은 클릭 가능한 UI 어포던스뿐이다. `.planning/WINDOWS.md`에 stub #27로 기록. 04-04 이후 `ui/table`이 헤더 클릭·aria-sort를 지원하면 `projects-table.tsx`의 `header` 문자열을 그 API로 바꾸기만 하면 된다
- **검색 칸의 ⌘/ 포커스 단축키** — `app/(app)/projects/filter-bar.tsx`. UI-SPEC 원문이 언급하지만 이 저장소의 다른 필터 바(예: `admin/action-log/filter-bar.tsx`)에도 선례가 없어 새 클라이언트 로직을 추가하지 않았다. 순수 시각 편의 기능이라 스코프 확대로 보지 않았다

## Threat Flags

없음 — 이 플랜이 여는 새 표면(정렬 검색 파라미터, 서식 설정 5키, 집계 쿼리)은 계획의 `<threat_model>`(T-04-28~T-04-33, T-04-SC)이 이미 다룬 범위 안이다. T-04-30(정렬 키 허용 목록)은 domain·repository 양쪽에서 이중으로 검증하고, T-04-32(더 보기 개수 상한)는 `PROJECT_LIST_MAX_LIMIT`(1000)으로 고정했다.

## User Setup Required

**"경영관리"류 역할 배정과 무관 — 이 플랜은 새 메뉴·권한을 열지 않는다.** 문서 번호 서식 설정 5키는 `admin.settings` 화면에 자동으로 뜨고 그 화면의 기존 쓰기 권한(관리자)으로 게이트된다. 별도 설정 불필요.

## Next Phase Readiness

프로젝트 목록이 인트라넷 수준(전체 상태·월별 묶음·필터·정렬·더 보기·전체 합계)으로 완성됐고, 문서 번호 서식이 코드 수정 없이 설정 화면에서 바뀐다. 04-06(완료 잠금·상태 전환·차수 섹션)이 이 목록 위에 상태 변경 UI를 얹을 수 있다.

**열 머리글 클릭 정렬 UI는 미완**(Known Stubs 참고) — 04-04가 `ui/table`에 클릭 가능한 머리글·`aria-sort`를 더한 뒤, 이 화면의 `header` 필드를 그 API로 바꾸는 후속 작업이 필요하다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 8 created files verified present on disk (`app/(app)/projects/{projects-table,filter-bar,loading,error}.tsx`, `test/integration/{projects-list,document-numbering}.test.ts`, `test/unit/domain/document-number-format.test.ts`, `test/e2e/projects-list.spec.ts`). Both task commit hashes (`568294d`, `9d35d0f`) verified present in `git log --oneline --all`. `commits: 2` measured via `git rev-list --count 920bfbc..HEAD` against the plan-head ledger (`plan_head_before: 920bfbc`).
