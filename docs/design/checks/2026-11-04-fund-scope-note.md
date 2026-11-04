# 권한표 자금 본부 표지 · 미지정 잠김 한 줄 — 점검표
화면: app/(app)/admin/permissions/, ui/permission-grid/, app/(app)/pnl/page.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-13 (체크박스 매트릭스 — 07.3 D-7318 그룹 줄 본부 조건 표지)

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 추가한 글자는 그룹 줄 표지 「경영관리본부만」(명사형 보조 글자)과, 설정이 비었을 때만 서는 잠김 한 줄 `자금 기능 본부 미지정 · 설정` 하나다. 도움말 문단 · 툴팁 없음(DECISIONS 2026-11-04 버린 대안)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 표지 이름은 readFundDivision(자금 게이트와 같은 출처)이 채운다. 관리자가 고를 것 없음
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 잠김 한 줄의 「설정」 링크는 admin.settings 보기 권한자에게만 그린다(권한이 없으면 링크 없는 글자만, T-07.3-04-04)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 해당 없음 — 권한표는 칸 즉시 저장 화면이고 버튼 변경 0. 잠김 줄의 「설정」은 3차 링크
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 위험 동작 추가 0
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 표지는 그룹 줄에 한 번(PC) 또는 값 칸에 한 번(폰, 라벨에는 붙이지 않음). 자금 본부 미지정은 표지 「자금 본부 미지정」과 표 위 잠김 한 줄이 다른 일을 한다(표지 = 어디가 막혔나, 한 줄 = 고칠 길)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 화면 변경 0
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 표지는 비대화형 글자, 체크박스 Tab 순서 변경 0. 잠김 줄 「설정」은 기존 링크(Tab 도달). 표지는 aria-describedby로 읽힌다(E2E permissions-grid)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 「설정」은 projects/settlement 선례와 같은 3차 링크 클래스

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 색 · 표 · 패널 변경 0. 이 변경 자체는 D-7318(사용자 문구 「<본부>만」)이며 DECISIONS.md 기록 뒤 SYSTEM.md §7-13을 고쳤다

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `.groupNote`는 `--s-2` · `--text-muted` · `--text-aux` · `--fw-regular`만(CSS diff에 색 · px 없음), `.mobileCell`에 `align-items: center`만 더했다. 새 클래스 이름은 `.groupNote` 하나
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: E2E permissions-grid 폰 375 · 320(scrollWidth <= innerWidth · 표지 행 라벨 줄 수 · dt 71px = main 기준선) · 체크박스 44px 그대로 · DOM 실측 measurements-state-fund-note-default.json
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /tmp/claude-0/-home-user-ERP-PLANT8-260917/30ed6bf6-3ae4-50c2-9db0-a6fc33c75269/scratchpad/capture-07.3-04/state-fund-note-default-{1280,768,375,320}.png · state-fund-note-unset-{1280,768,375,320}.png (CI=true 프로덕션 빌드, 판정은 같은 폴더 measurements-*.json의 DOM 수치 — 독립 DOM 감사 결과는 이 파일 아래 감사 표에 이어 적는다)
