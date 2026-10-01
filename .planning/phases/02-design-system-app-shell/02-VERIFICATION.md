---
phase: 02-design-system-app-shell
verified: 2026-10-01T03:40:00Z
status: passed
score: 5/5 must-haves verified
mode: mvp
mvp_user_story_valid: false
covered_files:
  - ".github/workflows/ci.yml"
  - ".github/workflows/deploy.yml"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/02-design-system-app-shell/02-01-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-01-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-02-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-02-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-03-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-03-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-04-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-04-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-05-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-05-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-06-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-06-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-07-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-07-SUMMARY.md"
  - ".planning/phases/02-design-system-app-shell/02-08-PLAN.md"
  - ".planning/phases/02-design-system-app-shell/02-08-SUMMARY.md"
  - "app/(app)/account/page.tsx"
  - "app/(app)/layout.tsx"
  - "app/(auth)/login/login-error.ts"
  - "app/(auth)/login/page.tsx"
  - "app/globals.css"
  - "app/layout.tsx"
  - "docs/design/BRIEF.md"
  - "docs/design/DECISIONS.md"
  - "docs/design/EXPLORE.md"
  - "docs/design/SYSTEM.md"
  - "docs/design/tokens.css"
  - "package.json"
  - "stylelint.config.mjs"
  - "test/e2e/a11y.spec.ts"
  - "test/e2e/change-password.spec.ts"
  - "test/e2e/fonts.spec.ts"
  - "test/e2e/keyboard-nav.spec.ts"
  - "test/e2e/login-logout.spec.ts"
  - "test/e2e/mobile-page-chrome.spec.ts"
  - "test/e2e/mobile-shell.spec.ts"
  - "test/e2e/page-chrome.spec.ts"
  - "test/e2e/tablet-shell.spec.ts"
  - "test/e2e/user-menu.spec.ts"
  - "test/unit/design-system-docs.test.ts"
  - "test/unit/stylelint-config.test.ts"
  - "test/unit/ui/current-path.test.ts"
  - "test/unit/ui/role-menu.test.ts"
  - "test/unit/ui/system-md-compliance.test.ts"
  - "ui/auth-frame/AuthFrame.module.css"
  - "ui/list-empty/ListEmpty.tsx"
  - "ui/page-header/PageHeader.tsx"
  - "ui/shell/BottomTabs.tsx"
  - "ui/shell/MoreSheet.tsx"
  - "ui/shell/Shell.tsx"
  - "ui/shell/TopBar.module.css"
  - "ui/shell/TopBar.tsx"
  - "ui/shell/role-menu.ts"
covered_digest: "v1:sha256:292bd2d1e8117395f8a8feaa8cac10dbfa3b49158adb627677ca2b368f890647"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  previous_verified: 2026-09-24T09:42:24Z (HEAD 2d7f73e)
  reason: "stale — covered_files 중 SYSTEM.md·DECISIONS.md·globals.css·셸(TopBar·MoreSheet·role-menu)·login-error.ts·E2E 스펙이 Phase 3·4·04.1~04.4·quick 작업에서 바뀜(33937dd → HEAD aa5464e, docs/design·app·ui 비이미지 100파일 +3626/−89)"
  head: "aa5464e (브랜치 claude/close-phases-02-03, origin/main f85c9af + .planning/.continue-here.md 삭제 1건)"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  resolved_human_items:
    - "SYSTEM.md 신설 절 결정 출처 대조 — 사용자 승인 2026-10-01"
    - "배포본 확인 — staging deploy #103(f85c9af) success + 사용자 로그인 확인 2026-10-01"
human_verification:
  - test: "02-01 체크포인트 응답(24개)·DECISIONS.md와 SYSTEM.md 신설 절(§6-7·§6-8·§6-9·§6-10·§7-11~§7-17)을 대조해, 사람이 정하지 않은 제품 동작이 확정 문장으로 들어가지 않았는지 확인(02-01 금지 조항 ①)"
    expected: "신설 절의 모든 확정 문장이 체크포인트 응답 또는 DECISIONS.md 날짜 기록에 근거한다"
    why_human: "결정의 출처가 사람인지는 코드·문서 대조로 알 수 없다"
    status: resolved
    resolution: "사용자 판정(2026-10-01 채팅) 「사람이 정한 결정 맞음」 승인. 보조 근거: 33937dd 이후 SYSTEM.md 변경(§6-1·§6-10·§7-12 개정, §7-16·§7-17 신설 등)마다 DECISIONS.md 날짜 기록(2026-09-23~09-30 50여 건)이 있고 /plan-design-review·/design-review를 거쳤다"
  - test: "스테이징 배포본이 검증한 코드와 같은 커밋인지, 로그인·셸·내 계정·관리 화면이 토큰 스타일(Pretendard·딥그린 상단 바·360 로그인 틀)로 렌더되는지 확인"
    expected: "성공 기준 2의 '배포된 앱' 조건 — 배포 리비전 = 검증 코드, 화면이 토큰 스타일로 정상"
    why_human: "로그인한 셸은 자격 증명이 필요하다(자동 모드 분류기가 Claude의 자격 증명 사용을 막음)"
    status: resolved
    resolution: "deploy 워크플로 run #103(id 36807956531, main f85c9afa…, 2026-10-01T02:53Z 시작) — ci/quality·integration(2)·e2e(2)·staging 전부 success(검증자가 gh로 재확인). 스테이징 /login 200, HTML이 pretendard/pretendard-dynamic-subset.css를 로드(검증자가 curl로 재측정). 로그인 뒤 셸·상단 바·서체·/admin·/admin/permissions는 사용자가 시스템 관리자로 직접 보고 「둘 다 정상」(2026-10-01) — 로그인 화면 이후는 사용자의 관찰이다"
---

# Phase 2: 디자인 시스템·앱 셸 Verification Report

**Phase Goal:** 직원이 폰과 PC에서 `docs/design/SYSTEM.md` 기준으로 만들어진 앱 셸(로그인·내 계정·내비게이션)을 쓰고, 이후 모든 화면은 이 토큰·컴포넌트만 쓴다
**Verified:** 2026-10-01T03:40:00Z (HEAD `aa5464e`, 브랜치 claude/close-phases-02-03, 기반 origin/main `f85c9af`)
**Status:** passed
**Re-verification:** Yes — stale 재검증(페이즈 종료용). 이전 판정(2026-09-24, human_needed 5/5)의 주장은 물려받지 않고 다섯 성공 기준을 현재 코드에서 다시 확인했다. 판정 기준은 "코드가 그대로인가"가 아니라 "이후 페이즈가 넓힌 SYSTEM.md·셸·토큰 위에서 Phase 2 계약이 여전히 성립하는가"다.

## MVP 모드 불일치 (이월, 변화 없음)

ROADMAP은 `Mode: mvp`지만 목표 문장이 User Story 형식이 아니다(`mvp_user_story_valid: false`). 이전과 같이 ROADMAP 성공 기준 다섯을 계약으로 삼아 목표 역방향으로 검증했다.

## 이번 재검증 범위 (33937dd → aa5464e)

shallow 클론이라 이전 판정의 `2d7f73e`는 없다. 이전 VERIFICATION.md가 들어간 마지막 커밋 `33937dd`(2026-09-24 22:18, PR #66)를 기준으로 삼았다.

| 영역 | 변화 | Phase 2 계약 영향 |
|------|------|------------------|
| `docs/design/tokens.css` | **변화 없음** — 마지막 변경은 `3c1b015`(이전 판정 이전). 색·서체·radius 토큰 그대로(`--radius: 0`, `--font-sans` 하나) | 없음 |
| `stylelint.config.mjs`·`app/layout.tsx`·`public/fonts`·`BRIEF.md`·`EXPLORE.md` | 변화 없음 | 없음 |
| `docs/design/SYSTEM.md` | +280줄: §6-1 연차 목록 편입, §6-10 관리 11개, §7-12 구현(04.2)·배지·더 보기 예외, §7-16 페이지 줄·§7-17 확인 모달 신설, §7-3 편집 표 보강, §8 카피 규칙 개정(명사형 오류 문구) | 아래 성공 기준 4 경고 참고 |
| `docs/design/DECISIONS.md` | +633줄, 2026-09-23~09-30 기록 50여 건 | SYSTEM.md 변경의 출처 기록 |
| `docs/design/SKIN-EXPLORE.md`·`explore-skin/` | 스킨 리프레시 발산 목업(「확정이 아니다」). 앱 코드에서 import 0건 | tokens.css 미적용 — 절차(DECISIONS → SYSTEM → tokens) 대기 중 |
| `app/globals.css` | `kbd { font-family: var(--font-sans) }`, `select { max-width: 100% }` 추가 | 토큰만 |
| `app/(auth)/login/login-error.ts` | 일반 오류 문구 「이메일 또는 비밀번호 오류」(§8 명사형, DECISIONS 2026-09-26), 잠김 판정 `isLockedMessage` | 계약 유지 |
| `app/(app)/layout.tsx`·`ui/shell/*` | `UnreadCountProvider`·알림 배지(04.2), 「알림함」이 계정 그룹 첫 항목 | 셸은 여전히 `roleMenu()` 계산 결과만 렌더 |
| 그 밖 | Phase 4·04.x 화면·`ui/table`·`ui/confirm-dialog`·`ui/pagination` 등 | "이후 모든 화면은 토큰·컴포넌트만" 검사 대상 |

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 — 계약)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SYSTEM.md·tokens.css가 존재하고 §1 브리프 → §2 발산 → §3 수렴 산출물이며 `/plan-design-review`를 통과했다. 260907 화면은 참고하지 않았다 | ✓ VERIFIED | `docs/design/{BRIEF,EXPLORE,SYSTEM,DECISIONS}.md`·`tokens.css` 존재. BRIEF·EXPLORE·tokens.css는 `33937dd` 이후 바이트 동일(`git diff --stat` 빈 출력). SYSTEM.md 이후 변경은 DECISIONS.md 날짜 기록을 동반한다(§7-16 ↔ 2026-09-23 ⑧, §7-17 ↔ ⑮, §7-12 더 보기 예외 ↔ 2026-09-26, §6-10 11개·연차 ↔ 2026-09-29 A1·A4 등). 출처가 사람 결정인지는 사용자가 2026-10-01 승인(사람 항목 1, resolved). `/plan-design-review` 통과는 역사적 사실(ROADMAP 전제문) |
| 2 | 배포된 앱의 로그인·내 계정·앱 셸이 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓴다. 새 색·서체·radius 없음, Phase 1 임시 화면 없음 | ✓ VERIFIED | **직접 실행:** `pnpm lint`(eslint + stylelint `ui/**/*.module.css`·`app/globals.css`·`app/**/*.module.css`) exit 0. 앱 CSS 47파일의 `var(--*)` 참조 87종 ↔ tokens.css 정의 `comm -23` → **미정의 0**, 앱 CSS 안 로컬 커스텀 속성 정의 0, `@font-face`·`@import` 0. `font-weight`·`line-height`·`letter-spacing`·`border-radius`·`font-family`의 var() 아닌 값은 `inherit` 3건뿐(globals 2 · inbox-table 1). `ui/`·`app/` TSX에 hex·`rgb(`·`fontFamily`·`borderRadius`·`style={{` 0건(정규식 매치 1건은 주석의 `#104`). `style=` 1건은 `document-actions.tsx:138` 높이 값(간격 — D-20 금지 범위 밖). tokens.css 무변경이라 새 색·서체·radius 토큰 0. `<h1>`은 로그인 sr-only 1건 + PageHeader뿐이고 `app/(app)/**/page.tsx` 29개 전부 PageHeader/notFound/redirect 사용. ui·셸·로그인·내 계정·globals·tokens에 TBD/FIXME/XXX 0. **배포본:** deploy #103(f85c9af = 이 HEAD의 코드) staging success, 스테이징 `/login` 200 + Pretendard CSS 로드(검증자 curl 재측정), 로그인 뒤 셸은 사용자 확인 「정상」(사람 항목 2, resolved) |
| 3 | 폰(375px)과 PC에서 같은 셸이 깨지지 않고, 키보드만으로 로그인·내비게이션·비밀번호 변경이 된다 | ✓ VERIFIED | 코드: `app/(app)/layout.tsx` → `roleMenu({roleId, allowedMenus})` → `Shell`, 셸 컴포넌트에 계급 분기 0(`roleId`/`isAdmin` grep 0). **행동 증거:** deploy run #103(main `f85c9afa…`, 이 HEAD와 코드 동일 — 차이는 `.planning/.continue-here.md` 삭제뿐)의 `ci / e2e (1)`·`ci / e2e (2)` 둘 다 **success**(CI=true 프로덕션 빌드 전체 E2E, `gh run view` 재확인; 로그 본문은 프록시가 403이라 건수 미확인). 그 E2E에 keyboard-nav·mobile-shell·tablet-shell·a11y·login-logout·change-password·user-menu·page-chrome·mobile-page-chrome·fonts 스펙이 모두 있고 `test.skip/fixme/only` 0. `33937dd` 이후 이 스펙들에서 지워진 단언 2줄은 문구 개정(§8 명사형)에 따른 교체(`현재 비밀번호 오류 · 다시 입력`, `8자 미만 · 8자 이상으로`)이고, user-menu는 「알림함」 첫 포커스 + ArrowDown 단언이 추가됐다 — 약화 0 |
| 4 | 핵심 컴포넌트 계약(서버 검증 오류 폼·grid·비활성+이유 버튼·알림함·배지·폰 목록·시트)이 SYSTEM.md에 있고, 모든 계약이 5상태를 필수 정의하며 EMPTY·ERROR는 다음 행동을 유도한다 | ✓ VERIFIED (⚠️ 경고 1) | §7-2·§7-15(폼, 다섯 상태 표), §7-3(grid), §7-1(버튼 — 비활성 이유 두 색·aria-disabled, DECISIONS ⑦), §7-12(알림함·배지, 다섯 상태 목록), §6-1/§7-8(폰 목록·시트), §7-7 컴포넌트별 다섯 상태 표 존재. `design-system-docs.test.ts`(§6-7~§7-14 다섯 상태 검사 포함) 통과. EMPTY에 다음 한 수가 없는 `ListEmpty` 6곳은 모두 기록된 예외 또는 권한 규칙: 보관함(DECISIONS 2026-09-21)·알림함(§7-12)·`/leave`와 연차 조정 기록(「다음 한 수는 할 수 있는 사람에게만」 2026-09-26 — `/leave`는 `canWrite`면 `연차 신청` 있음, 조정 기록은 바로 위 조정 폼)·사람 목록 잠김 한 줄(2026-09-30)·공휴일 후보 오류. **경고:** 아래 Anti-Patterns 첫 행 |
| 5 | grid는 동작 계약만 확정(Tab/Enter·방향키, 범위 복사·붙여넣기, Esc, 저장·새 줄 단축키, 전부 저장/전부 거부 + 충돌·오류 칸). 구현 선택은 Phase 4 | ✓ VERIFIED | §7-3에 Shift+Tab·방향키·Esc·Ctrl+C/Ctrl+V·Ctrl+Enter·Ctrl+S·「전부 저장 또는 전부 거부」(2회)·충돌 셀 문장이 있다. 단축키 표기는 ⌘ → Ctrl로 바뀌었으나(D-94, Windows 기준 — 계약 내용 동일) 구현은 Phase 4가 ROADMAP대로 했다 |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts (현재 코드)

| Artifact | Status | Details |
|----------|--------|---------|
| `docs/design/tokens.css` | ✓ VERIFIED | `3c1b015` 이후 무변경, 136개 정의, 앱 CSS 참조 87종 전부 포함 |
| `docs/design/SYSTEM.md` | ✓ VERIFIED | 성공 기준 4·5 절 존재. §7-16·§7-17 신설(경고 참고) |
| `stylelint.config.mjs` | ✓ VERIFIED | 무변경 — font-family·font-size·border-radius 허용 목록, 색 리터럴·색 함수·이름 색·`font` 축약 금지 |
| `app/globals.css` | ✓ VERIFIED | 추가 2블록 모두 토큰/비색 값 |
| `ui/shell/{Shell,TopBar,BottomTabs,MoreSheet}.tsx`·`role-menu.ts` | ✓ WIRED | layout → `roleMenu()` → `Shell` props, 계급 분기 0 |
| `ui/page-header`·`ui/list-empty`·`ui/auth-frame` | ✓ VERIFIED | 모든 앱 페이지가 PageHeader 사용, AuthFrame `--auth-max` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/(app)/layout.tsx` | `ui/shell/Shell.tsx` | `can()` × MENUS → `allowedMenus` → `roleMenu()` 4필드 + `userName` | ✓ WIRED |
| `app/(app)/layout.tsx` | `ui/shell/unread-count.tsx` | `UnreadCountProvider initial/refresh` (실패해도 셸 렌더) | ✓ WIRED |
| `app/layout.tsx` | `app/globals.css` + `tokens.css` | 루트 import(무변경) | ✓ WIRED |
| `package.json` `lint` | `stylelint.config.mjs` | 앱 CSS glob 3종 | ✓ WIRED |

### Behavioral Spot-Checks (직접 실행)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| eslint + stylelint | `pnpm lint` | exit 0 (기존 boundaries v5→v6 이관 경고만) | ✓ PASS |
| 타입 | `pnpm typecheck` | exit 0 | ✓ PASS |
| CSS 변수 전부 tokens.css 정의 | `var(--*)` 87종 ↔ tokens.css `comm -23` | 미정의 0 | ✓ PASS |
| 인라인 색·서체·radius 없음 | `grep -rnE "style=\{\{\|#hex\|rgba?\(\|fontFamily\|borderRadius" ui app` | 실매치 0(주석 1) | ✓ PASS |
| 문서·셸·린트 규칙·컴포넌트 단위 테스트 | `pnpm exec vitest run --project unit` design-system-docs · stylelint-config · ui/{role-menu,current-path,system-md-compliance,single-column,next-turn,next-turn-action,toast-timer,admin-index-link,admin-index-css,grid-keyboard-composing,button,confirm-dialog,pagination,unread-count,logout-copy} | 17 files / 303 tests passed (4.3s) | ✓ PASS |
| 전체 E2E(키보드·375·태블릿 포함) | `gh run view 36807956531` (deploy #103, f85c9af) | ci/quality·integration(1·2)·e2e(1·2)·staging success, production skipped | ✓ PASS (CI) |
| 스테이징 로그인 화면 | `curl https://plant8-staging-67rumhdgba-du.a.run.app/login` | 200, `pretendard/pretendard-dynamic-subset.css` 로드 | ✓ PASS |

전체 E2E는 로컬에서 돌리지 않았다(CLAUDE.md §5 — 전체 E2E는 CI가 한 번).

### Probe Execution

해당 없음 — 이 페이즈 PLAN/SUMMARY가 `scripts/*/tests/probe-*.sh`를 선언하지 않는다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UX-01 | 02-01…02-08 | SYSTEM.md 먼저 확정, 모든 화면이 토큰·컴포넌트만 사용, 계약 5상태 필수, EMPTY·ERROR 다음 행동 | ✓ SATISFIED | 성공 기준 2·4. Phase 3·4·04.x가 더한 화면·컴포넌트 CSS 47파일도 같은 stylelint·토큰 검사를 통과. REQUIREMENTS.md L139 `[x]`, L269 Complete |

고아 요구사항 없음(Phase 2 매핑 ID는 UX-01 하나).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/design/SYSTEM.md` | §7-16·§7-17·§7-7 시트/모달 행 | 신설 컴포넌트 절 §7-16 「페이지 줄」·§7-17 「확인 모달」에 자체 다섯 상태 정의가 없다. §7-17은 §7-8 모달·시트의 구현이라 §7-7 「시트/모달(§7-8)」 행이 다섯 상태를 대신하지만, ERROR 자리가 어긋난다 — §7-7 행은 「사유 칸 아래 「원인 · 다음 행동」」, §7-17은 「서버 거부 문자열은 막힘 자리(행동 줄 왼쪽)」. `design-system-docs.test.ts`의 다섯 상태 검사 범위도 §7-11~§7-14에서 멈춰 §7-15~§7-17을 안 본다 | ⚠️ Warning | Phase 4가 들인 문서 표류다. Phase 2 계약(핵심 계약 존재 + 다섯 상태 정의 + EMPTY·ERROR 다음 행동)을 거짓으로 만들지는 않는다 — 모달·시트의 다섯 상태는 §7-7 표에 있고, 페이지 줄은 §7-9 힌트 줄처럼 표·목록에 딸린 정적 요소이며 EMPTY(한 페이지면 줄 없음)는 정의돼 있다. 정리 제안: §7-7 시트/모달 행 ERROR를 §7-17 막힘 자리로 맞추고(DECISIONS 기록 뒤), 다섯 상태 테스트 범위에 §7-15~§7-17 추가 |
| `ui/shell/TopBar.module.css` | 포커스 링 | 상단 바 포커스 링 위아래 잘림 | ⚠️ Warning (이월) | TODOS.md L271 「상단 바 포커스 링이 위아래로 잘린다」에 이연된 그대로. 좌우 변이 보여 성공 기준 3을 거짓으로 만들지 않는다 |
| `app/(app)/leave/[id]/document-actions.tsx` | 138 | `style={… { height: barHeight } …}` 인라인 높이 | ℹ️ Info | 간격·크기 값 — D-20 금지 범위(색·서체·radius) 밖 |
| `docs/design/SKIN-EXPLORE.md`·`explore-skin/` | — | 스킨 리프레시 발산(radius 0·그림자·2px 선 뒤집기 후보) | ℹ️ Info | 「확정이 아니다」, tokens.css·SYSTEM.md 미적용, 앱에서 import 0. 적용 시 DECISIONS → SYSTEM → tokens 순서를 따라야 한다 |
| origin/main `bada253` | — | 이 검증 뒤 main에 PR #111(`ui/button/Button.module.css` 3차 밑줄·관리표 행 행동 간격)이 들어왔다 | ℹ️ Info | 이 HEAD(f85c9af 기반)에는 없다 — 병합 후 CI stylelint가 같은 규칙으로 검사한다 |

부채 표지(TBD/FIXME/XXX): ui·셸·로그인·내 계정·globals·tokens에 0건.

### Human Verification

사람 항목 2건 모두 **해소**(frontmatter `human_verification[].status: resolved`).

1. **SYSTEM.md 신설 절의 결정 출처** — 사용자 판정 2026-10-01 「사람이 정한 결정 맞음」.
2. **배포본 확인** — deploy #103(f85c9af) staging success, `/login` 200 + Pretendard(검증자 재측정), 로그인 뒤 셸·/admin·/admin/permissions는 사용자가 시스템 관리자로 확인 「둘 다 정상」. Claude는 자격 증명 사용이 막혀 로그인 화면 이후를 직접 보지 못했다 — 그 부분은 사용자 관찰이 근거다.

### Gaps Summary

성공 기준을 거스르는 갭은 없다. 이후 페이즈가 SYSTEM.md(+280줄)·DECISIONS.md(+633줄)·셸(알림 배지·계정 그룹)·화면을 크게 늘렸지만 (a) tokens.css는 이전 판정 이후 한 바이트도 바뀌지 않았고, (b) 앱 CSS 47파일이 stylelint를 통과하며 tokens.css에 정의된 변수만 참조하고, (c) 셸은 여전히 권한표 계산(`roleMenu`) 결과만 그리며, (d) SYSTEM.md 변경마다 DECISIONS.md 기록이 있고 사용자가 출처를 승인했으며, (e) 키보드·375·태블릿 셸 E2E를 포함한 전체 E2E가 이 코드와 같은 main 커밋의 CI에서 통과했고 배포본도 확인됐다. 남은 것은 경고 2건(§7-16·§7-17 다섯 상태 문서 표류, 상단 바 포커스 링 이연)으로 Phase 2 계약을 깨지 않는다.

---

## 이력 — 이전 판정 기록

### 2026-10-01T03:40Z 페이즈 종료 재검증 (passed 5/5) — 이 보고서

stale 사유: 33937dd 이후 Phase 3·4·04.1~04.4·quick 작업이 covered_files(SYSTEM.md·DECISIONS.md·globals.css·셸·login-error.ts·E2E 스펙)를 바꿈. 현재 HEAD `aa5464e`에서 다섯 기준을 다시 확인했다. tokens.css 무변경, `pnpm lint`·`typecheck` exit 0, 관련 단위 17파일 303건 통과, CI(deploy #103) 전체 E2E success. 사람 항목 2건은 사용자가 2026-10-01 해소. 새로 찾은 경고: §7-16·§7-17 다섯 상태 문서 표류.

### 2026-09-24T09:42:24Z stale 재검증 (human_needed 5/5)

HEAD `2d7f73e`. /design-review FINDING-001~005·/qa ISSUE-001 수정분(워드마크 홈 링크, 상단 바 hover, /account 로그아웃 묶음, EMPTY 링크 밑줄)이 토큰만 쓰고 stylelint를 통과함을 확인했다. 로컬 게이트 CI=true E2E 176 passed(0 failed·0 flaky), unit 743·integration 1027 통과. 그 전 재검증(3c1b015)에서는 `--auth-max` 신설(간격, DECISIONS 2026-09-22)과 §6-10·§7-13~§7-15 신설 절의 다섯 상태를 확인, E2E 165 통과. 사람 항목 2건(결정 출처 · 배포본)이 남아 human_needed였다 — 2026-10-01 해소. 전문은 `git show 33937dd:.planning/phases/02-design-system-app-shell/02-VERIFICATION.md`.

### 2026-09-19T18:53:19Z 첫 검증 (gaps_found 4/5)

성공 기준 2가 부분 실패였다. 컴포넌트 층은 토큰만 썼지만 페이지 층(body·§4-4 표면·화면 제목·로그인 실패 문구·시스템 상태 dl)이 UA 기본값으로 렌더됐다. 전문은 `git show 25aaa4f:.planning/phases/02-design-system-app-shell/02-VERIFICATION.md`.

### 2026-09-19T22:45:00Z 재검증 (human_needed 5/5)

02-08(갭 해소)로 성공 기준 2 갭을 닫았다. page-chrome·mobile-page-chrome 17건과 기존 E2E 30건, unit 291건, build를 직접 돌렸다. 전문은 `git show dd8dd81:.planning/phases/02-design-system-app-shell/02-VERIFICATION.md`.

### Re-verification 2026-09-22 — human_verification 9건 재검토

사람 판정 9건을 다시 읽고 "정말 사람 손이 필요한가"를 판정했다. 결과: 이미 해소 3건, 자동화로 닫음 4건, 사람 2건(2026-10-01 해소).

| # | 항목 | 결과 | 근거 |
|---|------|------|------|
| 1 | Windows Pretendard·전송량·tnum (D-32) | 자동화로 닫음 | Pretendard는 자체 호스팅 웹폰트라 OS와 무관하다. `test/e2e/fonts.spec.ts`가 `document.fonts.check`·body font-family·첫 로드 woff2 합 ≤ 300KB·tnum 등폭(1 vs 0 자릿수 폭)을 실측. CI=true 통과 |
| 2 | 태블릿 700·900·1023 | 자동화로 닫음 | `test/e2e/tablet-shell.spec.ts` — 세 폭에서 주 메뉴 5개 가시·하단 탭 숨김·가로 스크롤 0, 699에서 하단 탭 4개로 전환 |
| 3 | 375 시각 품질 | 자동화로 닫음 | 독립 에이전트가 CI=true 프로덕션 빌드로 7개 화면 DOM 실측: 겹침·잘림·오버플로 0건(더보기 시트의 겹침 9쌍은 `::backdrop` 스크림 뒤 오탐). §10 터치 목표 44 미달은 별도 윈도우로 등록 |
| 4 | /design-review + /qa | 남음 → 2026-09-24 해소 | /design-review·/qa가 실제로 호출돼 FINDING-001~005·ISSUE-001을 고치고 나머지를 TODOS.md에 이연했다 |
| 5 | 「내 차례」 폰 두 줄 | 자동화로 닫음 + **결함 발견·수정** | `test/e2e/mobile-next-turn.spec.ts`가 실제 컴포넌트를 esbuild로 SSR해 375px에서 실측. 원래 grid(auto 1fr auto)는 자동 배치가 행동 링크를 2행으로 밀어 §7-4 "1행 태그·대상·행동, 2행 금액·이유"와 달랐다(preview.html 실물도 동일). 행·칸을 명시해 고쳤고 행동 링크 터치 목표 44도 확보 |
| 6 | 금지 조항 27건 판정 | 독립 재판정 완료 | Fable 리뷰어가 파일:줄 근거로 30건 전수(27은 오기: 24+6) — 위반 0, 판정불가 1(02-01 ①, 사람 → 2026-10-01 사용자 승인) |
| 7 | §7-12 EMPTY 예외 | 이미 해소 | DECISIONS.md 2026-09-20 사용자 승인 기록 |
| 8 | `--fs-2xl` §2-2 vs §6-9 | 이미 결정 | DECISIONS.md 2026-09-20 "KPI 타일까지 미룸", WINDOWS #7 |
| 9 | 로그인 실패 영문 문구 | 이미 해소 | 커밋 9c6c5aa, `app/(auth)/login/login-error.ts`, WINDOWS #6 fixed |

---

_Verified: 2026-10-01T03:40:00Z_
_Verifier: Claude (gsd-verifier) — 페이즈 종료 stale 재검증_
