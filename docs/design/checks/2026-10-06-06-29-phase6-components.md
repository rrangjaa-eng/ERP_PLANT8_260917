# 06-29 Phase 6 공용 조각 — 점검표
화면: app/(app)/dev/components/, ui/table/, ui/list-screen/, ui/pick-dialog/, ui/confirm-dialog/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 (카) · §7-7 · §7-8 · §7-17 · §7-20

## 원칙
- [x] 안내 문구: 새 설명문 없음. 선택 표의 글자는 고를 수 없는 이유 · 막힘 이유(명사형 한 줄)와 1차 이유 `고른 건 없음`뿐이고 힌트 줄은 낱말 + kbd(`고르기 Space`) — 근거: gallery-client.tsx SelectTableSample의 문구 전부가 이 셋(설명문 0), Table.tsx 이유 글자는 `selectable().reason`·`blockedReason()`을 그대로 그림
- [x] 결정 최소: 고를 수 있는지는 서버(호출자)가 행마다 보내고 표는 묻지 않는다, 1차 N은 시스템이 센다 — 근거: SelectTableSample `chosen = reconcileSelection(...)`이 N을 계산, 사용자가 정하는 것은 체크 하나
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다: 못 고르는 행 체크박스 `aria-disabled` + 이유 글자, 0건이면 1차 `aria-disabled` + `고른 건 없음` — 근거: E2E 「표 선택」이 `aria-disabled` 클릭 무반응과 describedby 이유 글자를 단언(녹색). Task 2: E2E 「고르기 목록」이 로드 · 오류 중 1차 `aria-disabled`, 고를 수 없는 행 `aria-disabled` + 2행 이유, `막힘`의 1차 비활성 + 바닥 줄 한 자리를 단언(녹색), ConfirmDialog `loading` 1차 `aria-disabled` + `…` describedby는 confirm-dialog.test 단위
- [x] 주 버튼 하나: 표본 행동 줄의 `지급 완료 N`이 1차 하나, ListScreen 버튼 갈래도 필터 줄 오른쪽 끝 1차 하나 — 근거: list-screen.test 「버튼 갈래」 `data-ui="primary-button"` 1개, E2E `[data-ui="primary-button"]` 단일. Task 2: PickDialog · ConfirmDialog 1차는 각 모달 행동 줄 오른쪽 하나이고 다음 한 수 · `다시 시도`는 3차 · 2차로 내렸다(E2E 「고르기 목록」 `다시 시도` 2차)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다: 해당 없음(삭제 없음), 막힘 이유만 `--status-danger` — 근거: Table.module.css `.selectBlocked { color: var(--status-danger) }`, PickDialog 오류 줄 `.error`가 `--status-danger`(E2E가 계산 색 = 토큰 값 단언)
- [x] 같은 말을 두 번 하지 않는다: 체크박스 접근 이름은 행 이름 + `고르기`(화면 글자 아님), 이유는 행 안 한 번 — 근거: table-selection.test 접근 이름 · 이유 id 연결 단위, 이유 글자는 describedby로만 연결(중복 렌더 없음). Task 2: E-24 — `noneSelectableReason`을 주면 본문 고정 줄을 그리지 않아 같은 뜻이 바닥 줄 한 자리에만 선다(E2E `막힘`이 `고를 수 있는 줄이 없습니다` 0개를 단언)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다: 이 변경은 빈 화면을 건드리지 않음(`ListScreen` `empty`면 버튼 갈래 1차도 숨김 규칙 그대로) — 근거: list-screen.test 「empty를 넘기면 버튼 갈래 1차도 그리지 않는다」
- [x] 키보드만으로 끝난다: 활성 셀에서 `Space` 고르기 · `Ctrl+Enter` 1차 · 체크박스 Tab/Space 네이티브 · 머리글 체크박스 — 근거: E2E 「표 선택」이 Space · Ctrl+Enter를 키보드로만 실행(녹색), quote-table E2E 녹색(`selection` 없는 표의 키 동작 불변). Task 2: `?panel=pick` E2E가 목록 Esc는 목록만 닫고 포커스가 `견적 줄 바꾸기`로 돌아오며 Ctrl+Enter는 패널 제출로 번지지 않음을 단언(녹색), expense-new · expense-a11y E2E 녹색
- [x] 같은 종류의 행동은 같은 모양이다: 1차는 `Button variant="primary"`(kbd 병기), 선택 면은 범위 선택과 같은 `--accent-weak` — 근거: ListScreen 버튼 갈래가 `Button` 그대로, Table.module.css `.selectedRow`가 `.selectedCell`과 같은 토큰

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 없음 · 견적 엑셀식 표 키보드 불변 · 옆 패널/모달 변경 없음 · 스킨 A 그대로) — 근거: quote-table E2E 녹색, use-grid-keyboard.ts·tokens.css diff 0, 새 면은 흰 표 면 + `--accent-weak`, 고르기 목록 · 확인 모달은 05 · 04.6 모달 골격 그대로(옆 패널 위 겹침은 모달/시트 위 시트 — 확정 §7-8 SP-8), `ui/confirm-dialog`에 검색 갈래 없음

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: Table.module.css · ListScreen.module.css 추가분이 `--accent-weak` `--native-accent` `--row-number-w` `--cell-pad-x` `--text-muted` `--status-danger` `--text-aux` `--s-1` 등 기존 토큰뿐, stylelint 통과, tokens.css diff 0. Task 2 추가분(`.attachments` `.loadingMark` `.error` `.resultRow`)도 `--s-12` `--s-2` `--line-w` `--text-muted` `--text-aux` `--status-danger` 기존 토큰뿐
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px: 1280 · 768 · 375 · 320 네 폭에서 문서 가로 넘침 0, 폰 시트 1차 · 취소 · 3차 `견적 외 비용으로` · `다시 시도` 모두 높이 44, 선택 표 · ListScreen 버튼 갈래는 1024 이상 전용(DR-36, 선택 열 칸 체크박스는 편집 표처럼 PC 입력) — 근거: 실행자 자체 DOM 실측(임시 Playwright, CI=true 빌드, 커밋 안 함 · 독립 감사 아님) 49개 판정 PASS · FAIL 0, 결함 셋(폰 첨부 칸 상한 · 긴 부제 title · 폰 `다시 시도` 40)은 고쳐 재실측 PASS
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 스크린샷 없음(스크린샷 육안 판정 금지) — CI=true 프로덕션 빌드 `/dev/components` · `?panel=pick`을 1280 · 768 · 375 · 320에서 DOM 실측(칸 폭 44 · 고른 행 계산 색 = `--accent-weak` · 막힌 행 배경 투명 · 오류 줄 = `--status-danger` · 첨부 칸 = 첫 세 행 높이 ±0 · 겹침 높이 ≤ `--sheet-max-h` 704), 독립 4폭 감사는 오케스트레이터가 별도 에이전트로 한다
