# 07-28 지출결의 `상세` 칸(SC-02 ④ · N8 · J13) — 점검표
화면: app/(app)/expenses/[id]/expense-form.tsx, app/(app)/expenses/[id]/expense-document.tsx, app/(app)/expenses/[id]/loading.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-2 입력 · 오류 표시 · 07-UI-SPEC SC-02 ④(라벨 `상세` · 오류 `상세 · 입력`)

## 시작 상태(코드 전)
- 폼 칸 라벨 `비고`(선택, 비어도 제출), 지출결의 상세 화면 정보 행 `비고`, 로딩 뼈대 라벨 `비고`, 길이 문구 `비고 480자 넘음`.
- 제출 막힘 이유 표(EXPENSE_REQUIRED_FIELDS)에 이 칸이 없다 — 비어도 1차 `지출결의 제출`이 열린다.
- 폼의 `비고` 칸은 접힌 영역 밖(폼 본문 한 줄 칸)에 있다 — 폰에서도 펼침(INV-DEC:25)을 바꿀 일 없음, 독립 DOM 감사가 375 · 320 실측.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 더한 글자는 칸 아래 오류 `상세 · 입력` 한 줄(gate.ts NOTE_REQUIRED, 원인 · 다음 행동 꼴)과 1차 옆 이유 `상세 비어 있음 · 상세 입력`(기존 빈 칸 이유 꼴)뿐 — 설명문 · placeholder 없음
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 칸 하나의 이름 바꿈 + 필수화, 새 선택 없음 · 제출 판정은 서버 한 길(firstExpenseSubmitBlock)이라 화면이 따로 검사하지 않는다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 상세가 비면 1차가 aria-disabled(기존 막힘 이유 방식 그대로)이고 누르면 그 칸으로 포커스 + 칸 오류, 임시 저장은 열려 있다
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 1차 `지출결의 제출` 하나 그대로, 버튼 추가 없음
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 변경에 위험 동작 없음
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 칸 안 placeholder 없음, 라벨 `상세` 한 번 · 오류 줄은 라벨을 되풀이하지 않고 `상세 · 입력`(원인 없는 다음 행동 꼴 — UI-SPEC 확정 카피)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음(빈 화면 아님)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: Ctrl+Enter · 1차 누름이 막힘 대상 `#note`로 포커스(TARGET_FIELD note) — E2E expense-detail-required.spec.ts toBeFocused
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 새 행동 없음, 기존 `Form.Field` · `Form.Error`

## 사용성 두 질문(SC-02 `상세`)
- [x] 문구 없이 이해되나 · 사용자가 하지 않아도 될 결정이 남았나 — 근거: 라벨이 `비고`(무엇을 적을지 모호) → `상세`로 바뀌어 칸 이름이 요구를 말하고, 필수 표시 `*` 없이 비면 1차가 이유를 말한다(SYSTEM §7-2 「필수인데 비면 제출 버튼이 이유를 말한다」). 새 결정 없음

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 폼 구조 · 칸 모양 그대로(여러 줄 칸 변경은 07-REVIEWS 보류), 색 · 패널 변화 없음

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 이 변경은 .tsx 문자열 · 오류 상태 속성(aria-invalid · aria-describedby → 기존 Form.Error)뿐, CSS 파일 변경 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: test/e2e/expense-detail-widths.spec.ts(CI=true 프로덕션 빌드)가 375 · 320 · 768 · 1280에서 `#note`가 details/hidden 밖(inCollapsed false) · 칸 오른쪽 ≤ 화면 폭(375→359 · 320→304) · 제출 막힘 뒤 `#note-error` 높이 21 · 잘림 false · 문서 가로 스크롤 false를 실측해 통과 — 칸은 기존 Form.Field width="long" 그대로, 독립 DOM 감사 보고서는 오케스트레이터 몫
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(육안 금지) — CI=true DOM 실측 expense-detail-widths.spec.ts · expense-detail-required.spec.ts 단언
