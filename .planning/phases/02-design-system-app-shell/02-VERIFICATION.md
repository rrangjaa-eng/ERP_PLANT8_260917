---
phase: 02-design-system-app-shell
verified: 2026-09-24T08:02:48Z
status: human_needed
score: 5/5 must-haves verified
mode: mvp
mvp_user_story_valid: false
covered_files:
  - ".dockerignore"
  - ".github/workflows/ci.yml"
  - ".github/workflows/deploy.yml"
  - ".planning/REQUIREMENTS.md"
  - ".planning/WINDOWS.md"
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
  - ".planning/phases/02-design-system-app-shell/02-CONTEXT.md"
  - ".planning/phases/02-design-system-app-shell/02-REVIEW-FIX.md"
  - ".planning/phases/02-design-system-app-shell/02-REVIEW.md"
  - "app/(app)/account/account.module.css"
  - "app/(app)/account/change-password-form.tsx"
  - "app/(app)/account/logout-button.tsx"
  - "app/(app)/account/page.tsx"
  - "app/(app)/admin/system-status/page.tsx"
  - "app/(app)/approvals/page.tsx"
  - "app/(app)/cards/page.tsx"
  - "app/(app)/error.tsx"
  - "app/(app)/expenses/page.tsx"
  - "app/(app)/layout.tsx"
  - "app/(app)/not-found.tsx"
  - "app/(app)/page.tsx"
  - "app/(app)/pnl/page.tsx"
  - "app/(app)/projects/page.tsx"
  - "app/(app)/settings/page.tsx"
  - "app/(auth)/login/login-error.ts"
  - "app/(auth)/login/login-form.module.css"
  - "app/(auth)/login/login-form.tsx"
  - "app/(auth)/login/page.tsx"
  - "app/globals.css"
  - "app/layout.tsx"
  - "app/not-found.tsx"
  - "docs/ARCHITECTURE.md"
  - "docs/design/BRIEF.md"
  - "docs/design/DECISIONS.md"
  - "docs/design/EXPLORE.md"
  - "docs/design/SYSTEM.md"
  - "docs/design/tokens.css"
  - "eslint.config.mjs"
  - "next.config.ts"
  - "package.json"
  - "playwright.config.ts"
  - "pnpm-lock.yaml"
  - "public/fonts/pretendard/LICENSE.txt"
  - "public/fonts/pretendard/pretendard-dynamic-subset.css"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.0.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.1.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.10.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.11.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.12.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.13.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.14.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.15.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.16.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.17.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.18.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.19.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.2.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.20.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.21.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.22.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.23.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.24.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.25.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.26.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.27.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.28.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.29.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.3.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.30.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.31.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.32.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.33.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.34.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.35.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.36.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.37.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.38.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.39.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.4.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.40.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.41.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.42.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.43.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.44.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.45.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.46.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.47.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.48.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.49.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.5.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.50.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.51.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.52.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.53.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.54.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.55.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.56.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.57.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.58.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.59.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.6.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.60.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.61.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.62.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.63.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.64.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.65.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.66.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.67.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.68.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.69.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.7.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.70.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.71.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.72.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.73.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.74.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.75.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.76.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.77.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.78.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.79.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.8.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.80.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.81.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.82.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.83.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.84.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.85.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.86.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.87.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.88.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.89.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.9.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.90.woff2"
  - "public/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.91.woff2"
  - "stylelint.config.mjs"
  - "test/e2e/a11y.spec.ts"
  - "test/e2e/change-password.spec.ts"
  - "test/e2e/fonts.spec.ts"
  - "test/e2e/keyboard-nav.spec.ts"
  - "test/e2e/login-logout.spec.ts"
  - "test/e2e/logout-failure.spec.ts"
  - "test/e2e/mobile-next-turn.spec.ts"
  - "test/e2e/mobile-page-chrome.spec.ts"
  - "test/e2e/mobile-shell.spec.ts"
  - "test/e2e/page-chrome.spec.ts"
  - "test/e2e/single-column.spec.ts"
  - "test/e2e/system-status.spec.ts"
  - "test/e2e/tablet-shell.spec.ts"
  - "test/e2e/user-menu.spec.ts"
  - "test/unit/ci-guard.test.ts"
  - "test/unit/deploy/workflows.test.ts"
  - "test/unit/design-system-docs.test.ts"
  - "test/unit/stylelint-config.test.ts"
  - "test/unit/ui/current-path.test.ts"
  - "test/unit/ui/next-turn-action.test.ts"
  - "test/unit/ui/next-turn.test.ts"
  - "test/unit/ui/role-menu.test.ts"
  - "test/unit/ui/single-column.test.ts"
  - "test/unit/ui/system-md-compliance.test.ts"
  - "test/unit/ui/toast-timer.test.ts"
  - "ui/auth-frame/AuthFrame.module.css"
  - "ui/auth-frame/AuthFrame.tsx"
  - "ui/banner/Banner.module.css"
  - "ui/banner/Banner.tsx"
  - "ui/button/Button.module.css"
  - "ui/button/Button.tsx"
  - "ui/form-alert/FormAlert.module.css"
  - "ui/form-alert/FormAlert.tsx"
  - "ui/input/TextField.module.css"
  - "ui/input/TextField.tsx"
  - "ui/kv-list/KvList.module.css"
  - "ui/kv-list/KvList.tsx"
  - "ui/list-empty/ListEmpty.module.css"
  - "ui/list-empty/ListEmpty.tsx"
  - "ui/logout/use-logout.ts"
  - "ui/next-turn/NextTurn.module.css"
  - "ui/next-turn/NextTurn.tsx"
  - "ui/next-turn/build-next-turn-view.ts"
  - "ui/page-header/PageHeader.module.css"
  - "ui/page-header/PageHeader.tsx"
  - "ui/shell/BottomTabs.module.css"
  - "ui/shell/BottomTabs.tsx"
  - "ui/shell/MoreSheet.module.css"
  - "ui/shell/MoreSheet.tsx"
  - "ui/shell/Shell.module.css"
  - "ui/shell/Shell.tsx"
  - "ui/shell/TopBar.module.css"
  - "ui/shell/TopBar.tsx"
  - "ui/shell/current-path.ts"
  - "ui/shell/role-menu.ts"
  - "ui/status-tag/StatusTag.module.css"
  - "ui/status-tag/StatusTag.tsx"
  - "ui/toast/Toast.module.css"
  - "ui/toast/Toast.tsx"
covered_digest: "v1:sha256:89575f198533c8d00cbb4aa4c3f8d6d216d9f9c8039ba263a63c9de4b741ced3"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  previous_verified: 2026-09-19T22:45:00Z (사람 판정 재검토 2026-09-22)
  reason: "stale — covered_files 중 셸(TopBar·MoreSheet·BottomTabs·Shell·role-menu)·tokens.css·SYSTEM.md·DECISIONS.md·globals.css·E2E 스펙·app 화면이 dd8dd81 이후 바뀜(Phase 3·quick 260922-i3k/o2b·Phase 4 04-01)"
  changed_since_previous:
    - "docs/design/tokens.css: --auth-max 360px 신설(간격 토큰, DECISIONS.md 2026-09-22 기록) + --form-max 주석. 색·서체·radius 토큰 변화 0"
    - "docs/design/SYSTEM.md: §6-0 (a)·§7-8 「관리」 한 줄로 개정, §6-10 관리 인덱스·§7-13 체크박스 매트릭스·§7-14 이력 목록·§7-15 폼 신설, §7-3 편집 표 구현 계약 보강, §6-0 하단 탭 표 계급 5종"
    - "ui/shell: systemStatus → adminMenu(「관리」 한 줄), role-menu.ts가 isAdmin → roleId+allowedMenus(권한표), 폰 44 터치 목표 CSS, MoreSheet 그룹 머리글·inset-block-start, 로그아웃 실패 FormAlert(use-logout)"
    - "app/globals.css: .single-column 유틸(max-width: var(--form-max)) 추가만"
    - "E2E 스펙: isAdmin → roleId 픽스처 교체, 단언 삭제 0건(제거된 줄은 픽스처 호출뿐), 신규 fonts·tablet-shell·mobile-next-turn·user-menu·logout-failure·single-column"
  gaps_closed: []
  behavior_checks_closed:
    - "성공 기준 3 — 셸 컴포넌트 변경 후 키보드·375·태블릿 E2E를 현재 HEAD에서 CI=true로 재실행해 통과(165/165)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "02-01 체크포인트 응답(24개 항목)과 SYSTEM.md 신설 절(§6-7·§6-8·§6-9·§7-11·§7-12)의 문장을 대조해, 결정되지 않은 제품 동작이 확정 문장으로 들어가지 않았는지 확인한다(02-01 금지 조항 ①). 이후 추가된 §6-10·§7-13·§7-14·§7-15는 DECISIONS.md 2026-09-20~22 기록에 근거가 있는지 같은 기준으로 본다"
    expected: "신설 절의 모든 확정 문장이 체크포인트 응답 또는 DECISIONS.md 기록에 근거한다"
    why_human: "결정의 출처가 사람인지는 코드·문서 대조로 알 수 없다(2026-09-22 금지 조항 30건 재판정에서 유일한 판정불가 항목, 그대로 이월)"
  - test: "gstack `/design-review`(SYSTEM.md 일관성)와 `/qa`(실브라우저)를 이 페이즈 화면(로그인·내 계정·셸·1차 메뉴 5개·시스템 상태·오류 화면)에 돌린다"
    expected: "§11 시스템 일치 항목이 통과한다"
    why_human: "이제 실행 가능 — 이 세션에 gstack(design-review·qa 스킬)이 설치돼 있다. 이전 보고서의 '스킬 호출 불가'는 해소됐다. 검증자는 지시에 따라 두 스킬을 실행하지 않았다(오케스트레이터/사용자가 호출)"
  - test: "스테이징·프로덕션 Cloud Run URL에서 배포 리비전이 현재 HEAD(3c1b015 이후)와 같은지, 로그인·내 계정·셸이 토큰 스타일(Pretendard·딥그린 상단 바·--danger 오류 문구·360 로그인 틀)로 렌더되는지 본다"
    expected: "성공 기준 2의 '배포된 앱' 조건 — 배포 리비전이 검증한 코드와 같고, 로컬 E2E가 잰 계산값과 같은 모양이 나온다"
    why_human: "이 컨테이너의 프록시가 *.run.app에 403을 돌려 배포본을 볼 수 없다"
---

# Phase 2: 디자인 시스템·앱 셸 Verification Report

**Phase Goal:** 직원이 폰과 PC에서 `docs/design/SYSTEM.md` 기준으로 만들어진 앱 셸(로그인·내 계정·내비게이션)을 쓰고, 이후 모든 화면은 이 토큰·컴포넌트만 쓴다
**Verified:** 2026-09-24T08:02:48Z (HEAD `3c1b015`, 브랜치 claude/project-thread-pajnzt == origin/main)
**Status:** human_needed
**Re-verification:** Yes — stale 재검증. 이전 판정(2026-09-19T22:45Z, human_needed 5/5) 이후 셸·토큰·SYSTEM.md·스펙이 Phase 3·quick·Phase 4에서 바뀌어 성공 기준을 현재 코드에서 다시 도출했다. 이전 보고서의 주장은 물려받지 않았다.

## MVP 모드 불일치 (이월, 변화 없음)

ROADMAP은 `Mode: mvp`지만 목표 문장이 User Story 형식이 아니다(`user-story.validate` → `valid: false`). 이전과 같이 ROADMAP 성공 기준 다섯을 계약으로 삼아 목표 역방향으로 검증했다.

## 이번 재검증에서 바뀐 것 (dd8dd81 → 3c1b015)

`git diff --stat dd8dd81 HEAD -- ui docs/design app/globals.css` → 36파일 +3496/−119. 이 페이즈 계약에 걸리는 변화만 추렸다:

| 영역 | 변화 | 커밋(대표) |
|------|------|-----------|
| `docs/design/tokens.css` | `--auth-max: 360px` 신설(간격), `--form-max` 주석. **색·서체·radius 토큰 변화 0** | `472c461`, `6decee6` |
| `docs/design/SYSTEM.md` | §6-0 (a)·§7-8 「관리」 한 줄, §6-10·§7-13·§7-14·§7-15 신설, §7-3 구현 계약 보강, 하단 탭 표 계급 5종 | `c5e6bd3`, `603d25b`, `713cdcc`, `839d534` 외 |
| `docs/design/DECISIONS.md` | 2026-09-20~22 기록 14건 추가(아래 표) | 위와 같음 |
| `ui/shell/*` | `systemStatus` → `adminMenu`, `role-menu.ts` 입력 `isAdmin` → `roleId`+`allowedMenus`, 폰 44 터치 목표, MoreSheet 그룹 머리글·`inset-block-start: auto`, 로그아웃 실패 `FormAlert` | Phase 3 03-02, quick 260922-i3k/o2b |
| `app/globals.css` | `.single-column { max-width: var(--form-max) }` 추가만 | `35421a3` |
| `ui/auth-frame` | 최대 폭 `--modal-w`(480) → `--auth-max`(360) | `472c461` |
| `ui/button`·`ui/list-empty` | 폰 3차 버튼 44×44(토큰만), `ListEmpty.action` 선택화(보관함 예외, DECISIONS 2026-09-21) | Phase 3 |

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 — 계약)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SYSTEM.md·tokens.css가 존재하고 §1 브리프(BRIEF.md) → §2 발산(EXPLORE.md) → §3 수렴 산출물이며 `/plan-design-review`를 통과했다. 260907 화면은 참고하지 않았다 | ✓ VERIFIED | `docs/design/{BRIEF,EXPLORE,SYSTEM,DECISIONS}.md`·`tokens.css` 존재. `BRIEF.md`·`EXPLORE.md`는 `dd8dd81`과 바이트 동일(`git diff --quiet` exit 0). 이후 SYSTEM.md 변경은 모두 DECISIONS.md 날짜 기록을 동반한다(§6-10 ↔ 2026-09-22 「관리」 한 줄, §7-13 ↔ 2026-09-20 D-40, §7-14 ↔ 2026-09-20, §7-15 ↔ 2026-09-22 Phase 4, 하단 탭 표 ↔ 2026-09-20) — CLAUDE.md 「DECISIONS 기록 후 SYSTEM 수정」 규칙 준수. `/plan-design-review` 통과는 역사적 사실이라 재실행 대상 아님(ROADMAP 전제문) |
| 2 | 배포된 앱의 로그인·내 계정·앱 셸이 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓴다. 새 색·서체·radius 없음, Phase 1 임시 화면 없음 | ✓ VERIFIED (코드 기준) — '배포된' 부분은 사람 항목 3 | **직접 실행:** `pnpm exec stylelint "ui/**/*.module.css" "app/globals.css" "app/**/*.module.css"` → exit 0 (CSS 34파일: module 33 + globals). 모든 CSS의 `var(--*)` 참조 82종이 전부 `tokens.css` 정의에 존재(미정의 0, 로컬 커스텀 속성 정의 0). `font-weight`·`line-height`·`letter-spacing`·`border-radius`·`@font-face`·`@import`에서 `var()` 아닌 값은 `globals.css:33-34`의 `inherit` 둘뿐. `ui/`·`app/` TSX에 `style={{`·hex·`rgb(`·`fontFamily`·`borderRadius` 0건. tokens.css 신규 토큰은 `--auth-max`(간격) 하나로 D-20 금지 범위(색·서체·radius) 밖이며 DECISIONS.md 2026-09-22에 기록. `public/fonts`·`app/layout.tsx`·`stylelint.config.mjs`·`ui/{page-header,form-alert,kv-list,banner,status-tag}`·`ui/shell/current-path.ts`는 `dd8dd81`과 바이트 동일 — 페이지 층 갭(이전 성공 기준 2 갭)을 닫은 산출물이 그대로다. 맨 `<h1>`은 로그인 sr-only 1건 + PageHeader 1건뿐이고 `app/(app)/**/page.tsx` 전부가 PageHeader(또는 notFound/redirect)를 쓴다. 임시 화면·TBD/FIXME/XXX 0건. 계산값(getComputedStyle) 재확인: 로컬 게이트 E2E에서 `page-chrome`(14)·`mobile-page-chrome`(6)·`fonts`(2)·`single-column`(13) 전부 통과 |
| 3 | 폰(375px)과 PC에서 같은 셸이 깨지지 않고, 키보드만으로 로그인·내비게이션·비밀번호 변경이 된다 | ✓ VERIFIED | 코드: `Shell.tsx` 스킵 링크 + `main#main-content`; `TopBar.tsx` 사용자 메뉴 Esc 닫힘·트리거 포커스 복귀·↑↓/Home/End·Tab 이탈 시 닫힘; `MoreSheet.tsx` 네이티브 `<dialog>.showModal()` 트랩 + 포커스 복귀; `BottomTabs.module.css` 폰(<700)만 표시. 스펙은 단언 삭제 없이 픽스처만 `roleId`로 교체. **행동 증거:** 로컬 게이트 `pnpm test:e2e:ci`(CI=true 프로덕션 빌드, 2026-09-24) 165 passed / 0 failed / 0 flaky. `playwright test --list` 총 165건 = 통과 165건이므로 관련 스펙 전부 통과: keyboard-nav 7 · mobile-shell 15 · tablet-shell 4 · a11y 8 · login-logout 4 · change-password 1 · user-menu 5 · logout-failure 4 · system-status 2 · mobile-next-turn 2 |
| 4 | 핵심 컴포넌트 계약(서버 검증 오류 폼·grid·비활성+이유 버튼·알림함·배지·폰 목록·시트)이 SYSTEM.md에 있고, 모든 계약이 5상태를 필수 정의하며 EMPTY·ERROR는 다음 행동을 유도한다 | ✓ VERIFIED | §7-2·§7-15(폼), §7-3(grid), §7-1(버튼, §7-7 표 버튼 행), §7-12(알림함·배지), §6-1/§7-8(폰 목록·시트) 존재. 신설 계약 §7-13·§7-14·§7-15 각각 다섯 상태 표를 가짐(SYSTEM.md 916-924, 960-968, 995-1003), §7-7 컴포넌트 표에 관리자 마스터 화면 행 추가. EMPTY 다음 한 수 예외는 §7-12 알림함·보관함(DECISIONS 2026-09-20·09-21 사용자 승인/기록) 둘뿐 — `ListEmpty`를 `action` 없이 쓰는 곳은 `archive-table.tsx:45` 한 곳, 나머지 8곳은 전부 `action=` 있음. `vitest run --project unit` 대상 12파일(`design-system-docs`·`system-md-compliance`·`role-menu`(§6-10 표 대조) 등) 183/183 통과 |
| 5 | grid는 동작 계약만 확정(Tab/Enter·방향키, 범위 복사·붙여넣기, Esc, 저장·새 줄 단축키, 전부 저장/전부 거부 + 충돌·오류 칸). 구현 선택은 Phase 4 | ✓ VERIFIED | §7-3 본문에 Tab/Shift+Tab·Enter·방향키·Esc·⌘C/⌘V·⌘↵·⌘S·「일괄 저장은 전부 저장 또는 전부 거부」·충돌 셀 고정 문장이 그대로 있다. `ui/table/*`의 구현은 Phase 4(04-04)가 ROADMAP대로 만든 것이며 이 페이즈 계약을 바꾸지 않고 보강(§7-3 (나)~(사), DECISIONS 2026-09-22)만 했다 |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts (현재 코드 재확인)

| Artifact | Status | Details |
|----------|--------|---------|
| `docs/design/tokens.css` | ✓ VERIFIED | 색·서체·radius 토큰 불변, `--auth-max` 1개 추가(기록됨) |
| `docs/design/SYSTEM.md` | ✓ VERIFIED | 성공 기준 4·5 절 존재, 신설 절 5상태 정의 |
| `app/globals.css` | ✓ VERIFIED | body·§4-4·포커스 링 블록 불변, `.single-column` 추가(토큰만) — `app/(app)/account/page.tsx`에서 사용 |
| `ui/shell/{Shell,TopBar,BottomTabs,MoreSheet}.tsx` | ✓ WIRED | `app/(app)/layout.tsx` → `roleMenu({roleId, allowedMenus})` → `Shell` props. 셸 컴포넌트에 계급 분기 없음(D-23), `aria-current`는 `isCurrentPath`(불변) |
| `ui/shell/role-menu.ts` | ✓ VERIFIED | 하단 탭 표가 SYSTEM.md §6-0 계급 5종 표와 일치(`role-menu.test.ts`가 SYSTEM.md 표를 읽어 대조, 통과) |
| `ui/auth-frame/AuthFrame.module.css` | ✓ VERIFIED | `max-width: var(--auth-max)` = §6-7 「최대 폭 360」 |
| `ui/{page-header,form-alert,kv-list}` | ✓ VERIFIED | `dd8dd81`과 바이트 동일 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/(app)/layout.tsx` | `ui/shell/Shell.tsx` | `roleMenu()` 결과 4필드 전달 | ✓ WIRED |
| `TopBar.tsx`/`MoreSheet.tsx` | `ui/logout/use-logout.ts` | `useLogout(close)` — 성공 시에만 닫음, 실패는 `FormAlert` | ✓ WIRED |
| `app/layout.tsx` | `app/globals.css` + `tokens.css` | 루트 import(불변) | ✓ WIRED |
| `AuthFrame.module.css` | `tokens.css --auth-max` | `var()` | ✓ WIRED |

### Behavioral Spot-Checks (직접 실행)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 색·서체·radius 리터럴 금지 | `pnpm exec stylelint "ui/**/*.module.css" "app/globals.css" "app/**/*.module.css"` | exit 0 | ✓ PASS |
| CSS 변수 전부 tokens.css 정의 | `var(--*)` 82종 ↔ tokens.css 정의 `comm -23` | 미정의 0 | ✓ PASS |
| 인라인 스타일·색 리터럴 없음 | `grep -rnE "#hex\|rgba?\(\|fontFamily\|borderRadius\|style={{" ui app --include=*.tsx` | 0건 | ✓ PASS |
| 문서·셸·린트 규칙 단위 테스트 | `pnpm vitest run --project unit` design-system-docs · stylelint-config · ui/{role-menu,current-path,next-turn,next-turn-action,system-md-compliance,single-column,toast-timer,admin-index-link,admin-index-css} · ci-guard | 12 files / 183 tests passed (1.36s) | ✓ PASS |
| 셸 키보드·375·태블릿 E2E | 로컬 게이트 `pnpm test:e2e:ci` 결과 + `CI=true pnpm exec playwright test --list`(목록만, 서버 기동 없음)로 스펙 수 대조 | 165 passed / 목록 165건 | ✓ PASS |

### 로컬 게이트 (완료 — HEAD `3c1b015`, 2026-09-24 07:48–08:10Z, 같은 컨테이너)

오케스트레이터가 전체 게이트를 돌렸다. E2E는 로그(`scratchpad/e2e.log`) 마지막 줄 `165 passed (3.7m)`을 직접 확인했다. dot 리포터라 로그에 스펙 이름이 없어서, `CI=true pnpm exec playwright test --list`(목록만 출력, 서버·DB 기동 없음)로 "Total: 165 tests in 44 files"를 얻어 통과 수와 대조했다. 로그에 failed·flaky 줄은 0건이다.

| 게이트 | 결과 |
|--------|------|
| `pnpm lint`(eslint + stylelint) | exit 0 — 기존 boundaries v5→v6 설정 이관 경고만 있음(IN-07, 이 페이즈 무관) |
| `pnpm typecheck` | exit 0 |
| `pnpm lint:sql` | exit 0 |
| `pnpm test:unit` | 76 files / 743 tests passed |
| `pnpm test:integration` | 38 files / 1027 tests passed |
| `pnpm test:e2e:ci`(db:reset:test + CI=true 프로덕션 빌드) | **165 passed, 0 failed, 0 flaky** (3.7m) |

이 페이즈 판정에 쓴 E2E 스펙과 테스트 수(`--list` 기준, 전부 통과 165건에 포함): keyboard-nav 7 · mobile-shell 15 · tablet-shell 4 · a11y 8 · login-logout 4 · change-password 1 · system-status 2 · user-menu 5 · logout-failure 4 · page-chrome 14 · mobile-page-chrome 6 · fonts 2 · mobile-next-turn 2 · single-column 13.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UX-01 | 02-01…02-08 | SYSTEM.md 먼저 확정, 모든 화면이 토큰·컴포넌트만 사용, 계약 5상태 필수, EMPTY·ERROR 다음 행동 | ✓ SATISFIED (코드 기준) | 성공 기준 2·4 근거. Phase 3·4가 추가한 화면·컴포넌트 CSS도 같은 stylelint·토큰 검사를 통과한다. REQUIREMENTS.md L139 `[x]`, L269 Complete |

고아 요구사항 없음(REQUIREMENTS.md에서 Phase 2에 매핑된 ID는 UX-01 하나).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX (ui/·셸·페이즈 2 화면·globals.css·tokens.css) | 없음 | 부채 표지 게이트 통과 |
| `ui/input/TextField.module.css` | 31 | `::placeholder` | ℹ️ Info | CSS 의사 요소 이름일 뿐 스텁 아님 |

회귀 없음: 토큰 전용 규칙, 새 색·서체·radius 금지, 셸 계급 분기 금지(D-23), SYSTEM.md ↔ DECISIONS.md 추적 모두 현재 코드에서 유지된다.

### Human Verification Required

1. **SYSTEM.md 신설 절의 결정 출처** — 02-01 체크포인트 24개 응답·DECISIONS.md와 대조(이월). 이후 추가 절(§6-10·§7-13~15)도 같은 기준으로.
2. **gstack `/design-review` + `/qa`** — 이제 실행 가능(스킬 설치됨). 도구 문제로 막혀 있던 상태는 해소됐고, 남은 것은 실제 호출뿐이다. 검증자는 지시대로 실행하지 않았다.
3. **배포본 확인** — 스테이징·프로덕션 Cloud Run 리비전이 HEAD와 같은지, 셸이 토큰 스타일로 렌더되는지. 프록시가 `*.run.app`에 403을 돌려 여기서 확인 불가.

성공 기준 3은 로컬 게이트 E2E로 닫혔다(위 표). 남은 것은 위 세 사람 항목뿐이다.

### Gaps Summary

성공 기준을 거스르는 갭은 없다. Phase 3·4와 quick 작업이 셸·토큰·SYSTEM.md를 크게 바꿨지만(36파일 +3496줄), (a) 색·서체·radius 토큰은 하나도 늘지 않았고 새 토큰 `--auth-max`는 간격이며 기록돼 있다. (b) 모든 CSS가 stylelint를 통과하고 tokens.css에 정의된 변수만 참조한다. (c) SYSTEM.md 변경마다 DECISIONS.md 날짜 기록이 있다. (d) 신설 컴포넌트 계약은 모두 5상태를 정의한다. (e) 셸은 여전히 계급 분기 없이 `role-menu.ts` 계산 결과만 렌더한다. 성공 기준 3의 런타임 동작은 현재 HEAD의 CI=true E2E 165/165로 확인했다. 판정이 `passed`가 아닌 이유는 사람 항목 3건(결정 출처 대조 · `/design-review`+`/qa` 호출 · 배포본 확인)이 남아 있기 때문이다.

---

## 이력 — 이전 판정 기록

### 2026-09-19T18:53:19Z 첫 검증 (gaps_found 4/5)

성공 기준 2가 부분 실패였다. 컴포넌트 층은 토큰만 썼지만 페이지 층(body·§4-4 표면·화면 제목·로그인 실패 문구·시스템 상태 dl)이 UA 기본값으로 렌더됐다. 전문은 `git show 25aaa4f:.planning/phases/02-design-system-app-shell/02-VERIFICATION.md`.

### 2026-09-19T22:45:00Z 재검증 (human_needed 5/5)

02-08(갭 해소)로 성공 기준 2 갭을 닫았다. page-chrome·mobile-page-chrome 17건과 기존 E2E 30건, unit 291건, build를 직접 돌렸다. 전문은 `git show dd8dd81:.planning/phases/02-design-system-app-shell/02-VERIFICATION.md`.

## Re-verification 2026-09-22 — human_verification 9건 재검토

사람 판정 9건을 다시 읽고 "정말 사람 손이 필요한가"를 판정했다. 결과: 이미 해소 3건, 자동화로 닫음 4건, 사람 2건(위 frontmatter).

| # | 항목 | 결과 | 근거 |
|---|------|------|------|
| 1 | Windows Pretendard·전송량·tnum (D-32) | 자동화로 닫음 | Pretendard는 자체 호스팅 웹폰트라 OS와 무관하다. `test/e2e/fonts.spec.ts`가 `document.fonts.check`·body font-family·첫 로드 woff2 합 ≤ 300KB·tnum 등폭(1 vs 0 자릿수 폭)을 실측. CI=true 통과 |
| 2 | 태블릿 700·900·1023 | 자동화로 닫음 | `test/e2e/tablet-shell.spec.ts` — 세 폭에서 주 메뉴 5개 가시·하단 탭 숨김·가로 스크롤 0, 699에서 하단 탭 4개로 전환 |
| 3 | 375 시각 품질 | 자동화로 닫음 | 독립 에이전트가 CI=true 프로덕션 빌드로 7개 화면 DOM 실측: 겹침·잘림·오버플로 0건(더보기 시트의 겹침 9쌍은 `::backdrop` 스크림 뒤 오탐). §10 터치 목표 44 미달은 별도 윈도우로 등록 |
| 4 | /design-review + /qa | 남음 | frontmatter 참고 — 스킬 호출 불가, 대체 검증은 수행 |
| 5 | 「내 차례」 폰 두 줄 | 자동화로 닫음 + **결함 발견·수정** | `test/e2e/mobile-next-turn.spec.ts`가 실제 컴포넌트를 esbuild로 SSR해 375px에서 실측. 원래 grid(auto 1fr auto)는 자동 배치가 행동 링크를 2행으로 밀어 §7-4 "1행 태그·대상·행동, 2행 금액·이유"와 달랐다(preview.html 실물도 동일). 행·칸을 명시해 고쳤고 행동 링크 터치 목표 44도 확보 |
| 6 | 금지 조항 27건 판정 | 독립 재판정 완료 | Fable 리뷰어가 파일:줄 근거로 30건 전수(27은 오기: 24+6) — 위반 0, 판정불가 1(02-01 ①, 사람) |
| 7 | §7-12 EMPTY 예외 | 이미 해소 | DECISIONS.md 2026-09-20 사용자 승인 기록 |
| 8 | `--fs-2xl` §2-2 vs §6-9 | 이미 결정 | DECISIONS.md 2026-09-20 "KPI 타일까지 미룸", WINDOWS #7 |
| 9 | 로그인 실패 영문 문구 | 이미 해소 | 커밋 9c6c5aa, `app/(auth)/login/login-error.ts`, WINDOWS #6 fixed |

(2026-09-24 주: 위 4번의 "스킬 호출 불가"는 더 이상 사실이 아니다 — gstack이 설치돼 실행 가능. 1·2·5번 스펙은 2026-09-24 게이트에서 현재 코드 기준으로 다시 돈다.)

---

_Verified: 2026-09-24T08:02:48Z_
_Verifier: Claude (gsd-verifier) — stale 재검증_
