---
phase: 02-design-system-app-shell
plan: 08
subsystem: ui
tags: [css, tokens, accessibility, playwright, next-navigation, design-system]

requires:
  - phase: 02-design-system-app-shell
    provides: 02-01~02-07이 세운 셸(Shell/TopBar/BottomTabs)·CSS Modules 관례·
      Playwright 두 프로젝트(desktop/mobile-375)·D-19~D-32 잠긴 결정
provides:
  - app/globals.css 페이지 층(body 아홉 선언 · 컨트롤 서체 롱핸드 · §4-4 브라우저
    표면 · 전역 :focus-visible)
  - ui/form-alert/FormAlert — 폼 수준 실패 문구(§6-7 A②) 공유 컴포넌트
  - ui/kv-list/KvList — 라벨·값 목록(§6-8 B①·§7-8) 공유 컴포넌트
  - ui/page-header/PageHeader — 화면 제목+부제(§6-0)·오류 제목(§6-9) 공유 컴포넌트
  - ui/shell/current-path.ts — WR-01 현재 메뉴 판정 순수 함수 + TopBar·BottomTabs
    aria-current 배선
  - test/e2e/page-chrome.spec.ts · mobile-page-chrome.spec.ts (신규 E2E 17개)
  - test/unit/ui/current-path.test.ts (신규 단위 7개)
affects: [Phase 3(설정 레지스트리), Phase 4(표·대시보드 — PageHeader 우측 슬롯 확장 지점)]

actuals:
  tokens: 11270
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "화면 골격 단위 규칙(§6-0/§6-7/§6-8/§6-9)은 요소 전역 선택자가 아니라 ui/<component>
      컴포넌트로 뽑는다 — 인접 선택자(h1+p)는 구조 우연에 기대 화면이 하나만 달라져도
      조용히 풀린다(02-08 objective 결정, PageHeader.tsx 파일 머리 주석)"
    - "실물 HTML의 font:inherit 같은 축약은 stylelint(D-20) 허용 목록과 충돌하면
      롱핸드로 편다 — 의도는 유지하되 값은 var(--…) 또는 명시적 inherit 키워드로"

key-files:
  created:
    - ui/form-alert/FormAlert.tsx
    - ui/form-alert/FormAlert.module.css
    - ui/kv-list/KvList.tsx
    - ui/kv-list/KvList.module.css
    - ui/page-header/PageHeader.tsx
    - ui/page-header/PageHeader.module.css
    - ui/shell/current-path.ts
    - test/e2e/page-chrome.spec.ts
    - test/e2e/mobile-page-chrome.spec.ts
    - test/unit/ui/current-path.test.ts
  modified:
    - app/globals.css
    - ui/shell/TopBar.tsx
    - ui/shell/TopBar.module.css
    - ui/shell/BottomTabs.tsx
    - ui/shell/BottomTabs.module.css
    - app/(auth)/login/login-form.tsx
    - app/(app)/account/change-password-form.tsx
    - app/(app)/admin/system-status/page.tsx
    - app/(app)/page.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/expenses/page.tsx
    - app/(app)/cards/page.tsx
    - app/(app)/approvals/page.tsx
    - app/(app)/pnl/page.tsx
    - app/(app)/settings/page.tsx
    - app/(app)/account/page.tsx
    - app/(app)/not-found.tsx
    - app/(app)/error.tsx
    - app/not-found.tsx
    - .planning/WINDOWS.md

key-decisions:
  - "화면 제목·부제는 전역 h1 규칙이 아니라 ui/page-header/PageHeader 컴포넌트다(플랜이
    이미 정한 결정, 실행 시 그대로 따름) — 실물이 .sec 블록으로 모델링했고 인접
    선택자는 내 계정·오류 페이지에서 다른 요소를 우연히 물어 위험하다"
  - "§6-9 오류 제목은 §2-2(‑‑fs-2xl은 KPI 전용)와 긴장하지만 화면 전용 절이 더
    구체적인 정본이라 §6-9(--fs-2xl)를 그대로 구현했다 — SYSTEM.md 정정은 이
    플랜 범위 밖(design-system-docs.test.ts의 DECISIONS 기록 수 6 고정과 충돌)"
  - "font:inherit 축약을 stylelint(D-20) 허용 목록에 맞춰 font-family/font-size/
    line-height/letter-spacing/color 롱핸드로 편다 — 컴포넌트 클래스(.btn·.input·
    .tab)가 요소 선택자보다 특이도가 높아 크기는 그대로, UA 컨트롤 서체만 없앤다"

patterns-established:
  - "Pattern: 폼 수준 실패 문구·라벨값 목록·화면 제목처럼 화면 여러 곳이 공유하는
    SYSTEM.md 골격은 처음부터 ui/ 컴포넌트로 뽑는다(요소 규칙보다 안전)"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "app/globals.css 페이지 층 — body 아홉 선언(색·서체·크기·행간·자간·
      keep-all·anywhere·-webkit-font-smoothing)+margin 0 · button/input/select/
      textarea 컨트롤 서체 · §4-4 브라우저 표면(::selection·caret·accent·scrollbar)
      · 전역 :focus-visible"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#페이지 층 — body 아홉 선언 (02-08 Task 1)"
        status: pass
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#§4-4 브라우저 기본 표면 (02-08 Task 1)"
        status: pass
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#전역 포커스 링 (02-08 Task 1, §4-4)"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-page-chrome.spec.ts#폰 375 페이지 층 (02-08 Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ui/form-alert/FormAlert — 로그인 실패 문구·비밀번호 변경 serverError
      공유 컴포넌트(role=alert, --danger)"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#로그인 실패 문구 — FormAlert (02-08 Task 1, §6-7 A②)"
        status: pass
      - kind: e2e
        ref: "test/e2e/change-password.spec.ts (기존, 문구·역할 불변 회귀)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ui/kv-list/KvList — 시스템 상태 화면 라벨·값 목록(dt/dd, 라벨 96/84,
      점선, dd margin-left 0)"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#시스템 상태 라벨·값 목록 — KvList (02-08 Task 1, §6-8 B①)"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-page-chrome.spec.ts#폰 375 시스템 상태 목록 (02-08 Task 1)"
        status: pass
      - kind: e2e
        ref: "test/e2e/system-status.spec.ts (기존, 텍스트·404 회귀)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ui/page-header/PageHeader — 12개 화면(홈·1차 메뉴 5·설정·내 계정·
      시스템 상태·404×2·오류 경계) 제목+부제/오류 제목 통일, app/**/*.tsx 맨 h1 0개"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#§6-0 화면 제목·부제 · §6-9 오류 제목 (02-08 Task 2)"
        status: pass
      - kind: e2e
        ref: "test/e2e/keyboard-nav.spec.ts (기존, heading 이름 회귀)"
        status: pass
      - kind: e2e
        ref: "test/e2e/a11y.spec.ts (기존, axe-core 6화면 회귀)"
        status: pass
    human_judgment: false
  - id: D5
    description: "WR-01 — TopBar·BottomTabs aria-current 실제 배선(usePathname +
      isCurrentPath), WINDOWS.md 항목 5 fixed"
    requirement: UX-01
    verification:
      - kind: unit
        ref: "test/unit/ui/current-path.test.ts (7개 경계 사례)"
        status: pass
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#§6-0 현재 메뉴(WR-01)"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-page-chrome.spec.ts#폰 375 하단 탭 현재 표시 (02-08 Task 3, WR-01)"
        status: pass
      - kind: other
        ref: "grep -Ec '^\\| 5 \\| 02 \\| deviation \\| ui/shell/TopBar.tsx \\|.*\\| fixed \\|' .planning/WINDOWS.md"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 8: 페이지 층 토큰 이관 + PageHeader/FormAlert/KvList + WR-01 Summary

**app/globals.css에 실물 body 아홉 선언·§4-4 브라우저 표면·전역 포커스 링을 토큰으로 이관하고, §6-0/§6-7/§6-8 화면 골격을 PageHeader·FormAlert·KvList 세 ui/ 컴포넌트로 뽑아 12개 화면에 적용했으며, TopBar·BottomTabs에 usePathname 기반 aria-current를 배선해 WR-01을 닫았다.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-19T22:09:00Z
- **Completed:** 2026-09-19T22:24:49Z
- **Tasks:** 3
- **Files modified:** 30 (10 created, 20 modified)

## Accomplishments

- `app/globals.css`에 실물(form-expense.html:16-21) body 아홉 선언을 전부 토큰 참조로 옮기고 UA margin을 0으로 접었다 — 렌더된 body가 `color rgb(11,21,18)` · `font-size 14px`(폰 15px) · `line-height 22.4px` · `letter-spacing -0.21px` · `word-break keep-all` · `overflow-wrap anywhere` · `margin 0px`다.
- §4-4 브라우저 기본 표면(`::selection`·`caret-color`·`accent-color`·`scrollbar-color`·`scrollbar-width`·전역 `:focus-visible`)을 전부 토큰으로 배선했다. 컴포넌트 포커스 스타일이 없는 요소(목록 EMPTY의 3차 링크)가 이제 전역 링을 받는다.
- `button, input, select, textarea`에 `--font-sans` 롱핸드 규칙을 추가해 UA 컨트롤 서체(Arial)를 없앴다 — 컴포넌트 클래스(`.btn`·`.input`)의 크기는 특이도가 높아 그대로다.
- `ui/form-alert/FormAlert`를 만들어 로그인 실패 문구·비밀번호 변경 `serverError`를 같은 컴포넌트(`role="alert"`, `--danger`)로 통일했다.
- `ui/kv-list/KvList`를 만들어 시스템 상태 화면의 라벨·값 목록을 이관했다(라벨 96px/84px, 점선 `--line`, `dd margin-left: 0`).
- `ui/page-header/PageHeader`를 만들어 12개 화면(홈·프로젝트·지출결의·법인카드·결재·손익·설정·내 계정·시스템 상태·셸 404·루트 404·오류 경계)의 맨 h1+부제를 한 컴포넌트로 통일했다 — `app/**/*.tsx`에 남은 맨 `<h1>`이 0개다(로그인의 sr-only h1만 예외).
- `ui/shell/current-path.ts`(`isCurrentPath`, 순수 함수, import 0)를 만들고 `TopBar.tsx`·`BottomTabs.tsx`가 `usePathname()`으로 직접 읽어 `aria-current`를 실제로 배선했다(WR-01). `BottomTabs.module.css`에 `.tab[aria-current="page"]`(`--accent` + `--inset-tab`)를 추가했다.
- `.planning/WINDOWS.md` 항목 5를 `gsd-tools windows fixed 5`로 종결했다(open 5 → open 4/fixed 1).

## Task Commits

각 태스크는 개별 커밋으로 원자적으로 처리했다:

1. **Task 1: 페이지 층 이관 + FormAlert + KvList** - `c510522` (feat)
2. **Task 2: PageHeader — 12개 화면 적용** - `7047c36` (feat)
3. **Task 3: WR-01 aria-current 배선 + WINDOWS 종결** - `3748fee` (fix)

_세 태스크 모두 `tdd="true"` — 각 태스크의 새 단언을 먼저 실행해 구현 전 전부 실패(RED)함을 확인한 뒤 구현하고 다시 실행해 통과(GREEN)시켰다. 태스크 내부에서 RED→GREEN이 같은 커밋에 들어간다(플랜이 명시한 "스펙 먼저 → 빨강 확인 → 구현 → 초록" 순서를 커밋 전에 수행하고 결과만 커밋)._

**Plan metadata:** 이 SUMMARY 커밋에서 처리 (docs: complete plan)

## RED 실행 결과 (구현 전 실패 개수)

- Task 1: `page-chrome.spec.ts` + `mobile-page-chrome.spec.ts` 8개 단언 전부 실패(objective의 실측값과 일치 — body color/size/line-height/letter-spacing/margin, §4-4 표면 3종, FormAlert 색, 전역 포커스 링, KvList 5종, 폰 body/dt 폭 2종).
- Task 2: `page-chrome.spec.ts`의 §6-0/§6-9 describe 4개 전부 실패(h1 18px 기대에 28px 수신 등 — Task 1 적용 후 body가 14px이라 UA 2em=28px, 계획의 "변경 전 32px" 전제와 달랐지만 자간·행간 단언은 여전히 실패해 RED로 유효).
- Task 3: 단위 테스트 7개(모듈 없음으로 스위트 실패) + E2E 4개(count 1 기대에 0 수신 2건, text 기대 실패 1건 — 나머지 2건은 "count 0" 사전조건이라 자명하게 통과, RED 판정은 실패한 3건으로 확인).

## Files Created/Modified

- `app/globals.css` - 페이지 층(body 9선언·컨트롤 서체·§4-4 표면·전역 포커스 링)
- `ui/form-alert/FormAlert.tsx`/`.module.css` - 폼 수준 실패 문구 컴포넌트
- `ui/kv-list/KvList.tsx`/`.module.css` - 라벨·값 목록 컴포넌트
- `ui/page-header/PageHeader.tsx`/`.module.css` - 화면 제목+부제/오류 제목 컴포넌트
- `ui/shell/current-path.ts` - WR-01 경로 판정 순수 함수
- `ui/shell/TopBar.tsx`/`.module.css` - aria-current 배선 + 딥그린 위 포커스 링 보완
- `ui/shell/BottomTabs.tsx`/`.module.css` - aria-current 배선 + 현재 탭 표시
- `app/(auth)/login/login-form.tsx`, `app/(app)/account/change-password-form.tsx` - FormAlert 적용
- `app/(app)/admin/system-status/page.tsx` - KvList + PageHeader 적용(D-17 세 줄 불변)
- `app/(app)/page.tsx`, `projects`, `expenses`, `cards`, `approvals`, `pnl`, `settings`, `account/page.tsx`, `not-found.tsx`(x2), `error.tsx` - PageHeader 적용
- `.planning/WINDOWS.md` - 항목 5 fixed
- `test/e2e/page-chrome.spec.ts`, `test/e2e/mobile-page-chrome.spec.ts` - 신규 E2E(데스크톱 12 + 폰 5 = 17)
- `test/unit/ui/current-path.test.ts` - 신규 단위 7개

## Decisions Made

플랜이 objective에서 이미 확정한 결정(실행 시 변경 없이 그대로 따름):
- 화면 제목·부제는 전역 `h1` 규칙이 아니라 `PageHeader` 컴포넌트(구조 우연 회피, `.sec` 블록 실물 대응).
- §6-9 오류 제목은 §2-2와 긴장하지만 화면 전용 절(§6-9)을 정본으로 그대로 구현 — SYSTEM.md 정정은 범위 밖.
- 실물 `font:inherit` 축약은 stylelint(D-20) 허용 목록과 충돌해 롱핸드(`font-family`/`font-size`/`line-height: inherit`/`letter-spacing: inherit`/`color: inherit`)로 편다.

## Deviations from Plan

None - 플랜에 쓰인 그대로 실행했다. 한 가지 서식 조정만 있었다: `app/globals.css`의 `button, input, select, textarea` 선택자를 처음엔 가독성을 위해 여러 줄로 나눠 썼다가, Task 1 acceptance criteria의 grep 패턴(`'button, input, select, textarea'`, 한 줄 가정)에 맞춰 한 줄로 되돌렸다 — 동작·CSS 특이도에는 영향 없음, 순수 서식.

## Issues Encountered

None.

## Human Judgment Items (플랜 success_criteria가 명시한 SUMMARY 보고 항목)

1. **SYSTEM.md §2-2(`--fs-2xl` = 손익 대시보드 KPI 전용) vs §6-9(오류 제목 `--fs-2xl`) 긴장.** 이 플랜은 §6-9를 정본으로 그대로 구현했다(PageHeader `titleSize="2xl"`). 정정하려면 DECISIONS.md 기록이 필요하고, 그 전에 `design-system-docs.test.ts`의 `DECISIONS.md` 2026-09-19 기록 수 단언(`toBe(6)`)을 완화(`toBeGreaterThanOrEqual`)해야 한다(WR-09 제안, 미적용) — 이 플랜 범위 밖.
2. **로그인 실패 문구 카피가 §6-7 A②의 한국어 문장(`이메일 또는 비밀번호가 올바르지 않습니다.`)이 아니라 better-auth 영문(`Invalid email or password`)이다.** `login-form.tsx`가 `result.error.message`를 `GENERIC_ERROR`(한국어)보다 우선한다(`result.error.message ?? GENERIC_ERROR`) — 스타일이 아니라 카피 결함이라 이 플랜(스타일 갭 클로저)의 범위 밖으로 두고 여기 보고만 한다. 이 플랜의 새 스펙(`page-chrome.spec.ts` FormAlert 테스트)은 색만 단언하고 텍스트는 단언하지 않는다(objective에 명시).

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- Phase 2 성공 기준 2(SYSTEM.md 컴포넌트 + tokens.css 토큰만 쓴다)가 페이지 층까지 참이 되었다 — `02-VERIFICATION.md`의 유일한 갭이 닫혔다.
- WR-01이 닫혀 `.planning/WINDOWS.md`의 open_count가 5→4(fixed_count 1)로 줄었다. 남은 4건은 01-페이즈 `.squawk.toml` lint-warning 예외(이 플랜과 무관, 이미 사용자 승인된 의도적 배제)다.
- 새 토큰 0 · 새 의존성 0 · `docs/design/tokens.css`·`SYSTEM.md`·`DECISIONS.md` 불변(커밋 `25aaa4f`와 바이트 동일) — `pnpm lint`(stylelint D-20 포함) · `pnpm typecheck` · `pnpm test:unit`(291개) · `pnpm test:e2e`(47개: 기존 30 + 신규 17) · `pnpm build` 전부 통과.
- WR-02~WR-07 · IN-01~IN-07은 여전히 열려 있다(이 플랜 범위 밖, 사용자 지정). 특히 WR-07(레이아웃 단독 인증)은 Phase 4 전 별도 수정이 필요하다.
- 다음 단계: `/gsd-verify-work 02`로 Phase 2 전체 재검증 후 `/gsd-complete-milestone` 또는 Phase 3 착수.

## Self-Check: PASSED

- 생성 파일 전부 `[ -f ]` 확인됨(아래 self_check 절 참고).
- `git log --oneline --all --grep="02-08"` — 3개 커밋 확인.
- 각 태스크의 `<acceptance_criteria>`를 재실행해 전부 PASS 확인(본문 grep 결과 위 커밋 로그 참고).
- 플랜 레벨 `<verification>` 5개 명령(lint·typecheck·lint:sql·test:unit·test:e2e·build) 전부 통과.

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*
