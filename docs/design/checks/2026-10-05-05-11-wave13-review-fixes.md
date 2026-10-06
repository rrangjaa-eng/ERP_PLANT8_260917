# 05-11 웨이브 13 검토 수정 — 점검표
화면: app/(app)/projects/[id]/status-change.tsx, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/project-detail.module.css, app/(app)/projects/[id]/settlement-button.tsx, app/(app)/projects/[id]/settlement/, app/(app)/approvals/approval-sheet.tsx, app/(app)/approvals/approval-sheet.module.css, app/(app)/approvals/inbox-table.tsx, app/(app)/home-approval-actions.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §3(터치 목표) · §6-2 상세 화면 · §7-8 결재 시트 · 04.1 행동 줄 · UI-SPEC 05 S10 · 확정 #3 · #4

지금 화면(고치기 전, 웨이브 13 DOM 실측):
- F1 `status-change.tsx` — 「완료로 바꾸기」 확인 문구 갈래가 남아 있으나 갈 곳 목록에 완료가 없어(전이 표 via: approval) 그려지지 않는 죽은 갈래다.
- D1 `/projects/[id]` 정산 상태 — 머리 줄 행동 묶음이 수화 뒤 h 100→44로 줄고 x가 오른쪽으로 옮아(폰 16→161, 768 313→520) 아래 표 · 기간 줄이 56px 올라온다. CLS 375 0.164–0.257 · 320 0.113–0.26 · 768 0.135–0.16. 원인: 1차 「일괄 저장」을 JS 폭 판정(`useEditableWidth` — 서버 스냅숏 참)으로 넣었다 빼서 서버 렌더에는 있고 수화 뒤 1024 미만에서 사라진다. 폰은 수화 뒤 DOM 순서(상태 행동 → 더보기)가 바뀌어 버튼도 옆으로 움직였다.
- D2 폰 결재 시트의 막힌 `승인` — 이유 `진행으로 바뀜 · 반려`가 버튼 옆 63×42(320 58×42)로 끼어 두 줄로 접힌다. 문서 화면 행동 줄은 버튼 아래 한 줄(100×21).
- D3 폰 `/approvals` 시트 `승인` 뒤 포커스가 BODY다(PC 행 승인은 다음 줄 열기).
- 사용자 확정(10/5 16:14) — 문서 화면 `정산 결재 다시 올리기` 성공 토스트에 `되돌리기`가 없다(첫 올리기 머리 줄에만 있음).

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자 0. 다시 올리기 토스트는 첫 올리기 토스트와 같은 문구 틀(`{라벨} · 결재 요청됨 → {담당}` · `되돌리기 · 결재 멈춤` · 늦으면 서버 원문 `{대표}이 HH:MM에 승인함` + `새로 고침`) — 한 훅 `useSettlementSubmitToast`가 둘 다 그린다. F1은 그려지지 않던 문구 한 갈래 삭제.
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 입력 · 선택지 변화 없음. 다시 올리기도 확인 창 없이 즉시 + 되돌리기(확정 #4 — 확인 창 대신 되돌리기).
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 1024 미만 · 바뀐 칸 0이면 「일괄 저장」은 지금처럼 보이지 않는다(04-49 R1 그대로, 판정만 JS → CSS `@media (max-width: 1023.98px)`). 막힌 `승인`은 aria-disabled + 이유 그대로(E2E D2 `aria-disabled=true`).
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 머리 줄 1차는 「일괄 저장」 하나(폰에서는 편집이 생길 때만 보임 — getClientRects로 세는 design-principles 원칙 점검은 보이는 1차만 센다), 시트는 `승인` 1차 하나.
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 시트 `반려`(2차 왼쪽) · `승인`(1차 오른쪽) 순서 · 폭 2:1 그대로(`.buttons` align-items만 바꿈 — mobile-leave-approval 행동 줄 폭 단언 통과).
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 이유 글자 하나가 버튼 아래로 옮겨갔을 뿐 글자 수 불변.
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음(빈 화면 변경 없음).
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: D3 — 폰 결재함 시트 `승인` 뒤 포커스가 다음 줄의 열기(문서 칸 버튼)로 간다(E2E D3 `toBeFocused`, 사용자 결정 10/5 12:41 `승인`으로 가지 않음). 첫 화면 시트 승인도 같은 `useRefreshThenFocus` 길(다음 줄 열기 · PC 대상 글자). 다시 올리기 Ctrl+Enter 그대로, 토스트 `되돌리기`는 Toast 포커스 계약 그대로. 머리 줄 폰 Tab 순서(수화 뒤 상태 행동 → 더보기 → 1차)는 그대로이고 수화 전 보이는 순서를 CSS order로 같게 맞췄다.
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 시트 막힘 이유 줄이 문서 화면 행동 줄(`document-actions.module.css` 05-11 폰 규칙)과 같은 배치(1차 아래 한 줄 · 두 버튼 윗줄 맞춤). 다시 올리기 토스트가 첫 올리기 토스트와 같은 모양.

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: DR4(폰 아래 시트) · 폰 결재 행동 줄 반려 왼쪽 · 승인 오른쪽(2026-09-29) · ② 행동 버튼 44 · ① PC 1차 위치 그대로(1024 이상은 `.saveSlot`이 display: contents라 배치 불변). 사용자 확정 10/5 12:41(승인 뒤 포커스 = 다음 줄 열기) · 10/5 16:14(다시 올리기 되돌리기)를 따랐다.

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 더한 CSS는 `display: contents` · `display: none` · `order: 1 | 2` · `align-items: flex-start` · `flex-wrap: wrap`뿐(값 토큰 없음). `pnpm lint` 0.
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: CI=true 빌드 E2E `mobile-settlement-wave13.spec.ts` D1 — 정산 상세 CLS 0.1 미만 9상태(320 · 375 · 768 × 문서 없음 PM · 결재 중 PM · 대표) · D2 이유 top ≥ 버튼 bottom · 1줄(375 · 320). `mobile-touch-targets` · `mobile-320-no-overflow` 회귀 통과(SUMMARY 「웨이브 13 검토 수정」).
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 없음 — 판정은 CI=true 빌드 DOM 실측(layout-shift 누적 · getBoundingClientRect · Range 줄 수 · document.activeElement, 스크린샷 육안 판정 금지). 독립 DOM 감사는 오케스트레이터의 웨이브 화면 검토가 다시 돈다.
