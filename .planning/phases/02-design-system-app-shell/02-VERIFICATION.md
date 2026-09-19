---
phase: 02-design-system-app-shell
verified: 2026-09-19T18:53:19Z
status: gaps_found
score: 4/5 must-haves verified
mode: mvp
mvp_user_story_valid: false
covered_files:
  - ".dockerignore"
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
  - ".planning/phases/02-design-system-app-shell/02-CONTEXT.md"
  - ".planning/phases/02-design-system-app-shell/02-REVIEW-FIX.md"
  - ".planning/phases/02-design-system-app-shell/02-REVIEW.md"
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
  - "app/(auth)/login/login-form.tsx"
  - "app/(auth)/login/page.tsx"
  - "app/globals.css"
  - "app/layout.tsx"
  - "app/not-found.tsx"
  - "docs/ARCHITECTURE.md"
  - "docs/design/DECISIONS.md"
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
  - "test/e2e/keyboard-nav.spec.ts"
  - "test/e2e/mobile-shell.spec.ts"
  - "test/unit/ci-guard.test.ts"
  - "test/unit/deploy/workflows.test.ts"
  - "test/unit/design-system-docs.test.ts"
  - "test/unit/stylelint-config.test.ts"
  - "test/unit/ui/next-turn.test.ts"
  - "test/unit/ui/role-menu.test.ts"
  - "ui/auth-frame/AuthFrame.module.css"
  - "ui/auth-frame/AuthFrame.tsx"
  - "ui/banner/Banner.module.css"
  - "ui/banner/Banner.tsx"
  - "ui/button/Button.module.css"
  - "ui/button/Button.tsx"
  - "ui/input/TextField.module.css"
  - "ui/input/TextField.tsx"
  - "ui/list-empty/ListEmpty.module.css"
  - "ui/list-empty/ListEmpty.tsx"
  - "ui/next-turn/NextTurn.module.css"
  - "ui/next-turn/NextTurn.tsx"
  - "ui/next-turn/build-next-turn-view.ts"
  - "ui/shell/BottomTabs.module.css"
  - "ui/shell/BottomTabs.tsx"
  - "ui/shell/MoreSheet.module.css"
  - "ui/shell/MoreSheet.tsx"
  - "ui/shell/Shell.module.css"
  - "ui/shell/Shell.tsx"
  - "ui/shell/TopBar.module.css"
  - "ui/shell/TopBar.tsx"
  - "ui/shell/role-menu.ts"
  - "ui/status-tag/StatusTag.module.css"
  - "ui/status-tag/StatusTag.tsx"
  - "ui/toast/Toast.module.css"
  - "ui/toast/Toast.tsx"
covered_digest: "v1:sha256:a06d0734eac63337141bc06fc230c33f16dbbcd597f42f712b6042441527435f"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 14
  total: 14
  not_honored: []
gaps:
  - truth: "배포된 앱의 로그인·내 계정·앱 셸(내비게이션·레이아웃·빈 상태)이 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓴다. 새 색·서체·radius가 없고 Phase 1의 임시 화면은 남아 있지 않다 (ROADMAP 성공 기준 2)"
    status: partial
    reason: "컴포넌트 층(ui/*)은 토큰만 쓰고 리터럴 0건이지만, 페이지 기본 타이포그래피와 브라우저 기본 표면이 토큰에 연결되지 않아 화면 골격(제목·부제·본문 글자·dl·로그인 실패 문구)이 UA 기본값으로 렌더된다. tokens.css는 :root 커스텀 속성만 정의하고 app/globals.css는 body에 font-family 한 줄만 둔다(실물 form-expense.html:18의 body 규칙은 background/color/font-size/line-height/letter-spacing/word-break/overflow-wrap도 정한다). 결과: 본문 색 = UA 검정(--fg #0B1512 아님), 본문 크기 = UA 16px(--fs-base 14/15px 아님), --lh-body·--ls-body 미참조, 화면 제목 h1 = UA 2em bold(SYSTEM §6-0 L290: --fs-lg + 부제 --fs-sm --muted), 로그인 실패 p[role=alert] 무스타일(§6-7: --danger), 시스템 상태 dl 무스타일(§6-8 B①), §4-4 브라우저 기본 표면(::selection·caret-color·accent-color·scrollbar-color) 미설정('기본값으로 두지 않는다'). 02-05-SUMMARY.md:59가 스스로 '무스타일 관례'라 적었고 DECISIONS.md 6건 어디에도 이 이탈이 기록되지 않았다."
    artifacts:
      - path: "app/globals.css"
        issue: "body에 font-family만 설정. background/color/font-size/line-height/letter-spacing/word-break/overflow-wrap(실물 body 규칙)과 §4-4 브라우저 기본 표면 토큰이 없다"
      - path: "app/(app)/account/page.tsx"
        issue: "h1·p가 클래스 없이 UA 기본 크기·색으로 렌더 — §6-0 화면 제목(--fs-lg)+부제(--fs-sm --muted) 규칙 미적용"
      - path: "app/(app)/admin/system-status/page.tsx"
        issue: "dl/dt/dd 무스타일 — §6-8 B①(라벨 96/84, --fs-sm --muted 600, 행 사이 점선 --line) 미적용"
      - path: "app/(auth)/login/login-form.tsx"
        issue: "로그인 실패 <p role=\"alert\">가 무스타일 — §6-7은 --danger"
      - path: "app/(app)/projects/page.tsx"
        issue: "1차 메뉴 5화면·설정·오류 3화면·홈의 h1/부제 p 전부 같은 무스타일 관례(02-05-SUMMARY.md:59)"
    missing:
      - "app/globals.css에 실물 body 규칙 이관: background var(--bg) · color var(--fg) · font-size var(--fs-base) · line-height var(--lh-body) · letter-spacing var(--ls-body) · word-break keep-all · overflow-wrap anywhere"
      - "§4-4 브라우저 기본 표면 토큰 연결: ::selection(--sel-bg/--fg) · caret-color(--accent) · accent-color(--accent) · scrollbar-color(--line-ui on --bg, thin)"
      - "화면 제목/부제 규칙(§6-0 L290)을 재사용 가능한 자리에 두기 — globals.css의 main h1/부제 선택자 또는 ui/ 페이지 헤더 컴포넌트 — 그리고 11개 화면(홈·1차 메뉴 5·설정·내 계정·시스템 상태·404×2·오류)에 적용"
      - "로그인 실패 문구 --danger(§6-7), 시스템 상태 dl 골격(§6-8 B①) 스타일"
      - "위 항목이 의도적으로 Phase 2 범위 밖이었다면 CLAUDE.md 규칙대로 docs/design/DECISIONS.md에 이탈 기록 + SYSTEM.md 정정 후 override로 처리"
insufficient_spec_items:
  - truth: "Windows Chrome/Edge에서 Pretendard가 실제로 적용되고, 맑은 고딕 폴백 대비 숫자 자릿수가 정렬되며, 첫 로드 서체 전송량이 200–300KB 안이다 (02-01·02-03·02-07 backstop, D-32)"
    reason: insufficient_spec
    evidence_present: "92 woff2 + css + OFL 리포 커밋(git ls-files 94건), app/layout.tsx <link>, unicode-range @font-face — 리눅스 컨테이너에서 Windows 렌더링·전송량을 관측할 수 없음"
  - truth: "태블릿 700–1023에서 PC 셸이 그대로 쓰이고 하단 탭이 없다 (02-04 backstop)"
    reason: insufficient_spec
    evidence_present: "BottomTabs.module.css:6 display:none 기본 + @media (max-width: 699.98px)에서만 flex; TopBar nav는 그 반대 — 존재만 확인, 700–1023 뷰포트 테스트 없음"
  - truth: "「내 차례」 한 줄이 폰에서 두 줄로 접히고 터치 목표가 확보된다 (02-05 backstop)"
    reason: insufficient_spec
    evidence_present: "NextTurn.module.css 존재하나 D-24로 입력이 항상 []라 어떤 뷰포트에서도 행이 렌더된 적이 없다(mobile-shell.spec은 하단 탭·시트만 잰다)"
  - truth: "배너·토스트·상태 태그가 §7-7에 새로 추가된 다섯 상태 행과 어긋나지 않는다 (02-06 backstop)"
    reason: insufficient_spec
    evidence_present: "Banner.tsx(닫기 없음·역할 2종) · Toast.tsx(error는 자동 소멸 없음) · StatusTag.tsx(정적 라벨)가 §7-7 행과 문면상 일치 — 판단 항목, 테스트 없음"
flagged_prohibitions: 21
human_verification:
  - test: "Windows 10/11 Chrome 또는 Edge에서 /login → /account → /admin/system-status를 열고 DevTools Network에서 폰트 요청을 본다"
    expected: "Pretendard Variable이 적용되고(맑은 고딕 아님) 첫 로드 woff2 전송량 합이 200–300KB, 숫자(예: DB 커넥션 18 / 20)가 tnum으로 정렬"
    why_human: "리눅스 컨테이너에서 Windows 브라우저 렌더링·서브셋 전송량을 관측할 수 없다(D-32가 사람 체크포인트로 명시)"
  - test: "뷰포트 폭 700·900·1023px로 로그인 후 홈을 연다"
    expected: "PC 상단 바와 1차 메뉴 5개가 보이고 하단 탭이 없다. 699px로 줄이면 하단 탭 4개로 전환"
    why_human: "CSS 미디어 쿼리 존재만 확인됨(BottomTabs.module.css:9, TopBar.module.css:122). 700–1023 뷰포트를 도는 테스트가 없다"
  - test: "375px 뷰포트에서 로그인·홈·내 계정·프로젝트·404 화면을 눈으로 본다"
    expected: "간격·줄바꿈이 SYSTEM.md 실물(docs/design/system/shots/ 폰 390)과 같은 느낌이고 겹침·잘림이 없다"
    why_human: "가로 스크롤 0·터치 44는 자동으로 잰 값이지만 시각적 품질은 스크린샷 도구 없이 판정 불가. CLAUDE.md UI 완료 판정(/design-review → /qa)도 아직이다"
  - test: "/design-review(SYSTEM.md 일관성)와 /qa(실브라우저)를 이 페이즈 화면 11개에 돌린다"
    expected: "§11 시스템 일치 항목(새 색·서체·radius·그림자 0 · 카드 0 · 안내 문구 0 · 이유 없는 비활성 0)이 통과하고, Gap 1(UA 기본 타이포그래피)이 리뷰에서 재현된다"
    why_human: "CLAUDE.md 프론트엔드 규칙이 UI 완료 판정을 두 스킬 통과 뒤로 정했고 둘 다 이 환경에서 실행되지 않았다"
  - test: "「내 차례」에 항목이 있을 때의 폰 두 줄 배치를 확인한다 — Phase 4 이후 실데이터가 생기면, 또는 buildNextTurnView에 임시 항목을 넣은 로컬 브랜치에서"
    expected: "1행 태그·대상·행동, 2행 금액·이유(§7-4), 행동 버튼 터치 목표 44"
    why_human: "D-24로 입력이 항상 빈 배열이라 행이 렌더된 적이 없다"
  - test: "아래 '비인가 판정 21건' 표의 각 금지 조항 판정을 사람이 확인한다"
    expected: "각 행의 근거가 실제 코드와 일치하고 위반이 없다"
    why_human: "PLAN prohibitions는 verification 등급이 없는 판단 항목(judgment-tier)이라 LLM 판정은 비인가(non-authoritative)다"
  - test: "SYSTEM.md §7-12 알림함 EMPTY(`알림이 없습니다`, 다음 한 수 없음)를 성공 기준 4의 'EMPTY는 다음 행동을 유도한다' 규칙의 의도적 예외로 승인할지 결정한다"
    expected: "승인이면 docs/design/DECISIONS.md에 이탈 기록 1건 추가(CLAUDE.md 규칙); 아니면 §7-12 EMPTY에 다음 한 수(예: '내 차례 보기')를 넣는다"
    why_human: "제품 결정 — 계약 문장에 이유가 적혀 있으나 DECISIONS.md에는 없다"
---

# Phase 2: 디자인 시스템·앱 셸 Verification Report

**Phase Goal:** 직원이 폰과 PC에서 `docs/design/SYSTEM.md` 기준으로 만들어진 앱 셸(로그인·내 계정·내비게이션)을 쓰고, 이후 모든 화면은 이 토큰·컴포넌트만 쓴다
**Verified:** 2026-09-19T18:53:19Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## MVP-mode discrepancy

ROADMAP marks this phase `Mode: mvp`, but the goal is not in User Story format (`gsd_run query user-story.validate` → `valid: false`, 4 errors). Per `verify-mvp-mode.md` this is surfaced as a discrepancy: run `/gsd mvp-phase 2` if MVP framing is wanted. Because the orchestrator supplied the five ROADMAP success criteria as the contract, verification proceeded goal-backward against those; the User Flow Coverage table below is derived from the goal sentence, not from a validated story.

## User Flow Coverage

User story (derived): «직원이 폰과 PC에서 SYSTEM.md 기준의 앱 셸로 로그인하고, 내 계정에서 비밀번호를 바꾸고, 내비게이션으로 화면을 오간다.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| 로그인(셸 없음) | 워드마크 + 폼, Tab×2 + Enter로 제출 | `app/(auth)/login/page.tsx` (AuthFrame) · `keyboard-nav.spec.ts:42` passed in my run | ✓ |
| 셸 진입 | 상단 바 5메뉴(PC) / 하단 탭 4개(폰), 스킵 링크 첫 포커스 | `app/(app)/layout.tsx` → `Shell` · `keyboard-nav.spec.ts:103,134` · `mobile-shell.spec.ts:24,36` passed | ✓ |
| 내비게이션 | Tab → Enter로 /projects 이동, 빈 화면은 EMPTY + 다음 한 수 | `keyboard-nav.spec.ts:48` passed · `app/(app)/projects/page.tsx` ListEmpty | ✓ |
| 내 계정 → 비밀번호 변경 | 사용자 메뉴 → 내 정보 → 키보드로 변경 → `/login?reason=password-changed` | `keyboard-nav.spec.ts:59` passed · `change-password.spec.ts` (6/6 regression run) | ✓ |
| 로그아웃 | 상단 바·시트·내 계정 어디서든 | `login-logout.spec.ts:46` passed; TopBar/MoreSheet/logout-button all call `authClient.signOut()` | ✓ |
| Outcome: "이후 모든 화면은 이 토큰·컴포넌트만 쓴다" | 컴포넌트·CSS 리터럴 0, 페이지 기본 타이포그래피도 토큰 | 컴포넌트 층 ✓ (stylelint + grep 0건) · 페이지 기본 타이포그래피 ✗ (Gap 1) | ✗ partial |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SYSTEM.md·tokens.css가 존재하고 §1→§2→§3 산출물이며 `/plan-design-review`를 통과했다. 260907 화면은 참고하지 않았다 | ✓ VERIFIED (pre-existing) | `docs/design/{BRIEF,EXPLORE,SYSTEM,DECISIONS}.md` + `tokens.css` 존재(SYSTEM.md 842줄). `docs/design/REVIEW.md` L13-L28: 1차 리뷰 7/10 → 9/10, 7 패스, 미결 U1~U4 전부 결정. `grep 260907 docs/design/` → BRIEF.md:77 · REVIEW.md:10 · NEXT-SESSION.md:98은 모두 "참고 금지" 문장이고, SYSTEM.md:783은 BRIEF가 허용한 업무 용어표 참조뿐 |
| 2 | 로그인·내 계정·앱 셸이 SYSTEM.md 컴포넌트와 tokens.css 토큰만 쓴다. 새 색·서체·radius 없음, Phase 1 임시 화면 없음 | ✗ FAILED (partial) | **통과한 부분:** 4개 Phase-1 화면 모두 `ui/` 위에 재구성(login: AuthFrame/TextField/Button · account: Banner/TextField/Button · system-status: Banner/StatusTag · root → `(app)/page.tsx` NextTurn/ListEmpty); 옛 경로 `app/page.tsx`·`app/admin/system-status/page.tsx` 삭제 확인(`ls app/admin` 없음). `grep -rnEi '#hex|rgba?|hsla?|border-radius: N|font-family: [^v]|font:' app ui --include=*.css` → 0건; TSX inline style/hex 0건; app/ui CSS가 참조하는 `var(--x)` 전부 tokens.css에 정의(`comm` 결과 공집합); stylelint clean + 음성 프로브(`#fff`·`9px`·`Arial`) 3 errors exit 2. 신규 토큰 1개 `--on-accent-weak`: tokens.css:30 + SYSTEM.md §7-1 L618 + DECISIONS.md L245 — 절차 준수. **실패한 부분:** 페이지 기본 타이포그래피·브라우저 기본 표면이 토큰에 연결되지 않음 — 상세는 Gaps Summary. 02-05-SUMMARY.md:59가 "무스타일 관례"라 자인 |
| 3 | 폰(375px)과 PC에서 같은 셸이 깨지지 않고, 키보드만으로 로그인·내비게이션·비밀번호 변경이 된다 | ✓ VERIFIED (behavioural) | **내가 직접 실행:** `playwright test mobile-shell keyboard-nav a11y` → 24 passed (51.8s). mobile-375: 하단 탭 4개·마지막 「더보기」, 주 메뉴 hidden, `scrollWidth ≤ clientWidth`, 시트 열림→첫 행동 요소 포커스, Esc→포커스 복귀, 탭·시트 행 boundingBox 높이 ≥44, 계정 그룹 = role-menu. desktop: Tab×2+Enter 로그인, Tab→Enter로 /projects, 사용자 메뉴 Enter→내 정보 포커스→키보드로 비밀번호 변경→`/login?reason=password-changed`, Esc 복귀, 스킵 링크 y<0→포커스 시 y≥0, Tab 순서 = 시각 순서. axe 6화면 위반 0(규칙 비활성 없음, a11y.spec.ts:86). 스펙은 실제 렌더 값을 재므로 실패 가능하다(`toHaveLength(6)` 한 건만 공허 — IN-02). 회귀: Phase-1 스펙 3개 6 passed (20.0s) |
| 4 | 핵심 컴포넌트 계약 5종이 SYSTEM.md에 있고, 모든 계약이 5상태를 필수 정의하며 EMPTY·ERROR는 다음 행동을 유도한다 | ✓ VERIFIED (1 reasoned exception, see WARNING) | 5종: 서버 검증 오류 폼 §7-2 L633 「원인 · 다음 행동」 · grid §7-3 · 비활성+이유 §7-1 L619(UX-06) · 알림함·배지 §7-12 L760 · 폰용 목록 §6-1 + 시트 §7-8. 5상태: §7-7 두 번째 표 12행×5열 전부 채움(신설 6행은 「해당 없음(이유)」), §6-7·§6-8·§6-9·§7-11·§7-12 각각 5상태 열거, 미적용은 전부 「해당 없음 — 이유」. 다음 행동: §6-8 ERROR `다시 시도`, §6-9 ERROR 1차 버튼, §7-12 ERROR `다시 시도`, §7-7 EMPTY 예시 전부 「· 다음 한 수」. `test/unit/design-system-docs.test.ts`가 신설 5절·§7-7 6행·DECISIONS 6건·토큰 실재를 고정(unit 284/284 passed). 코드 측: `ListEmpty` props가 `action`을 필수로 강제(ListEmpty.tsx:23-26) |
| 5 | grid 동작 계약만 확정: Tab/Enter·방향키, 여러 칸 복사·붙여넣기, Esc, 저장·새 줄 단축키, 전부 저장/전부 거부, 충돌·오류 칸 표시. 구현 선택은 Phase 4 | ✓ VERIFIED (pre-existing) | SYSTEM.md §7-3 L647-L651: `Tab/Shift+Tab 좌우, Enter 아래, 방향키 이동, Esc 취소(값 되돌림), ⌘C/⌘V 범위 복사·붙여넣기, ⌘↵ 새 줄, ⌘S 일괄 저장` · L649 `일괄 저장은 전부 저장 또는 전부 거부` + 오류 셀 고정 · L650 `충돌(다른 사람이 먼저 저장): … 덮어쓰기 / 그 값으로`. `ui/` 트리에 표 컴포넌트 없음(D-25 준수), DECISIONS.md L213이 EMPTY의 표 뼈대 생략을 이탈로 기록 |

**Score:** 4/5 truths verified (0 present-but-behavior-unverified; 4 backstop statements abstained → human items)

### PLAN must_haves (67 truths across 7 plans) — coverage summary

Verified against code, not SUMMARY: 02-01 (14/14 doc truths via grep + `design-system-docs.test.ts`), 02-02 (11/11 — boundary probe: a temp `ui/` file importing `@/domain` → `boundaries/element-types` error, removed afterwards; stylelint probe; `docs/ARCHITECTURE.md` 126 lines mentions `ui/` L15), 02-03 (10/10 — `app/layout.tsx:4` imports `../docs/design/tokens.css`, dev server compiled it during my E2E run; `pnpm build` not re-run by me, SUMMARY claims success), 02-04 (11/11 — all exercised by E2E), 02-05 (8/8 — `buildNextTurnView([])` → `visible:false`; `next-turn.test.ts` in unit run), 02-06 (9/9 — regression E2E covers banner, wrong current password, 7-char reject, 404, logout), 02-07 (7/7 — my E2E run). The 6 `verification: backstop` statements are abstained (see `insufficient_spec_items`).

### Required Artifacts

`gsd_run query verify.artifacts` on all 7 plans: 33/33 passed (exists + substantive). Level 3/4 checked by hand:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/shell/{Shell,TopBar,BottomTabs,MoreSheet}.tsx` | §6-0 셸 | ✓ VERIFIED | Imported by `app/(app)/layout.tsx`; role branching only in `role-menu.ts` (`grep isAdmin ui/` → role-menu only); MoreSheet uses native `<dialog>.showModal()` |
| `ui/shell/role-menu.ts` | D-23 매핑 한 곳 | ✓ VERIFIED | Pure function; consumed by layout + `mobile-shell.spec.ts` |
| `ui/button/Button.tsx` · `ui/input/TextField.tsx` · `ui/auth-frame/AuthFrame.tsx` | §7-1 · §7-2 · §6-7 | ✓ VERIFIED | Used by login form, change-password form, logout; TextField wires `aria-invalid`/`aria-describedby` (a11y.spec.ts:97 passed) |
| `ui/list-empty/ListEmpty.tsx` | §7-7 EMPTY/ERROR | ✓ VERIFIED | Used by 9 pages; `action` required by type |
| `ui/next-turn/{NextTurn.tsx,build-next-turn-view.ts}` | §7-4 · D-24 | ✓ VERIFIED (data by design []) | Wired from `app/(app)/page.tsx`; input intentionally empty (D-24) — not a stub. WR-04 (href discarded) is latent |
| `ui/banner/Banner.tsx` · `ui/status-tag/StatusTag.tsx` | §7-11 · §7-5 | ✓ VERIFIED | Used by account + system-status pages |
| `ui/toast/Toast.tsx` | §7-6 | ⚠️ ORPHANED | `grep -rn "ui/toast" app` → no importer. Built ahead of demand (D-25 said 토스트 is in scope, but no screen in this phase triggers one). Not a criterion failure; WR-05 open |
| `public/fonts/pretendard/**` | D-32 | ✓ VERIFIED | 92 woff2 + css + LICENSE, 94 files git-tracked, 3.1 MB; linked in `app/layout.tsx:25` |
| `stylelint.config.mjs` + `package.json` lint | D-20 | ✓ VERIFIED | Glob covers `ui/**/*.module.css`, `app/globals.css`, `app/**/*.module.css`; probe rejected |
| `eslint.config.mjs` `ui` type | D-26 | ✓ VERIFIED | L29 element, L41 app→ui, L68 `ui → [ui, lib]`; probe rejected |
| `docs/design/SYSTEM.md` §6-7/6-8/6-9/7-11/7-12 | D-30/D-31 | ✓ VERIFIED | Read in full; five-state blocks complete |
| `test/e2e/{mobile-shell,keyboard-nav,a11y}.spec.ts` + `playwright.config.ts` | 성공 기준 3 | ✓ VERIFIED | `mobile-*.spec.ts` project split; all 24 tests executed here |

### Key Link Verification

`gsd_run query verify.key-links`: 13/13 verified across 7 plans. Spot-checked by hand: `app/layout.tsx` → `../docs/design/tokens.css` (L4, no copy); `app/(app)/layout.tsx` → `roleMenu(viewer)` → `<Shell>` props; `BottomTabs` → `MoreSheet` (4th tab opens sheet); `change-password-form.tsx` → `TextField error={…validationErrors…}`; `system-status/page.tsx` → `Banner kind="warning"`; `projects/page.tsx` → `ListEmpty`.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/(app)/layout.tsx` → Shell | `user.name`, `roleMenu(viewer)` | `requireSession()` (real session) | Yes | ✓ FLOWING |
| `app/(app)/account/page.tsx` | `user.passwordIsTemporary`, email, name | `requireSession()` | Yes (regression E2E shows banner) | ✓ FLOWING |
| `app/(app)/admin/system-status/page.tsx` | `status.version/db/backup` | `getSystemStatus(viewer)` (pg_stat_activity + Cloud SQL API) | Yes | ✓ FLOWING |
| `app/(app)/page.tsx` → NextTurn | `buildNextTurnView([])` | none (D-24, by decision) | No — intentional, documented | ⚠️ STATIC (accepted by D-24/D-28) |
| 5 primary-menu pages + settings | none | none (D-22 EMPTY) | N/A — EMPTY is the contract | ✓ per contract |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phone shell + keyboard-only + axe | `pnpm exec playwright test test/e2e/{mobile-shell,keyboard-nav,a11y}.spec.ts` | 24 passed (51.8s), exit 0 | ✓ PASS |
| Phase-1 flows still work on rebuilt screens | `pnpm exec playwright test test/e2e/{login-logout,change-password,system-status}.spec.ts` | 6 passed (20.0s), exit 0 | ✓ PASS |
| Unit suite (once) | `pnpm exec vitest run --project unit` | 26 files / 284 tests passed, exit 0 | ✓ PASS |
| Token guard rejects literals | stylelint on `.probe{color:#fff;border-radius:9px;font-family:Arial}` | 3 errors, exit 2 | ✓ PASS |
| Token guard clean on app CSS | `pnpm exec stylelint "ui/**/*.module.css" "app/globals.css" "app/**/*.module.css"` | exit 0 | ✓ PASS |
| `ui` cannot import `domain` | eslint on temp `ui/zz-verifier-probe/Probe.ts` importing `@/domain/auth/provider` | `boundaries/element-types` error, exit 1 (probe removed, tree clean) | ✓ PASS |
| Lint / typecheck | `pnpm exec eslint .` · `pnpm exec tsc --noEmit` | both exit 0 (boundaries v6 deprecation warnings = IN-07) | ✓ PASS |
| Commit hashes in SUMMARYs exist | `gsd_run query verify.commits` (24 hashes) | all_valid: true | ✓ PASS |
| Production build | `pnpm build` | not re-run (02-03 SUMMARY L192 claims success; dev compile of the out-of-app CSS import observed) | ? SKIP |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no PLAN/SUMMARY declares probes. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UX-01 | 02-01…02-07 | SYSTEM.md 먼저 확정, 모든 화면이 토큰·컴포넌트만 사용, 계약 5상태 필수, EMPTY·ERROR 다음 행동 | ✗ BLOCKED (partial) | SYSTEM.md 확정·5상태·다음 행동 ✓ (Truth 4); 컴포넌트 층 토큰 전용 ✓; 페이지 기본 타이포그래피가 UA 기본값 → "모든 화면이 그 토큰만 쓴다" 미충족 (Gap 1). REQUIREMENTS.md L270 marks it Complete — premature |

Orphaned requirements: none (REQUIREMENTS.md maps only UX-01 to Phase 2).

### Decision Coverage

`gsd_run query check.decision-coverage-verify`: All trackable CONTEXT.md decisions are honored by shipped artifacts (14/14, non-blocking).

### Prohibitions (judgment-tier, 21 items) — NON-AUTHORITATIVE LLM-judge verdicts, `unverified-prohibition — human review recommended`

| Plan | Prohibition (short) | Judge verdict | Evidence |
|------|---------------------|---------------|----------|
| 02-01 | 결정되지 않은 제품 동작을 지어내 확정 문장으로 적지 않는다 | not violated | 신설 절마다 체크포인트 항목(A①…E④) 표기; DECISIONS.md 6건 |
| 02-01 | 체크포인트 답이 E2E를 깨면 스펙을 고쳐 통과시키지 않는다 | not violated | Phase-1 스펙 3개 원문 유지, 6/6 통과 |
| 02-01 | 코드 먼저 쓰고 SYSTEM.md를 사후 수정하지 않는다 | not violated | 32d6c54(docs) → 4e6ec65(test) → cfa301d(code) 순서 |
| 02-01 | 시스템 이탈을 DECISIONS.md 기록 없이 처리하지 않는다 | **doubtful** | Gap 1의 무스타일 페이지 골격이 DECISIONS.md에 없다 |
| 02-02 | 경계 등록 전 ui/ 파일을 만들지 않는다 | not violated | 1408190 "add ui boundaries type before first ui/ file" precedes cfa301d |
| 02-02 | 간격·그림자까지 금지하지 않는다 | not violated | stylelint.config.mjs 규칙 3종은 색·서체·radius만 |
| 02-02 | 승인 없는 devDependency 금지 | not violated | stylelint(91a050d, D-20 승인) · @axe-core/playwright(02-07 체크포인트 승인, SUMMARY L… "승인") — 사람 확인 권장 |
| 02-03 | 로그인 실패 문구를 이메일 존재 구분형으로 바꾸지 않는다 | not violated | login-form.tsx:9 GENERIC_ERROR 단일 문구 |
| 02-03 | 서버 검증을 클라이언트 검증으로 대체하지 않는다 | not violated | next-safe-action validationErrors 그대로; a11y.spec.ts:97 서버 7자 거부 확인 |
| 02-03 | SessionRefresh를 루트 레이아웃에서 떼지 않는다 | not violated | app/layout.tsx:27 |
| 02-03 | lib/viewer.ts에 질의 문자열을 붙이지 않는다 | not violated | `git diff` on lib/viewer.ts across phase: untouched |
| 02-03 | tokens.css에 없는 색을 ui/ CSS에 도입하지 않는다 | not violated | 참조 토큰 전부 정의됨(comm 공집합) |
| 02-04 | 대응 화면 없다고 1차 메뉴를 빼지 않는다 | not violated | role-menu.ts TOP_BAR_MENU 5개 항상 |
| 02-04 | 역할→메뉴 매핑을 셸 컴포넌트에 흩지 않는다 | not violated | `isAdmin` grep → role-menu.ts only |
| 02-04 | 소속 자리를 그럴듯한 값으로 채우지 않는다 | not violated | TopBar renders `userName` only |
| 02-05 | 가짜 「내 차례」 데이터 금지 | not violated | `buildNextTurnView([])` |
| 02-05 | 빈 화면에 안내 문구 금지, 다음 한 수 버튼 | not violated | ListEmpty `action` 필수; 9 화면 확인 |
| 02-05 | 표 컴포넌트를 만들지 않는다 | not violated | ui/ 트리에 table/grid 없음 |
| 02-06 | 관리자 화면 접근 제어를 약화하지 않는다 | not violated | system-status/page.tsx:17-19 유지; E2E 직원 404 통과 |
| 02-06 | 서버 검증 메시지 문자열을 바꾸지 않는다 | not violated | change-password.spec.ts 통과 |
| 02-06 | 오류 화면에 사과 문구 금지 | not violated | `grep 죄송|사과|미안 app ui` → 0 |
| 02-07 | 접근성 검사 대상 축소·규칙 끄기 금지 | not violated | a11y.spec.ts: no disableRules/include/exclude; 6 screens |
| 02-07 | 승인되지 않은 의존성 금지 | see 02-02 row | — |
| 02-07 | 기존 스크린샷을 시각 회귀 기준선으로 재사용 금지 | not violated | no toHaveScreenshot in specs |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX in phase files | none | Debt-marker gate passes |
| `ui/input/TextField.module.css` | 31 | `::placeholder` (grep false positive) | ℹ️ Info | CSS pseudo-element, not a stub |
| `ui/next-turn/NextTurn.tsx` | 26 | `return null` | ℹ️ Info | §7-4 contract (block disappears at 0) |
| `test/e2e/a11y.spec.ts` | 79 | `expect(SCREENS).toHaveLength(6)` cannot fail meaningfully | ℹ️ Info | IN-02 (known); the six real per-screen tests carry the proof |
| `ui/toast/Toast.tsx` | — | component with no importer | ⚠️ Warning | Orphaned until a screen needs a toast; WR-05 open |
| `ui/shell/TopBar.tsx` / `BottomTabs.tsx` | 79-84 / 50-52 | `aria-current` never set → §6-0 current-menu underline dead | ⚠️ Warning | WR-01 (known, open by user decision). Shell deviates from §6-0/§1-3 contract but does not falsify a criterion on its own; fold into Gap 1's fix if desired |
| `ui/shell/TopBar.tsx` | 57-62, 89-100 | `role="menu"` without arrow keys; no close on Tab-out/outside click | ⚠️ Warning | WR-02/03 (known). Keyboard-only path still completes (tested), so criterion 3 holds |
| `app/(app)/*` pages | — | auth only in layout (Next 16: bypassable) | ⚠️ Warning | WR-07 (known). No data exposed by these pages today; must be fixed before Phase 4 per review |
| `app/(app)/account/logout-button.tsx`, TopBar, MoreSheet | — | no `signOut()` failure handling | ⚠️ Warning | WR-06 (known) |

Test-quality audit: no `.skip/.only/.todo` in phase test files; `writeFileSync` hits are Phase-1 deploy-script tests seeding temp dirs (not circular); assertion strength for criterion 3 is behavioural (multi-step keyboard flows, measured geometry).

### Human Verification Required

See frontmatter `human_verification` (7 items): Windows Pretendard/digit alignment/transfer size (D-32); tablet 700–1023; 375 px visual quality; `/design-review` + `/qa`; 「내 차례」 phone two-line layout (no data yet); confirmation of the 21 prohibition verdicts; §7-12 EMPTY exception decision.

### Gaps Summary

**One gap, one root cause.** The component layer is genuinely token-only — 0 literals across `ui/**` and `app/**` CSS (my grep, stylelint clean, negative probe rejected), every referenced custom property exists in `tokens.css`, the single new token went through DECISIONS.md + SYSTEM.md, and all four Phase-1 screens were rebuilt on `ui/` components with the old files gone. But the **page layer beneath the components is still unstyled**:

- `docs/design/tokens.css` declares only `:root` custom properties (no element rules), and `app/globals.css` ports just `font-family` from the mockup's body rule (`docs/design/system/form-expense.html:18` also sets `background:var(--bg); color:var(--fg); font-size:var(--fs-base); line-height:var(--lh-body); letter-spacing:var(--ls-body); word-break:keep-all; overflow-wrap:anywhere`).
- Consequence in the deployed app: body text colour is the UA default (not `--fg`), body size is 16 px (not `--fs-base` 14/15 px), `--lh-body`/`--ls-body` are never referenced, every screen title `<h1>` (홈·5 primary menus·설정·내 계정·시스템 상태·404×2·오류) is UA `2em bold` instead of SYSTEM.md §6-0 L290 (`--fs-lg` + subtitle `--fs-sm --muted`), the login failure `<p role="alert">` has no `--danger` (§6-7), the system-status `<dl>` ignores §6-8 B①, and none of §4-4's browser default surfaces (`::selection`, `caret-color`, `accent-color`, `scrollbar-color`) is set although §4-4 says they must not be left at defaults.
- The executor's own 02-05-SUMMARY.md:59 calls this "account/system-status 페이지와 같은 무스타일 관례". It is not recorded in `docs/design/DECISIONS.md` (6 entries dated 2026-09-19, none about page chrome), so under CLAUDE.md's 프론트엔드 rule it is an unrecorded deviation, and it is exactly the "무스타일 임시 화면" quality that criterion 2 says must not remain.

The fix is small and local: port the body rule and §4-4 surfaces into `app/globals.css` (token references only, so stylelint still passes), add a screen-title/subtitle rule or a tiny `ui/` page-header component, and style the login alert and the status `dl`. No later phase in the ROADMAP covers base typography (checked Phase 3–11 goals/SCs), so this is not deferrable. If the user instead judges page chrome out of Phase 2 scope, the path is a DECISIONS.md entry + SYSTEM.md correction, then an `overrides:` entry here.

Everything else the phase set out to do is in the code and was exercised: 30 E2E tests and 284 unit tests ran green in this verification environment, the `ui` boundary and the token guard both reject probes, and the SYSTEM.md contracts for criteria 4 and 5 are complete.

---

_Verified: 2026-09-19T18:53:19Z_
_Verifier: Claude (gsd-verifier)_
