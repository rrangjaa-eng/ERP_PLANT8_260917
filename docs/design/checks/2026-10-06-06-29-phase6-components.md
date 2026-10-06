# 06-29 Phase 6 공용 조각 — 점검표
화면: app/(app)/dev/components/, ui/table/, ui/list-screen/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 (카) · §7-20

## 원칙
- [x] 안내 문구: 새 설명문 없음. 선택 표의 글자는 고를 수 없는 이유 · 막힘 이유(명사형 한 줄)와 1차 이유 `고른 건 없음`뿐이고 힌트 줄은 낱말 + kbd(`고르기 Space`) — 근거: gallery-client.tsx SelectTableSample의 문구 전부가 이 셋(설명문 0), Table.tsx 이유 글자는 `selectable().reason`·`blockedReason()`을 그대로 그림
- [x] 결정 최소: 고를 수 있는지는 서버(호출자)가 행마다 보내고 표는 묻지 않는다, 1차 N은 시스템이 센다 — 근거: SelectTableSample `chosen = reconcileSelection(...)`이 N을 계산, 사용자가 정하는 것은 체크 하나
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다: 못 고르는 행 체크박스 `aria-disabled` + 이유 글자, 0건이면 1차 `aria-disabled` + `고른 건 없음` — 근거: E2E 「표 선택」이 `aria-disabled` 클릭 무반응과 describedby 이유 글자를 단언(녹색)
- [x] 주 버튼 하나: 표본 행동 줄의 `지급 완료 N`이 1차 하나, ListScreen 버튼 갈래도 필터 줄 오른쪽 끝 1차 하나 — 근거: list-screen.test 「버튼 갈래」 `data-ui="primary-button"` 1개, E2E `[data-ui="primary-button"]` 단일
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다: 해당 없음(삭제 없음), 막힘 이유만 `--status-danger` — 근거: Table.module.css `.selectBlocked { color: var(--status-danger) }`
- [x] 같은 말을 두 번 하지 않는다: 체크박스 접근 이름은 행 이름 + `고르기`(화면 글자 아님), 이유는 행 안 한 번 — 근거: table-selection.test 접근 이름 · 이유 id 연결 단위, 이유 글자는 describedby로만 연결(중복 렌더 없음)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다: 이 변경은 빈 화면을 건드리지 않음(`ListScreen` `empty`면 버튼 갈래 1차도 숨김 규칙 그대로) — 근거: list-screen.test 「empty를 넘기면 버튼 갈래 1차도 그리지 않는다」
- [x] 키보드만으로 끝난다: 활성 셀에서 `Space` 고르기 · `Ctrl+Enter` 1차 · 체크박스 Tab/Space 네이티브 · 머리글 체크박스 — 근거: E2E 「표 선택」이 Space · Ctrl+Enter를 키보드로만 실행(녹색), quote-table E2E 녹색(`selection` 없는 표의 키 동작 불변)
- [x] 같은 종류의 행동은 같은 모양이다: 1차는 `Button variant="primary"`(kbd 병기), 선택 면은 범위 선택과 같은 `--accent-weak` — 근거: ListScreen 버튼 갈래가 `Button` 그대로, Table.module.css `.selectedRow`가 `.selectedCell`과 같은 토큰

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 없음 · 견적 엑셀식 표 키보드 불변 · 옆 패널/모달 변경 없음 · 스킨 A 그대로) — 근거: quote-table E2E 녹색, use-grid-keyboard.ts·tokens.css diff 0, 새 면은 흰 표 면 + `--accent-weak`

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: Table.module.css · ListScreen.module.css 추가분이 `--accent-weak` `--native-accent` `--row-number-w` `--cell-pad-x` `--text-muted` `--status-danger` `--text-aux` `--s-1` 등 기존 토큰뿐, stylelint 통과, tokens.css diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px: 선택 표 1차는 편집 표와 같이 1024 이상(DR-36)이라 버튼 갈래는 1024 미만에서 그리지 않는다. 선택 열 칸 44px 폭은 표 전체 폭에 더해지는 고정 열 — 근거: ListScreen.module.css `.bar > .wideOnly` 1023.98px 숨김, 선택 열 칸 폭 E2E 실측 44px, 폰 폭 실측은 Task 3 감사가 한다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 스크린샷 없음 — CI=true 프로덕션 빌드 `/dev/components` 「표 선택」을 Playwright DOM 실측(칸 폭 44 · 고른 행 계산 색 = `--accent-weak` · `aria-selected` 0)으로 확인(test/e2e/dev-components.spec.ts), 4폭 독립 감사는 Task 3
