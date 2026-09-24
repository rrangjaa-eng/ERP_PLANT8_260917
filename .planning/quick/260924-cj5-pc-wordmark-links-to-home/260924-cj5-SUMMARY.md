---
phase: quick-260924-cj5
plan: 01
subsystem: ui
tags: [nextjs, playwright, a11y, design-tokens]

requires: []
provides:
  - "PC/폰 상단 바 워드마크 PLANT8이 href=\"/\" 링크(aria-label \"PLANT8 내 차례\")"
  - "Tab 순서: 스킵 링크 → 워드마크 → 프로젝트 → 지출결의 → 법인카드 → 결재 → 손익 → 사용자 트리거"
affects: [ui/shell, design-review, a11y]

actuals:
  tokens: 2592
  tasks: 2
  commits: 2
  plan_head_before: f2ee86e

tech-stack:
  added: []
  patterns:
    - "워드마크처럼 기존 span을 감싸는 내비게이션 링크는 next/link + align-self: stretch로 히트 영역을 바 높이만큼 채운다(매직 넘버 padding 없이 PC/폰 터치 목표를 한 규칙으로 만족)"

key-files:
  created:
    - test/e2e/wordmark-home.spec.ts
    - test/e2e/mobile-wordmark-home.spec.ts
  modified:
    - ui/shell/TopBar.tsx
    - ui/shell/TopBar.module.css
    - test/e2e/keyboard-nav.spec.ts

key-decisions:
  - "워드마크 = 홈(/) 링크, 접근 가능한 이름 = \"PLANT8 내 차례\"(label-in-name, WCAG 2.5.3)"
  - "기존 워드마크 span은 그대로 두고 링크로 감싸기만 함 — 글자 커닝 불변"
  - "히트 영역 = align-self: stretch(바 높이 PC 38 · 폰 44) — §10 PC 32 하한과 폰 44×44를 한 규칙으로 만족, 폰 전용 미디어 쿼리 불필요"
  - "hover = 밑줄(.userTrigger와 같은 이유, 이미 --bg로 가장 밝은 색이라 색 변화로 hover를 못 보임)"
  - "aria-current 없음 — 워드마크는 1차 메뉴 항목이 아니다"
  - "계획은 next/link 대신 평범한 <a>를 지시했으나, @next/next/no-html-link-for-pages 린트가 내부 페이지로의 리터럴 href=\"/\"를 막아 next/link로 전환(렌더 결과는 여전히 <a>, 새 의존성 아님)"

patterns-established: []

requirements-completed: [QUICK-260924-cj5, FINDING-001]

coverage:
  - id: D1
    description: "PC/폰 상단 바 워드마크가 href=\"/\" 링크이고 이름이 \"PLANT8 내 차례\"다"
    requirement: "FINDING-001"
    verification:
      - kind: e2e
        ref: "test/e2e/wordmark-home.spec.ts#워드마크가 보이고 href가 / 다"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-wordmark-home.spec.ts#바 높이 44 불변 · 워드마크 44×44 이상 · 바를 넘치지 않는다 · 누르면 / 로 간다"
        status: pass
    human_judgment: false
  - id: D2
    description: "/projects에서 워드마크를 마우스로 누르면 / 로 이동해 「내 차례」 제목이 보인다"
    requirement: "FINDING-001"
    verification:
      - kind: e2e
        ref: "test/e2e/wordmark-home.spec.ts#/projects에서 워드마크를 마우스로 누르면 / 로 이동해 「내 차례」 제목이 보인다"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tab 순서 스킵 링크 → 워드마크 → 프로젝트… 이고 Enter로 워드마크에서 / 에 도착, 링이 --bar-fg다"
    requirement: "FINDING-001"
    verification:
      - kind: e2e
        ref: "test/e2e/wordmark-home.spec.ts#Tab 두 번(스킵 링크 다음)으로 워드마크에 닿고, 링이 --bar-fg이며 Enter로 / 에 도착한다"
        status: pass
      - kind: e2e
        ref: "test/e2e/keyboard-nav.spec.ts#주요 요소의 Tab 도달 순서가 시각 순서(좌→우)와 같다"
        status: pass
    human_judgment: false
  - id: D4
    description: "워드마크 hover 시 밑줄, 히트 영역 ≥32px(PC)이며 바를 넘치지 않는다"
    requirement: "FINDING-001"
    verification:
      - kind: e2e
        ref: "test/e2e/wordmark-home.spec.ts#워드마크 hover 시 밑줄이 생기고, 히트 영역이 32px 이상이며 바를 넘치지 않는다(§10 PC 하한)"
        status: pass
    human_judgment: false
  - id: D5
    description: "기존 셸·접근성 스펙(design-review-p2 · user-menu · a11y · tablet-shell · page-chrome · mobile-shell · mobile-design-review-p2 · mobile-page-chrome · mobile-next-turn)이 워드마크 링크와 함께 CI=true에서 그대로 통과한다"
    verification:
      - kind: e2e
        ref: "CI=true playwright: wordmark-home · keyboard-nav · design-review-p2 · user-menu · a11y · tablet-shell · page-chrome · mobile-wordmark-home · mobile-shell · mobile-design-review-p2 · mobile-page-chrome · mobile-next-turn (70 tests)"
        status: pass
      - kind: unit
        ref: "vitest --project unit test/unit/ui (180 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "독립 DOM 감사(/design-review, CI=true 실측)와 /qa — 실행자는 UI 완료를 주장하지 않는다"
    verification: []
    human_judgment: true
    rationale: "CLAUDE.md 화면 검증 순서상 독립 DOM 감사와 /qa는 이 계획 실행자가 아닌 오케스트레이터/별도 에이전트가 수행한다. 이 계획은 코드·자동화 테스트만 담당."

duration: 12min
completed: 2026-09-24
status: complete
---

# Phase quick-260924-cj5 Plan 01: PC 상단 바 워드마크 홈 링크 Summary

**PC/폰 상단 바 워드마크 PLANT8을 `/`(「내 차례」) 링크로 만들어 FINDING-001(PC에서 첫 화면으로 돌아갈 길이 없다)을 닫음 — next/link + align-self: stretch 히트 영역, Tab 순서에 편입.**

## Performance

- **Duration:** 12 min (RED 09:12:17Z → GREEN 09:16:05Z 커밋 기준, 전체 실행 약 20분)
- **Started:** 2026-09-24T09:09:00Z
- **Completed:** 2026-09-24T09:18:00Z
- **Tasks:** 2/2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- PC(1280)·폰(375) 상단 바 워드마크가 `href="/"` 링크(next/link)로 동작 — 이름 "PLANT8 내 차례", 마우스·키보드 모두 「내 차례」 홈 도착
- Tab 순서: 스킵 링크 → 워드마크 → 프로젝트 → 지출결의 → 법인카드 → 결재 → 손익 → 사용자 트리거
- 워드마크 링: `--bar-fg` · hover: 밑줄 · 히트 영역: 바 높이(PC 38 ≥ 32, 폰 44×44) · 바 넘침 없음 · 폰 바 높이 44 불변
- 기존 셸·접근성 스펙(9개 파일, 70 테스트) + 단위 UI 테스트(180개) 전부 CI=true에서 그대로 통과 — 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** `test(design): FINDING-001 — failing specs for wordmark home link` — `2e977e0`
2. **Task 1 (GREEN):** `fix(design): FINDING-001 — top-bar wordmark links to the 내 차례 home` — `257c2ab`

_Task 2(스윕)는 실행 결과가 전부 통과 — 구현 변경이 필요하지 않아 추가 커밋 없음._

**Plan metadata:** 이 커밋(docs) — 아래 참고.

## Files Created/Modified

- `test/e2e/wordmark-home.spec.ts` - PC 회귀 스펙(링크·이름·마우스 이동·키보드 이동·`--bar-fg` 링·hover 밑줄·히트 영역)
- `test/e2e/mobile-wordmark-home.spec.ts` - 폰 375 회귀 스펙(44×44·바 높이 44 불변·누르면 홈)
- `test/e2e/keyboard-nav.spec.ts` - Tab 순서 단언에 워드마크를 스킵 링크와 프로젝트 사이에 삽입
- `ui/shell/TopBar.tsx` - 워드마크 span을 `<Link href="/">`로 감쌈, `aria-label="PLANT8 내 차례"`
- `ui/shell/TopBar.module.css` - `.markLink` · `.markLink:hover` · `.markLink:focus-visible`(토큰 참조만)

## Decisions Made

- 접근 가능한 이름 = `aria-label="PLANT8 내 차례"`(label-in-name, WCAG 2.5.3)
- 기존 `<span className={styles.mark}>`는 그대로 두고 링크로 감싸기만 함(글자 커닝 불변)
- 히트 영역은 `align-self: stretch`로 바 높이(PC 38 · 폰 44)를 채움 — 매직 넘버 padding 없이 PC §10 32 하한과 폰 44×44를 한 규칙으로 만족, 폰 전용 미디어 쿼리 불필요
- hover = 밑줄(.userTrigger와 같은 이유 — 이미 `--bg`로 가장 밝은 색이라 색으로는 hover를 못 보임)
- aria-current는 달지 않음(워드마크는 §6-0 「현재 메뉴」 표시 대상이 아니다)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 평범한 `<a>` 대신 next/link 사용**
- **Found during:** Task 1 GREEN 단계, `pnpm lint`
- **Issue:** 계획은 "next/link가 아니라 평범한 `<a>`"를 지시했으나(기존 1차 메뉴 링크 컨벤션 근거), `@next/next/no-html-link-for-pages` 린트 규칙이 내부 페이지로의 리터럴 `href="/"`를 가진 `<a>`를 막았다(exit code 1) — CLAUDE.md의 싼 게이트(`pnpm lint`) 통과가 하드 요구사항이라 계획대로 진행하면 Task 1이 완료될 수 없었다.
- **Fix:** `<a href="/">`를 `<Link href="/">`(next/link)로 교체. `next/link`는 `<a>`를 확장한 컴포넌트로 렌더 결과·역할(role=link)·href 속성이 동일해 기존 테스트 계약(getByRole("link")·toHaveAttribute("href","/"))에 영향 없음. 새 의존성 추가 아님(Next.js 내장 API). 사용 전 `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`로 이 버전의 API(기본 사용법 `<Link href="/dashboard">`)를 확인했다.
- **Files modified:** `ui/shell/TopBar.tsx`
- **Verification:** `pnpm lint && pnpm typecheck` 통과, CI=true 12개 테스트(wordmark-home·keyboard-nav·mobile-wordmark-home) 전부 통과.
- **Committed in:** `257c2ab` (Task 1 GREEN 커밋)

---

**Total deviations:** 1 auto-fixed (1 blocking — lint 규칙 충돌)
**Impact on plan:** 계획의 의도(평범한 `<a>`, 새 Next API 안 씀)와 다르지만 결과 동작·접근성 계약은 완전히 동일하다. 스코프 크리프 없음 — TopBar.tsx의 import 한 줄과 태그 두 곳만 바뀌었다.

## Issues Encountered

None — RED 단계에서 예상한 6건의 실패(테스트 A~E + keyboard-nav Tab 순서)가 정확히 예상 사유(워드마크 링크 부재)로만 발생했고, GREEN에서 전부 해소됐다.

## RED → GREEN Evidence

**RED (구현 전 코드, CI=true):**
```
CI=true pnpm exec playwright test test/e2e/wordmark-home.spec.ts test/e2e/keyboard-nav.spec.ts test/e2e/mobile-wordmark-home.spec.ts --no-deps
6 failed, 6 passed
```
실패 6건 전부 `element(s) not found` (`getByRole('link', { name: 'PLANT8 내 차례' })`) 또는 keyboard-nav의 Tab 순서 불일치(두 번째 Tab이 워드마크가 아니라 프로젝트에 닿음) — 다른 사유(빌드·DB·로그인 실패) 없음. keyboard-nav.spec.ts의 나머지 5개 테스트는 그대로 통과.

**GREEN (구현 후, CI=true):**
```
CI=true pnpm exec playwright test test/e2e/wordmark-home.spec.ts test/e2e/keyboard-nav.spec.ts test/e2e/mobile-wordmark-home.spec.ts --no-deps
12 passed (32.9s)
```

## Task 2: 셸 회귀 스윕 결과

```
pnpm exec vitest run --project unit test/unit/ui
Test Files 15 passed (15) · Tests 180 passed (180)

CI=true pnpm exec playwright test wordmark-home keyboard-nav design-review-p2 \
  user-menu a11y tablet-shell page-chrome mobile-wordmark-home mobile-shell \
  mobile-design-review-p2 mobile-page-chrome mobile-next-turn --no-deps
70 passed (1.3m)
```

스윕 차단 없음 — 다른 셸 스펙의 가정이 이번 변경으로 깨진 곳이 없었다. 실측이 계획 시점 정적 분석("이미 확인한 사실")을 확인해 준다. 워드마크·CSS 변경으로 추가 수정이 필요하지 않아 Task 2에는 별도 `fix(design):` 커밋이 없다.

## SYSTEM.md / DECISIONS.md

SYSTEM.md §6-0 문구 반영은 오케스트레이터 몫이다 — 이 계획은 `docs/design/SYSTEM.md`·`docs/design/DECISIONS.md`·`.planning/STATE.md`를 열거나 고치지 않았다(`git show --name-only`로 두 커밋 모두 확인: `test/e2e/*.spec.ts`·`ui/shell/TopBar.tsx`·`ui/shell/TopBar.module.css`만 있음).

독립 DOM 감사(`/design-review`, CI=true 실측)와 `/qa`는 이 계획 실행자가 아닌 별도 에이전트/오케스트레이터가 이 계획 뒤에 수행할 몫이다 — 이 계획만으로 UI 완료를 주장하지 않는다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FINDING-001이 코드·자동화 테스트 수준에서 닫혔다. `/design-review`(CI=true 실측)와 `/qa`로 독립 확인이 남아 있다.
- SYSTEM.md §6-0에 이 새 계약(워드마크 = 홈 링크, aria-label 문구)을 반영하는 것은 오케스트레이터 몫이다.

---
*Phase: quick-260924-cj5*
*Completed: 2026-09-24*
