---
phase: 02-design-system-app-shell
plan: 07
subsystem: testing
tags: [playwright, axe-core, accessibility, e2e, keyboard-navigation, mobile-viewport]

requires:
  - phase: 02-design-system-app-shell
    provides: "02-01~02-06이 만든 ui/ 9개 컴포넌트와 12개 라우트 — 이 플랜은 새 화면을 만들지 않고 그것들을 자동 검사로 고정한다"
provides:
  - "폰 375 뷰포트 전용 Playwright 프로젝트(mobile-375)와 데스크톱 프로젝트 분리, 파일명 접두어(mobile-*.spec.ts) 하나로 등록 구분"
  - "test/e2e/mobile-shell.spec.ts — 하단 탭 4개·더보기 시트·터치 목표 44·계정 그룹 대조 등 9개 테스트"
  - "test/e2e/keyboard-nav.spec.ts — 마우스 클릭 0개로 로그인·내비게이션·비밀번호 변경 3동선 + 포커스 규칙 7개 테스트"
  - "test/e2e/a11y.spec.ts — axe-core로 6화면 접근성 계약 검사 + 필드 오류 aria 연결 검사, 8개 테스트"
  - "@axe-core/playwright@4.13.0 devDependency(사용자 승인, 버전 고정)"
affects: [03-permissions-and-registries, 04-money-model, ui-review, security-review]

actuals:
  tokens: 7788
  tasks: 3
  commits: 2

tech-stack:
  added: ["@axe-core/playwright@4.13.0"]
  patterns:
    - "Playwright 프로젝트 분리는 testMatch/testIgnore 파일명 접두어 하나로 결정한다 — 새 폰 전용 스펙은 이름만 mobile-*.spec.ts로 지으면 자동 등록된다"
    - "터치 목표(44px) 같은 뷰포트 종속 §10 항목은 해당 뷰포트가 도는 프로젝트의 스펙 파일에만 둔다 — 다른 파일에 두면 그 프로젝트에서 한 번도 판정되지 않는다"
    - "E2E 전용 env override(RATE_LIMIT_LOGIN_MAX 등)는 playwright.config.ts 상단에 process.env.X ??= 형태로만 추가한다 — webServer.env 블록 자체는 건드리지 않아도 process.env가 그대로 상속된다"

key-files:
  created:
    - test/e2e/mobile-shell.spec.ts
    - test/e2e/keyboard-nav.spec.ts
    - test/e2e/a11y.spec.ts
  modified:
    - playwright.config.ts
    - package.json
    - pnpm-lock.yaml
    - ui/shell/BottomTabs.module.css
    - next.config.ts
    - app/globals.css
    - "app/(auth)/login/page.tsx"

key-decisions:
  - "체크포인트(사용자, 2026-09-19): @axe-core/playwright@4.13.0을 devDependency로 승인 — 캐럿 없이 정확히 고정, 개발 의존성이라 Cloud Run 이미지에 영향 없음, 남은 9개 페이즈의 새 화면이 같은 검사를 자동으로 물려받는다는 근거로 '보류' 대신 채택됨"
  - "§6-0 (a) PC 사용자 진입점은 G①(작은 메뉴가 열린다)로 이미 확정되어 있어 키보드 비밀번호 변경 동선은 그 형태 하나에만 대응한다 — 메뉴가 열리길 기다리는 단계와 Esc/포커스 복귀 단언 포함"
  - "picnic Rule 1: 로그인 화면의 axe page-has-heading-one 위반을 규칙 비활성 대신 화면 수정으로 해소 — 02-03이 워드마크와 중복이라 뺀 '시각적' h1(STATE.md 결정)과 axe가 요구하는 '접근성 트리의' h1은 다른 문제라 스크린 리더 전용 h1(.sr-only)을 되살렸다"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "폰 375 뷰포트에서 셸(하단 탭 4개·더보기 시트·터치 목표 44·계정 그룹·가로 스크롤 없음)이 계약대로 동작하는 것이 자동 검사로 고정됨"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-shell.spec.ts (9 tests, mobile-375 project)"
        status: pass
    human_judgment: false
  - id: D2
    description: "데스크톱·폰 375 Playwright 프로젝트 분리, 기존 3개 스펙이 폰 프로젝트에 중복 등록되지 않음"
    requirement: UX-01
    verification:
      - kind: other
        ref: "pnpm exec playwright test --list (15개 등록, desktop 6 / mobile-375 9, 중복 없음)"
        status: pass
    human_judgment: false
  - id: D3
    description: "마우스 클릭 없이 키보드만으로 로그인·내비게이션·비밀번호 변경 3동선과 포커스 규칙(첫 Tab=스킵 링크, 순서=시각 순서, Esc/포커스 복귀)이 성립"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/keyboard-nav.spec.ts (7 tests, desktop project)"
        status: pass
      - kind: other
        ref: "node -e 스크립트 — 파일 내 마우스 클릭 호출 0개 확인"
        status: pass
    human_judgment: false
  - id: D4
    description: "SYSTEM.md §10 접근성 계약이 axe-core 규칙 엔진으로 6화면(로그인·홈·내 계정·빈 목록·시스템 상태·404)에서 회귀 검사를 받음, 규칙 비활성·대상 제외 0개"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/a11y.spec.ts (8 tests, desktop project)"
        status: pass
    human_judgment: false
  - id: D5
    description: "필드 서버 검증 오류의 aria-invalid·aria-describedby 배선이 실제 브라우저 실행으로 검사됨(02-03 TextField.tsx 계약)"
    requirement: UX-01
    verification:
      - kind: e2e
        ref: "test/e2e/a11y.spec.ts › 필드 서버 검증 오류가 aria-invalid·aria-describedby로 실제 오류 요소에 연결된다"
        status: pass
    human_judgment: false
  - id: D6
    description: "Windows Chrome/Edge에서 Pretendard 실제 적용·자릿수 정렬·서체 전송량(200-300KB) 사람 검수"
    verification: []
    human_judgment: true
    rationale: "리눅스 컨테이너에는 Windows 폰트 스택이 없어 렌더된 서체 이름·자릿수 정렬을 자동 판정할 방법이 없다(D-32, 계획에 명시된 human-check)"
  - id: D7
    description: "/design-review + /qa — SYSTEM.md 일관성과 실제 브라우저 QA"
    verification: []
    human_judgment: true
    rationale: "CLAUDE.md 프론트엔드 규칙의 'UI 완료 판정'은 이 두 리뷰를 요구하고 자동 검사가 대신하지 못한다(계획에 명시된 human-check)"

duration: 55min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 07: 폰 375·키보드 전용·axe-core 접근성 자동 검증 Summary

**Playwright를 데스크톱/폰 375 두 프로젝트로 나누고, 마우스 없는 3동선과 axe-core 6화면 접근성 계약을 자동 검사로 고정했다 — @axe-core/playwright@4.13.0을 사용자 승인 받아 도입.**

## Performance

- **Duration:** 55 min (체크포인트 대기 포함 세션 기준. 실행 재개 이후 순수 작업은 약 50분)
- **Started:** 2026-09-19T17:34:00Z (체크포인트 해소 재개 시점)
- **Completed:** 2026-09-19T18:00:00Z
- **Tasks:** 3 (Task 1 checkpoint:decision — 승인 / Task 2 / Task 3)
- **Files modified:** 10 (신규 3 + 수정 7)

## Accomplishments
- Playwright `desktop` / `mobile-375` 두 프로젝트를 파일명 접두어(`mobile-*.spec.ts`) 하나로 분리 — 기존 3개 스펙이 폰 프로젝트에 중복 등록되지 않음(`--list`로 확인)
- `test/e2e/mobile-shell.spec.ts`(9개 테스트): 하단 탭 4개·마지막 더보기, 상단 바 1차 메뉴 숨김, 가로 스크롤 없음(실제로 폭 넘는 요소를 넣어 실패를 확인한 뒤 되돌림), 더보기 시트 열림·첫 포커스·Esc 복귀, 터치 목표 44(§10 유일 판정 지점), 계정 그룹 항목을 `role-menu.ts`에서 읽어 대조(이름 미하드코딩), 로그인 화면엔 하단 탭 없음
- `test/e2e/keyboard-nav.spec.ts`(7개 테스트): 마우스 클릭 0개로 로그인(Tab×2+Enter)·내비게이션(Tab+Enter)·비밀번호 변경(§6-0 (a) G① 형태 — 메뉴 열기 대기 + Esc/포커스 복귀) 3동선, 스킵 링크 첫 Tab·포커스 전 숨김·Enter로 본문 포커스, 요소 Tab 순서 고정
- `test/e2e/a11y.spec.ts`(8개 테스트): 로그인·홈·내 계정·빈 목록(프로젝트)·시스템 상태·404 여섯 화면(배열 원소 수 단언 포함)을 axe-core 기본 규칙 전체로 검사(규칙 비활성·대상 제외 0개), 필드 오류 aria-invalid/aria-describedby 연결을 별도 테스트로 확인
- 실측으로 드러난 실제 버그 하나를 고쳤다: `BottomTabs.module.css`의 하단 탭 컨테이너가 `box-sizing: border-box` 아래 `border-top` 때문에 탭 항목 실제 높이가 44가 아니라 42였다

## Task Commits

1. **Task 1: 접근성 자동 판정 도구 승인 여부** — 체크포인트만(파일 변경 없음), 사용자 「승인」으로 해소
2. **Task 2: 폰 375 뷰포트 프로젝트와 셸 검증** - `ac8aa50` (test)
3. **Task 3: 키보드 전용 동선과 접근성 계약 검증** - `7e8e987` (test)

**Plan metadata:** (이 커밋 다음에 기록)

## Files Created/Modified
- `test/e2e/mobile-shell.spec.ts` - 폰 375 셸 계약 9개 테스트
- `test/e2e/keyboard-nav.spec.ts` - 키보드 전용 3동선 + 포커스 규칙 7개 테스트
- `test/e2e/a11y.spec.ts` - axe-core 6화면 접근성 계약 + 필드 오류 aria 연결 8개 테스트
- `playwright.config.ts` - desktop/mobile-375 프로젝트 추가, E2E 전용 `RATE_LIMIT_LOGIN_MAX` 상향
- `package.json` / `pnpm-lock.yaml` - `@axe-core/playwright@4.13.0` devDependency(정확히 고정)
- `ui/shell/BottomTabs.module.css` - 하단 탭 컨테이너 높이 보정(border-box 아래 터치 목표 44 유지)
- `next.config.ts` - `devIndicators: false`(dev 전용 오버레이가 첫 Tab을 가로채는 문제 해소)
- `app/globals.css` - `.sr-only` 유틸리티 추가
- `app/(auth)/login/page.tsx` - 스크린 리더 전용 `<h1>` 추가(axe `page-has-heading-one` 해소)

## Decisions Made
- 체크포인트: `@axe-core/playwright@4.13.0` 승인(캐럿 없이 정확히 고정) — 이유: 개발 의존성이라 배포 이미지 영향 없음, 남은 9개 페이즈가 같은 검사를 물려받음. 「보류」는 수동→axe 전환 시 검사가 겹치는 문제로 기각
- §6-0 (a) G①(작은 메뉴) 형태 하나에만 대응하는 키보드 스펙 작성 — ②·③ 분기를 만들지 않음(구현이 ①이므로)
- 터치 목표 44 단언은 `mobile-shell.spec.ts`에만 둠(파일명 접두어 규칙상 그곳만 폰 프로젝트에서 돎), `a11y.spec.ts`에는 그 이유를 주석으로만 남김

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 하단 탭 터치 목표가 44가 아니라 42였다**
- **Found during:** Task 2 실측(`mobile-shell.spec.ts` 첫 실행)
- **Issue:** `app/globals.css`의 전역 `box-sizing: border-box` 아래, `.tabs`의 `height: var(--touch-min)`(44)에 `border-top: 2px`가 포함되어 flex 자식(`.tab`)이 채우는 콘텐츠 박스 높이가 42px로 줄어듦
- **Fix:** `.tabs` 높이를 `calc(var(--touch-min) + var(--line-w-strong))`(46px)로 보정 — 콘텐츠 영역이 정확히 44 유지
- **Files modified:** `ui/shell/BottomTabs.module.css`
- **Verification:** `mobile-shell.spec.ts`의 터치 목표 테스트가 44 이상을 통과
- **Committed in:** `ac8aa50`

**2. [Rule 3 - Blocking] 픽스처 로그인 폭증이 프로덕션 로그인 rate limit(10/60초)에 스위트 전체를 걸리게 함**
- **Found during:** Task 2 첫 전체 실행(`pnpm playwright test`) — 6개 테스트가 로그인 단계에서 타임아웃
- **Issue:** `lib/auth.ts`의 `/sign-in/email` 커스텀 rate limit(기본 10/60초)가 모든 E2E 테스트가 공유하는 루프백 IP 기준이라, 새 스펙들이 더한 로그인 수가 누적되어 한도를 넘음
- **Fix:** `playwright.config.ts` 상단에 `process.env.RATE_LIMIT_LOGIN_MAX ??= "1000"` 추가(E2E 전용, `webServer.env` 블록 자체는 불변 — process.env가 그대로 상속됨)
- **Files modified:** `playwright.config.ts`
- **Verification:** 전체 스위트 30개 테스트 통과
- **Committed in:** `ac8aa50`

**3. [Rule 3 - Blocking] Next dev 전용 `<nextjs-portal>` 오버레이가 첫 Tab을 가로챔**
- **Found during:** Task 3 `keyboard-nav.spec.ts` 작성 중 실측(probe 스펙으로 확인 후 삭제)
- **Issue:** `pnpm dev`(webServer가 로컬에서 쓰는 명령)로 뜬 서버는 Next 16의 dev 인디케이터 오버레이(`<nextjs-portal>`)를 문서에 삽입하고, 이것이 페이지 로드 뒤 첫 Tab을 스킵 링크보다 먼저 받아 §10 "첫 Tab = 스킵 링크" 계약을 검사할 수 없었다. 프로덕션 빌드(webServer가 CI에서 쓰는 `build && start`)에는 이 오버레이 자체가 없다
- **Fix:** `next.config.ts`에 공식 지원 옵션 `devIndicators: false` 추가 — dev 모드 표시만 끄고 런타임 동작·프로덕션 빌드는 불변
- **Files modified:** `next.config.ts`
- **Verification:** `keyboard-nav.spec.ts`의 스킵 링크 관련 테스트 전부 통과
- **Committed in:** `7e8e987`

**4. [Rule 1 - Bug] 로그인 화면이 axe `page-has-heading-one`(best-practice)을 위반**
- **Found during:** Task 3 `a11y.spec.ts` 첫 실행
- **Issue:** 02-03이 워드마크(PLANT8)와 중복이라 시각적 `<h1>「로그인」`을 뺐다(STATE.md 결정) — 그런데 이 결정은 "화면에 보이는" 중복 제거였지, 접근성 트리에 페이지 제목 랜드마크가 아예 없어도 된다는 뜻은 아니었다. axe가 레벨 1 헤딩 부재를 위반으로 잡음
- **Fix:** 규칙을 끄는 대신 화면을 고쳤다 — `app/globals.css`에 표준 `.sr-only` 유틸리티(위치·클립으로 시각적으로만 숨김)를 추가하고 `app/(auth)/login/page.tsx`에 스크린 리더 전용 `<h1>로그인</h1>`을 되살렸다. 시각 디자인은 완전히 불변(워드마크만 보임)
- **Files modified:** `app/globals.css`, `app/(auth)/login/page.tsx`
- **Verification:** `a11y.spec.ts`의 로그인 화면 axe 검사 통과, 시각 스크린샷 없음(이 페이즈는 픽셀 비교 미도입)
- **Committed in:** `7e8e987`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 버그, 2 Rule 3 블로킹)
**Impact on plan:** 전부 테스트가 실제로 검사하도록 만들기 위한 수정이었다(테스트 인프라 3건 + 진짜 접근성 버그 1건). 계획 범위를 벗어난 기능 추가는 없음.

## Issues Encountered
None — 위 4건은 "Deviations from Plan"에 이미 기록됨.

## User Setup Required
None - no external service configuration required.

## 성공 기준 3 — 자동 검증 vs 사람 판단 (정직한 구분)

이 구분은 페이즈 검증 단계가 그대로 사용한다.

**자동 검증으로 증명됨:**
- 폰 375px에서 셸이 깨지지 않음(하단 탭 4개·상단 메뉴 숨김·가로 스크롤 없음) — `mobile-shell.spec.ts`
- 「더보기」 시트 Esc 닫힘·포커스 복귀 — `mobile-shell.spec.ts`(폰) + `keyboard-nav.spec.ts`(PC 사용자 메뉴, 같은 결의 상호작용)
- 마우스 없이 로그인·내비게이션·비밀번호 변경 완주 — `keyboard-nav.spec.ts`(마우스 클릭 호출 0개를 별도 스크립트로 확인)
- 터치 목표 44 — `mobile-shell.spec.ts`(렌더된 실제 경계 상자로 측정, CSS 선언이 아니라 실측)
- §10 접근성 계약 6화면 axe 검사, 필드 오류 ARIA 연결 — `a11y.spec.ts`

**사람 판단으로 남음(이 환경엔 브라우저 렌더링·스크린샷 도구가 없음):**
- Windows Chrome/Edge에서 Pretendard 실제 렌더링·자릿수 정렬·서체 전송량(200–300KB) — D-32, 리눅스 컨테이너에 Windows 폰트 스택 없음
- `/design-review`·`/qa` — SYSTEM.md 시각 일관성과 실제 브라우저 QA는 자동 판정 불가

**앞선 플랜이 남긴 사람 판단 항목 중 이번에 자동으로 닫힌 것:**
- PC 사용자 메뉴 키보드 동작(열기·Tab·Enter·Esc·포커스 복귀) → `keyboard-nav.spec.ts`로 닫힘
- 시트 포커스 트랩·Esc·복귀(폰 「더보기」) → `mobile-shell.spec.ts`로 닫힘
- 375px 구조·동작(레이아웃 구조·터치 목표) → `mobile-shell.spec.ts`로 닫힘. **단, 375px 시각적 미감(간격·정렬이 "보기 좋은가")은 여전히 사람 판단 — 자동 검사는 구조·수치만 본다**

## Next Phase Readiness

- UX-01은 `requirements.ready-ids`에서 ready로 확인된 뒤 `mark-complete`로 반영됨(이 페이즈의 마지막 공유 선언 plan)
- Phase 2(디자인 시스템·앱 셸)의 7개 플랜이 모두 완료됨 — `/gsd-verify-work 02` 및 남은 사람 검수(Pretendard·design-review·qa)로 이어감
- Phase 3(권한 핵심·설정 레지스트리·보관함·행동 로그)이 이 셸·컴포넌트 계약 위에서 시작할 수 있음

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: test/e2e/mobile-shell.spec.ts
- FOUND: test/e2e/keyboard-nav.spec.ts
- FOUND: test/e2e/a11y.spec.ts
- FOUND: .planning/phases/02-design-system-app-shell/02-07-SUMMARY.md
- FOUND commit: ac8aa50 (Task 2)
- FOUND commit: 7e8e987 (Task 3)
- Re-ran plan-level `<verification>`: `pnpm exec playwright test` → 30 passed; `pnpm lint` → 0 errors; `pnpm typecheck` → 0 errors; `pnpm test:unit` → 272 passed; keyboard-nav mouse-click check → `ok`; axe rule-disable/scope-exclusion grep → none found
- `requirements.ready-ids` reported UX-01 ready → `requirements.mark-complete UX-01` applied (checkbox + traceability)
