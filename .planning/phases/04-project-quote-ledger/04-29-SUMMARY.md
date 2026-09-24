---
phase: 04-project-quote-ledger
plan: 29
subsystem: ui
tags: [pagination, next-link, kst-date, paging, design-system]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-08 §7-16 페이지 줄 절 신설(모양·현재 번호·next/link·포커스·ARIA·폰 44×44) · 04-46 §7-17/Button 분할"
provides:
  - "ui/pagination — pageWindow(넓은 창 8쪽부터 생략, C-27 한 쪽 틈은 번호) + pageRangeText(천 단위 쉼표) 순수 함수"
  - "ui/pagination/Pagination — href(next/link Link)/onPageChange(button) 유니언, 넓은 창·폰 창(compact) 이중 렌더, errorCounts → 오류 N·접근 이름"
  - "lib/kst-date — kstToday·kstDateOf·kstYear·addDays·kstDayStart(현재 시각은 인자로만, B-25 왕복)"
  - "lib/paging — clampPage·pageCountFrom·LIST_PAGE_SIZE(50)·QUOTE_TABLE_PAGE_SIZE(30)"
  - "docs/design/SYSTEM.md §7-16 생략 규칙 완성(기본 문장 + C-27 + 폰 6쪽 창) + DECISIONS.md 04-29 기록"
affects: [04-17, 04-19, 04-07, 04-20, 04-21, 04-14]

actuals:
  tokens: 7537
  tasks: 3
  commits: 7
plan_head_before: 2732d161ef30350883a68079657e0c48338c9c74

tech-stack:
  added: []
  patterns:
    - "페이지 줄 이중 렌더: 넓은 창·폰 창을 한 <nav> 안에 항상 함께 렌더하고 CSS display:none으로 700 중단점에서 하나만 남긴다(숨긴 목록은 접근성 트리·탭 순서에서도 빠진다)"
    - "쪽 보정 단일 출처: lib/paging.ts(clampPage·pageCountFrom·크기 상수) — 목록·견적 표·리저브가 같은 함수를 import"
    - "KST 날짜: 현재 시각을 모듈이 스스로 읽지 않고 인자로만 받는다(가짜 타이머 없이 테스트 가능)"

key-files:
  created:
    - ui/pagination/page-window.ts
    - ui/pagination/Pagination.tsx
    - ui/pagination/Pagination.module.css
    - test/unit/ui/pagination.test.ts
    - lib/kst-date.ts
    - lib/paging.ts
    - test/unit/lib/kst-date.test.ts
    - test/unit/lib/paging.test.ts
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - test/unit/design-system-docs.test.ts

key-decisions:
  - "04-29: Task 1에서 pageWindow에 compact 옵션을 조기 구현했다가(Task 3 스코프를 앞당김) TDD 경계 위반을 발견해 되돌리고, Task 3에서 RED(실패하는 compact 테스트) → GREEN(재구현) 순서로 다시 만들었다 — 결과 코드는 같지만 각 태스크의 테스트가 실제로 그 태스크가 만든 동작만 증명한다"
  - "04-29: ENG-D11 — 04-08이 §7-16에 적기로 했던 PC 생략 규칙 기본 문장(7쪽 이하 전부·8쪽부터 첫·끝·현재 ±1)이 실제 SYSTEM.md에는 전혀 없었다(UI-SPEC ⑧에만 있고 04-08 DECISIONS 본문에도 없음) — 이 플랜이 기본 문장까지 함께 §7-16에 추가하고 회귀 테스트로 고정했다"
  - "04-29: DECISIONS.md 04-29 항목 헤딩 날짜는 오늘(2026-09-24)이 아니라 계획이 지정한 2026-09-23을 그대로 썼다 — 04-08 등 형제 항목과 같은 재계획 라운드 날짜 관례"

patterns-established:
  - "화면 계층(ui/table 등)이 쪽 상태를 가지고 lib/paging의 clampPage·pageCountFrom으로 보정한 뒤 ui/pagination/Pagination에 page·pageCount·rangeText(pageRangeText로 계산)·href 또는 onPageChange를 넘긴다 — Pagination 자신은 쪽 상태·데이터 조회를 갖지 않는다"

requirements-completed: [PROJ-01, UX-05]

coverage:
  - id: D1
    description: "번호 창 규칙(넓은 창 8쪽부터 생략, C-27 한 쪽 틈은 번호) + 범위 문구가 순수 함수로 고정됐다"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/pagination.test.ts#pageWindow — 넓은 창(7쪽 이하 전부, 8쪽부터 첫·끝·현재 ±1)"
        status: pass
      - kind: unit
        ref: "test/unit/ui/pagination.test.ts#pageRangeText — 범위 문구(천 단위 쉼표, en dash)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pagination 컴포넌트가 href(next/link Link)/onPageChange(button) 유니언, aria-current, 첫/끝 이전·다음 비렌더, errorCounts 오류 표시를 §7-16 계약대로 렌더한다"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/pagination.test.ts#Pagination — 정적 렌더(§7-16 계약)"
        status: pass
    human_judgment: false
  - id: D3
    description: "폰 창(compact, 6쪽부터 첫·현재·끝)이 넓은 창과 함께 렌더되고 700 중단점 CSS로 하나만 보인다 — 실제 375px DOM 렌더 감사는 이 플랜에 화면이 없어 04-17이 맡는다(계획 probe_fallback 명시)"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/pagination.test.ts#Pagination — 넓은 창·폰 창 이중 렌더(DR-33, 700 중단점)"
        status: pass
      - kind: unit
        ref: "test/unit/ui/pagination.test.ts#pageWindow — 폰 창(5쪽 이하 전부, 6쪽부터 첫·현재·끝, compact:true, 엔지 리뷰 C P3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "lib/kst-date — KST 자정 경계·연말·윤년·kstDayStart 왕복이 현재 시각을 인자로만 받아 서버 시간대와 무관하게 계산된다(B-25, A-18, D11)"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "test/unit/lib/kst-date.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "lib/paging — clampPage·pageCountFrom·LIST_PAGE_SIZE(50)·QUOTE_TABLE_PAGE_SIZE(30)가 목록·견적 표·리저브 공용 단일 출처다"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "test/unit/lib/paging.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "docs/design/SYSTEM.md §7-16 생략 규칙이 완전하다(기본 문장 + C-27 + 폰 6쪽 창) — DECISIONS.md 04-29 기록이 SYSTEM.md 변경보다 앞선 커밋에 있다"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts#docs/design/SYSTEM.md · DECISIONS.md — 2026-09-23 개정(04-29, DR-33)"
        status: pass
      - kind: other
        ref: "git log --format=%s -- docs/design/DECISIONS.md docs/design/SYSTEM.md (DECISIONS 04-29 커밋이 SYSTEM.md 04-29 커밋보다 이전)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 29: 페이지 줄 컴포넌트 + KST 날짜/쪽 보정 공용 모듈 Summary

**목록·리저브·견적 표가 공유할 페이지 줄(`ui/pagination`, C-27 한 쪽 틈은 번호 + 폰 6쪽부터 창)과, 서버 시간대와 무관한 KST 날짜 모듈(`lib/kst-date`) · 쪽 보정 단일 출처(`lib/paging`)를 만들고, 04-08이 §7-16에 적기로 했던 생략 규칙 기본 문장의 누락(ENG-D11)을 같이 고쳤다.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-24T18:06:00Z
- **Completed:** 2026-09-24T19:01:00Z
- **Tasks:** 3 (Task 1 tracer + Task 2 tdd + Task 3 tdd)
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments

- `ui/pagination/page-window.ts` — `pageWindow`(넓은 창 8쪽부터 생략, C-27 한 쪽 틈은 번호, 폰 `compact` 6쪽부터 첫·현재·끝) + `pageRangeText`(천 단위 쉼표, en dash) 순수 함수. 하나의 알고리즘(`threshold`·`near` 파라미터화)이 넓은 창과 폰 창을 모두 계산해 C-27 로직을 중복 없이 재사용한다.
- `ui/pagination/Pagination.tsx` + `.module.css` — `href`(next/link `Link`)/`onPageChange`(`<button type="button">`) 유니언 이동, `aria-current="page"`, 첫/끝 이전·다음 비렌더, `errorCounts` → `오류 N`·접근 이름 `N쪽, 오류 M칸`. 넓은 창·폰 창 목록을 한 `<nav>` 안에 항상 함께 렌더하고 700 중단점 CSS(`display: none`)로 하나만 남긴다.
- `lib/kst-date.ts` — `kstToday`·`kstDateOf`·`kstYear`·`addDays`·`kstDayStart`. 현재 시각을 모듈이 스스로 읽지 않고 인자로만 받는다(04-11에서 04-29로 앞당김 — D11·A-18·B-25).
- `lib/paging.ts` — `clampPage`·`pageCountFrom`·`LIST_PAGE_SIZE`(50)·`QUOTE_TABLE_PAGE_SIZE`(30). 목록(04-17)·견적 표(04-19)·리저브(04-07)가 공유할 단일 출처.
- `docs/design/SYSTEM.md` §7-16 생략 규칙 완성 + `docs/design/DECISIONS.md` 04-29 기록(DECISIONS 커밋이 SYSTEM.md 커밋보다 앞섬) — ENG-D11로 발견한 04-08의 실제 결함(생략 규칙 기본 문장이 SYSTEM.md에 없었음)을 함께 고쳤다.

## Task Commits

Task 1(tracer)은 단일 커밋, Task 2·3(`tdd="true"`)은 test → feat 순서로 커밋했다. Task 3는 문서 선행 요구(DECISIONS 먼저, SYSTEM.md+테스트 같은 커밋) 때문에 docs 커밋 2개가 test/feat 사이에 들어간다.

1. **Task 1: 트레이서 — 번호 창 순수 함수 → Pagination 컴포넌트 → 정적 렌더 단언(C-27 포함)** - `c3dbcb3` (feat)
2. **Task 2: `lib/kst-date` + `lib/paging`** - `a104d50` (test, RED) → `8350a47` (feat, GREEN)
3. **Task 3: 번호 창 규칙 기록 — C-27 + 폰 6쪽 창 (DR-33)** - `c129f84` (docs, DECISIONS 먼저) → `99d9557` (docs, SYSTEM.md+테스트 같은 커밋) → `ace2c61` (test, RED) → `7e7ab9c` (feat, GREEN)

_TDD 태스크(2·3)의 코드 부분은 RED→GREEN 두 커밋. REFACTOR 커밋은 없음 — 구현이 이미 최소·명확해 별도 정리가 필요하지 않았다._

## Files Created/Modified

- `ui/pagination/page-window.ts` - `pageWindow`·`pageRangeText` 순수 함수(넓은 창·폰 창 공용 알고리즘)
- `ui/pagination/Pagination.tsx` - 표현 컴포넌트(href/onPageChange 유니언, 이중 렌더)
- `ui/pagination/Pagination.module.css` - 토큰만, 700 중단점, 폰 `--touch-min` 44×44
- `test/unit/ui/pagination.test.ts` - 번호 창(넓은/폰)·범위 문구·정적 렌더 28개 단언
- `lib/kst-date.ts` - KST 날짜/연도 계산 + `kstDayStart` 왕복(B-25)
- `lib/paging.ts` - `clampPage`·`pageCountFrom`·쪽 크기 상수
- `test/unit/lib/kst-date.test.ts` - KST 경계·연말·윤년·왕복 단언
- `test/unit/lib/paging.test.ts` - 쪽 보정·쪽 수·상수 단언
- `docs/design/DECISIONS.md` - 04-29 기록(C-27 + 폰 6쪽 창 + ENG-D11 보정 기록)
- `docs/design/SYSTEM.md` - §7-16 생략 규칙 완성(기본 문장 + C-27 + 폰 6쪽 창)
- `test/unit/design-system-docs.test.ts` - 04-29 describe 4건(기본 문장 회귀 · C-27 · 폰 6쪽 · DECISIONS 머리글)

## Decisions Made

- `pageWindow`의 넓은 창(threshold 7, near 1)과 폰 창(threshold 5, near 0, compact 옵션)을 하나의 파라미터화된 알고리즘으로 구현 — C-27(건너뛸 쪽이 정확히 하나면 그 번호) 로직이 두 모드에서 자동으로 동일하게 적용된다(중복 구현 없음).
- Task 1에서 `compact` 옵션을 조기 구현했음을 발견하고 Task 3 시작 전에 되돌린 뒤, Task 3에서 RED→GREEN을 다시 밟았다 — 각 태스크의 커밋이 실제로 그 태스크가 도입한 동작만 증명하도록 한다(TDD Iron Law 준수).
- ENG-D11(앞 플랜 결함): 04-08이 §7-16에 적기로 했던 생략 규칙 기본 문장(PC 7쪽/8쪽)이 SYSTEM.md에 전혀 없었다(UI-SPEC ⑧에만 있고 04-08 DECISIONS 본문·실제 파일 모두 누락). 04-08을 되돌리지 않고 04-29가 같은 §7-16 절 안에서 기본 문장까지 함께 추가하고 회귀 테스트로 고정했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [ENG-D11 — 앞 플랜 결함] SYSTEM.md §7-16 생략 규칙 기본 문장 누락(04-08)**
- **Found during:** Task 3 read_first(SYSTEM.md §7-16 확인) — 04-08의 DECISIONS ⑧ 기록 본문에도 「PC는 7쪽 이하면 전부, 8쪽 이상이면 첫·끝·현재 ±1」 문장이 없고, 실제 SYSTEM.md §7-16에도 없었다(UI-SPEC rev 5 ⑧ 847행에만 있음). 04-29의 Task 3 action은 이 문장이 이미 있다고 가정하고 그 뒤에 C-27·폰 문장만 추가하도록 쓰여 있었다.
- **Issue:** 앞 플랜(04-08)이 UI-SPEC의 §7-16 「생략」 절 전체를 SYSTEM.md에 옮기지 않고 C-27·폰 문장 없는 부분 집합만 반영했다 — 04-29가 그 위에 C-27·폰 문장만 이어붙이면 기본 규칙 자체가 여전히 문서에 없는 상태로 남는다.
- **Fix:** UI-SPEC ⑧ 847–850행 원문대로 기본 문장 + C-27 + 폰 6쪽 창을 한 불릿으로 §7-16에 추가(생략 줄 전체를 완성). DECISIONS.md 04-29 기록에 ENG-D11 절로 발견·조치를 남겼다.
- **Files modified:** `docs/design/SYSTEM.md`, `docs/design/DECISIONS.md`, `test/unit/design-system-docs.test.ts`
- **Verification:** `test/unit/design-system-docs.test.ts`의 04-29 describe 첫 it("§7-16에 PC 생략 규칙 기본 문장이 있다(ENG-D11 회귀...)")가 기본 문장을 단언 — 삭제하면 실패함을 확인.
- **Committed in:** `99d9557`

---

**Total deviations:** 1 auto-fixed (ENG-D11, 앞 플랜 결함 — 플랜 명시 규칙에 따라 범위 확대 없이 그 파일만 수정).
**Impact on plan:** SYSTEM.md §7-16이 이제 UI-SPEC ⑧과 완전히 일치한다. 이 플랜의 목표(범위)를 벗어나는 추가 기능·리팩터는 없었다.

## Issues Encountered

None — 모든 검증 명령(단위 4개·lint·typecheck·tokens.css diff·package.json/pnpm-lock diff)이 초록이었다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ui/pagination`·`lib/kst-date`·`lib/paging`가 준비돼 04-17(목록)·04-19(견적 표)·04-07(리저브 그룹 B)·04-20(팀 소속)·04-21(E2E 상대 날짜)·04-14(승인일 왕복)가 바로 import할 수 있다.
- 폰 창(375px) 실제 DOM 렌더 감사(가로 스크롤 0·번호 줄 한 줄)는 이 플랜에 화면이 없어 수행하지 않았다 — 계획 `<probe_fallback>`이 이미 명시한 대로 04-17의 독립 DOM 감사(1280·1024·375)가 맡는다.
- 범위 글자 쉼표는 현재 `Intl.NumberFormat("ko-KR")` 인스턴스 하나로 처리하며, 04-09가 `formatCount`로 이관할 예정(계획에 이미 명시).

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*
