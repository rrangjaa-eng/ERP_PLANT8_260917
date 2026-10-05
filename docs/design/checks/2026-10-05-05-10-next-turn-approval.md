# 05-10 첫 화면 「내 차례」 [결재] 행 행동 · 결재 시트 지출결의 본문 — 점검표
화면: app/(app)/page.tsx, app/(app)/home-approval-actions.tsx, app/(app)/home-approval-actions.module.css, app/(app)/approvals/, ui/next-turn/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md 「내 차례」 · 결재 시트 · UI-SPEC 05-10(Z3 A · 증빙 썸네일 72×96)

지금 화면(고치기 전): 첫 화면 「내 차례」 블록에는 `[결재]` 지출결의 행을 눌러 승인할 길이 없다(행은 링크 한 개, 결재 시트는 `/approvals`에서만 열린다). 결재 시트에는 지출결의의 증빙 썸네일 · 세율 바뀜 줄이 없다.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류 · 되돌릴 수 없는 일 · 잠김뿐이고 명사형 한 줄이다 — 근거: 새 설명문 0. 행 글자는 `대상 — 상황` 한 줄(E2E `지출결의, 박서연`), 시트 증빙 줄은 파일명 · 용량뿐(shots/sheet-390.png).
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 행 숫자 · 계산 줄 · 세율 바뀜은 서버가 계산해 준다(integration `next-turn.test.ts` 계산 줄 3행). 사용자는 `열기` → `승인` 두 번.
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 승인이 막힌 행은 `승인` 대신 이유 글자(서버 원문)만 서고(PC), 시트는 `승인` aria-disabled + 이유(approveBlockedReason 기존 계약). `크게 보기`는 주소 함수가 있을 때만 그린다.
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 폰 행 = `열기` 탭 하나(1차 모양 아님 3차), 시트 = `승인` 1차 하나(E2E sheet `승인` 버튼 1개, shots/sheet-390.png). PC 행은 `승인` · `반려` 모두 tertiary.
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 반려는 시트 2차 왼쪽 · 1차 두 배 폭 그대로(approval-sheet.module.css `.buttons` 변경 없음). 삭제성 동작 신설 없음.
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 시트 증빙 라벨 `증빙` 아래 파일명만, 행의 `[결재]` 태그와 글자 중복 없음(`reason` 비면 이유 span을 그리지 않는다).
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 이 작업에서 빈 화면은 승인 뒤 블록째 사라지는 것뿐(E2E `내 차례` heading 0).
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 행 `열기`는 `button`(Tab · Enter), 시트는 SidePanel 첫 포커스 · Esc · 연 요소로 포커스 복귀 그대로, PC 행 승인 · 반려는 `aria-describedby`로 그 줄 글자와 이어진다.
- [x] 같은 종류의 행동은 같은 모양이다(링크 · 버튼 섞지 않음) — 근거: 폰 행 탭은 `nextTurnStyles.tertiary`(기존 3차 링크 모양)와 같은 모양, `::after`로 행 전체를 덮어 터치 44 이상(E2E 높이 실측).

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 결재 시트는 공용 옆 패널(SidePanel) 그대로, 폰 시트 2차 왼쪽 · 1차 두 배(2026-10-01) 그대로, 썸네일 radius 0 · 72×96. 사용자가 정한 증빙 붙임 주체(경영관리 권한자)는 문구에만 영향.

## 시스템
- [x] 새 색 · 서체 · radius · 그림자를 만들지 않았다(tokens.css 변수만) — 근거: 추가 CSS 값은 `var(--s-*)` · `var(--text-*)` · `var(--surface-*)` · `var(--status-danger)` · `calc(var(--s-6) * 3)` · `calc(var(--s-12) * 2)` · `var(--icon-sm)`뿐. stylelint 0.
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 새 요소가 `min-width: 0` · `overflow-wrap: anywhere` · flex wrap으로 폭 안에 있고, 폰 375 E2E(`mobile-next-turn-approval` · `mobile-next-turn`) 3 passed. 행 탭은 `::after`로 행 전체.
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 스크래치패드 `shots10/home-390.png` · `home-1280.png` · `sheet-390.png`(CI=true 빌드). 판정은 E2E DOM 실측(`mobile-next-turn-approval.spec.ts`).
