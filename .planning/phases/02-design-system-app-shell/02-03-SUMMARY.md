---
phase: 02-design-system-app-shell
plan: 03
subsystem: ui
tags: [design-system, tokens, pretendard, react, css-modules, auth]

requires:
  - phase: 02-design-system-app-shell
    provides: "02-01(SYSTEM.md §6-7·§7-1·§7-2 계약 확정, --on-accent-weak 토큰) · 02-02(ui boundaries 타입, stylelint 색·서체·radius 리터럴 금지, Docker/CI가 docs/design/tokens.css를 통과시키는 배선)"
provides:
  - "public/fonts/pretendard/ — 자체 호스팅 92분할 동적 서브셋 woff2(3.1MB) + LICENSE.txt, npm 의존성 아님(D-32)"
  - "app/layout.tsx가 docs/design/tokens.css를 직접 import(D-21)하고 서체 link를 서빙, metadata·SessionRefresh 보존"
  - "ui/button/Button.tsx — §7-1 버튼 위계 3종 + 진행 중 상태 + 비활성 사유, kbd 토큰 배선"
  - "ui/input/TextField.tsx — §7-2 입력 + 서버 검증 오류 한 줄, next-safe-action 필드 오류 문자열을 그대로 받는 error prop"
  - "ui/auth-frame/AuthFrame.tsx — §6-7 셸 없는 로그인 화면 골격"
  - "로그인 화면 전체가 위 셋을 통해 렌더되고 Phase 1의 모든 로그인 동작이 살아 있다"
affects: [02-04, 02-05, 02-06, 02-07]

actuals:
  tokens: 3607
  tasks: 3
  commits: 3
plan_head_before: 62879b5cc0d74a6c6f86333a60852fc76f3dd103

tech-stack:
  added: []
  patterns:
    - "ui/ 컴포넌트는 CSS Module + tokens.css var() 참조만 쓴다(색·서체·radius 리터럴 0개, stylelint가 강제) — Button·TextField·AuthFrame 셋 모두 이 규칙으로 검증됨"
    - "1차 버튼 위 kbd 테두리처럼 tokens.css에 대응 토큰이 있는 예외는 CSS Module에서 그 토큰을 그대로 참조한다(체크포인트에서 사람이 이미 값을 정했다는 전제)"
    - "next-safe-action의 validationErrors 필드 오류 문자열을 ui/input/TextField의 error prop에 직접 연결하는 배선 — 02-06이 내 계정 폼에서 재사용할 표준 패턴"

key-files:
  created:
    - public/fonts/pretendard/LICENSE.txt
    - public/fonts/pretendard/pretendard-dynamic-subset.css
    - public/fonts/pretendard/woff2-dynamic-subset/ (92개)
    - ui/button/Button.tsx
    - ui/button/Button.module.css
    - ui/input/TextField.tsx
    - ui/input/TextField.module.css
    - ui/auth-frame/AuthFrame.tsx
    - ui/auth-frame/AuthFrame.module.css
  modified:
    - app/layout.tsx
    - app/globals.css
    - app/(auth)/login/login-form.tsx
    - app/(auth)/login/page.tsx

key-decisions:
  - "AuthFrame 최대 폭은 새 값을 만들지 않고 tokens.css의 기존 --modal-w(480) 토큰을 재사용했다 — SYSTEM.md §6-7 다이어그램의 「최대 폭 360」은 ASCII 목업의 근사치이고, 로그인 폼은 --form-max(720, 다항목 업무 폼)보다 --modal-w처럼 단일 목적의 좁은 컨테이너에 더 가깝다"
  - "§6-7 다이어그램에 없는 기존 h1 「로그인」 타이틀을 제거했다 — 워드마크(PLANT8)가 그 자리를 대신하고, 어떤 E2E도 그 텍스트에 의존하지 않는다"
  - "app/layout.tsx의 수동 <link> 서체 스타일시트에 eslint-disable-next-line(@next/next/no-css-tags)을 붙였다 — next/font는 92분할 동적 서브셋 + unicode-range 구조를 옮길 수 없어 수동 link가 D-32의 확정 절차다(경고 0개 유지 관례를 따름, 02-02 선례)"
  - "체크포인트 항목 I②(1차 버튼 위 kbd 테두리 = --on-accent-weak)를 Button.module.css에 그대로 반영 — 새 색을 고르지 않았다"

patterns-established:
  - "ui/ 컴포넌트 파일 쌍(Component.tsx + Component.module.css) 관례를 Button·TextField·AuthFrame 셋으로 확립 — 이후 플랜(02-04~07)이 같은 구조를 따른다"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "서체·토큰·Button 컴포넌트가 로그인 화면 한 경로로 끝까지 배선되고 pnpm build가 app/ 밖 CSS import를 실제로 번들한다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts (3 tests)"
        status: pass
      - kind: other
        ref: "pnpm build"
        status: pass
      - kind: other
        ref: "node -e 서체 @font-face url 해석 검증 스크립트(Task 1 <verify>)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ui/input/TextField가 §7-2·§10 계약대로 서버 검증 오류를 렌더하고 로그인 폼이 그것을 쓴다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts (라벨↔id 연결 실행 검사)"
        status: pass
      - kind: other
        ref: "grep 정적 검사(aria-invalid/aria-describedby 존재, 조건부 렌더, 색 리터럴 0개)"
        status: pass
    human_judgment: true
    rationale: "behavior 6개 중 라벨↔id 연결만 이 플랜에서 실행 검사된다. 오류 줄 렌더는 wave 5의 02-06(change-password E2E), aria-invalid/describedby 연결은 wave 6의 02-07(a11y 스펙)이 실행 검사한다. 입력값 보존·오류 없을 때 오류 줄 부재·자리표시자 규칙 셋은 이 페이즈에 실행 검사가 없다(DOM 렌더 테스트 도구가 D-20 승인 범위 밖 신규 의존성) — 정적 검사만 존재하므로 사람 확인으로 남긴다"
  - id: D3
    description: "로그인 화면이 SYSTEM.md §6-7 템플릿대로 셸 없이 렌더되고 Phase 1의 로그인 동작(자격 호출·실패 문구·비밀번호 변경 복귀 안내)이 모두 살아 있다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts + test/e2e/change-password.spec.ts (스펙 파일 무수정, 4 tests)"
        status: pass
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (29 tests)"
        status: pass
    human_judgment: true
    rationale: "§6-7이 요구하는 5개 자리(실패 문구·잠금 안내·비밀번호 변경 복귀·임시 비밀번호 배너·세션 만료) 중 구현·계약 대응은 정적으로 확인했지만, 폰 375에서 가로 스크롤 없음·워드마크 가운데 정렬 같은 시각적 성립 여부는 스크린샷/브라우저 확인 없이는 자동 판정할 수 없다"
  - id: D4
    description: "Windows Chrome/Edge에서 Pretendard가 맑은 고딕 폴백 대비 표 자릿수를 정렬시키고 첫 로드 전송량이 200–300KB 안에 든다"
    verification: []
    human_judgment: true
    rationale: "must_haves의 backstop 항목(플랫폼별 폰트 렌더링·네트워크 전송량 실측) — 이 실행 환경에는 Windows 브라우저가 없어 자동 검증 불가. 파일 존재·해석(D1)까지만 이 플랜에서 증명했다"

duration: 19min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 3: 로그인 한 경로 배선 Summary

**Pretendard 서체 자산(92분할 동적 서브셋)과 tokens.css 직접 import를 배선하고, ui/button·ui/input·ui/auth-frame 세 컴포넌트를 신설해 로그인 화면 전체를 SYSTEM.md §6-7/§7-1/§7-2 계약대로 재구성 — Phase 1의 로그인 동작·E2E 전부 무수정 통과**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-19T15:48:00Z (근사)
- **Completed:** 2026-09-19T16:07:20Z
- **Tasks:** 3
- **Files modified:** 13 (4 modified, 9 created — 폰트 92개 파일 포함 시 101)

## Accomplishments

- `public/fonts/pretendard/`에 pretendard@1.3.9 tarball에서 파일만 복사(92개 woff2 · 3.1MB · OFL 라이선스) — npm 의존성으로 넣지 않았다(D-32)
- `app/layout.tsx`가 `docs/design/tokens.css`를 상대 경로로 직접 import하고(D-21) `<head>`에 서체 스타일시트 link를 추가, `metadata` export와 `<SessionRefresh />` 마운트는 그대로 보존
- `app/globals.css`에 `body { font-family: var(--font-sans) }` 한 줄만 추가, 기존 box-sizing 리셋은 그대로 둠
- `ui/button/Button.tsx` 신설 — §7-1 버튼 위계 3종(1차·2차·3차), 진행 중 상태(라벨 뒤 `…`, 스피너 없음), 비활성 사유 표시, 1차 버튼 위 kbd 테두리는 체크포인트 I② 확정값 `var(--on-accent-weak)` 참조. CSS Module 색 리터럴 0개
- `ui/input/TextField.tsx` 신설 — §7-2·§10 계약대로 라벨↔id 연결, 서버 검증 오류(`aria-invalid`·`aria-describedby`), 오류 없으면 오류 줄 미렌더, 금액 입력용 `numeric` variant는 열어두되 이 페이즈에서는 쓰지 않음
- `ui/auth-frame/AuthFrame.tsx` 신설 — §6-7 셸 없는 화면 골격(워드마크 + 자식). 로그인 화면이 상단 바·하단 탭·「더보기」 시트 없이 렌더됨을 정적 검사로 확인
- `login-form.tsx`(제출 버튼 → Button, 입력 두 개 → TextField) · `page.tsx`(AuthFrame 재구성)가 자격 호출·실패 문구(이메일/비밀번호 비구분)·성공 시 이동·비밀번호 변경 복귀 안내를 전부 보존
- 세션 만료 안내는 이 페이즈가 만들지 않는다(체크포인트 F-2①) — `lib/viewer.ts`는 무변경(`git diff --stat` 빈 출력으로 확인)
- 로그인·비밀번호 변경 E2E 두 스펙이 **스펙 파일 수정 없이** 모두 통과(4 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: 토큰·서체·첫 컴포넌트를 로그인 한 경로로 끝까지 꿴다** - `cfa301d` (feat)
2. **Task 2: §7-2 입력과 서버 검증 오류 컴포넌트** - `8d7fa79` (feat)
3. **Task 3: §6-7 로그인 화면 템플릿 구현 — 셸 없는 화면** - `e233e11` (feat)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified

- `public/fonts/pretendard/LICENSE.txt` · `pretendard-dynamic-subset.css` · `woff2-dynamic-subset/`(92개) - 자체 호스팅 서체 자산(신규)
- `app/layout.tsx` - tokens.css 직접 import + 서체 link, metadata·SessionRefresh 보존
- `app/globals.css` - `--font-sans` 참조 한 줄 추가
- `ui/button/Button.tsx` + `Button.module.css` - §7-1 버튼 위계(신규)
- `ui/input/TextField.tsx` + `TextField.module.css` - §7-2 입력·오류(신규)
- `ui/auth-frame/AuthFrame.tsx` + `AuthFrame.module.css` - §6-7 셸 없는 프레임(신규)
- `app/(auth)/login/login-form.tsx` - 제출 버튼·입력을 ui/ 컴포넌트로 교체
- `app/(auth)/login/page.tsx` - AuthFrame 재구성, h1 타이틀 제거

## Decisions Made

- AuthFrame 최대 폭은 새 값을 만들지 않고 `--modal-w`(480)를 재사용했다 — §6-7의 「최대 폭 360」은 ASCII 목업 근사치이고 로그인 폼은 `--form-max`(720)보다 단일 목적 좁은 컨테이너에 가깝다고 판단
- §6-7 다이어그램에 없는 h1 「로그인」 타이틀을 제거 — 워드마크가 그 자리를 대신하고 어떤 E2E도 이 텍스트에 의존하지 않음을 확인 후 결정
- `app/layout.tsx`의 수동 서체 `<link>`에 `eslint-disable-next-line @next/next/no-css-tags`를 붙여 경고 0개를 유지(02-02가 세운 관례를 따름)

## Deviations from Plan

None - 계획된 세 태스크를 순서대로 실행했고, 체크포인트 확정값(I②)·재계획 방아쇠 미해당(F-1①·F-2①은 이미 02-01이 확정)을 그대로 반영했다. 자동 검증(build·lint·typecheck·e2e·서체 스크립트)이 계획대로 전부 통과했다.

## Issues Encountered

- `app/layout.tsx` 코멘트에 `docs/design/tokens.css` 문자열을 한 번 더 적어 acceptance criteria의 `grep -c` 카운트(1이어야 함)가 일시적으로 2가 됨 — 코멘트 문구를 수정해 정정. 기능적 영향 없음(같은 import 줄 하나만 존재)

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- `ui/button`·`ui/input`·`ui/auth-frame` 세 컴포넌트가 서고, 로그인 화면이 SYSTEM.md 기준으로 완전히 재구성됐다 — 02-04(PC 사용자 메뉴·셸)·02-05·02-06·02-07이 같은 `ui/` 컴포넌트 구조와 stylelint 규칙을 그대로 재사용할 수 있다
- 02-06이 `ui/input/TextField`를 내 계정 비밀번호 변경 폼에 꽂을 때 이 플랜의 error prop 배선(next-safe-action `validationErrors` 필드 오류 문자열)을 그대로 재사용한다
- 02-07의 a11y 스펙이 `aria-invalid`/`aria-describedby` 연결의 실행 검사를 맡는다 — 이 플랜은 배선만 증명했다
- Pretendard의 Windows Chrome/Edge 실측(자릿수 정렬·전송량 200–300KB)은 이 실행 환경에 브라우저가 없어 여전히 사람 확인 대기 항목이다(D4)

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: public/fonts/pretendard/LICENSE.txt, pretendard-dynamic-subset.css, woff2-dynamic-subset/(92개)
- FOUND: ui/button/Button.tsx, ui/button/Button.module.css
- FOUND: ui/input/TextField.tsx, ui/input/TextField.module.css
- FOUND: ui/auth-frame/AuthFrame.tsx, ui/auth-frame/AuthFrame.module.css
- FOUND: commit cfa301d (Task 1), 8d7fa79 (Task 2), e233e11 (Task 3) — `git log --oneline --all --grep="02-03"` 대신 직접 해시로 확인(커밋 메시지에 "(02-03)" 접두어 포함)
- Re-ran all task-level acceptance criteria: all PASS
- Re-ran plan-level `<verification>`: `pnpm build`(성공) · `pnpm lint`(0 errors) · `pnpm typecheck`(0 errors) · `pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts`(4 passed) · 서체 url 해석 스크립트(`ok 92`) · `ui/**/*.module.css` 색 리터럴 0개(세 파일 모두 확인)
- `git diff --stat lib/viewer.ts`·`git diff --stat stylelint.config.mjs`·`git diff --stat test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts` 전부 빈 출력 확인
