# 05-15 견적 줄 표 행 행동 셀 나머지 갈래 · 표 위 한 줄 · Ctrl+E · 힌트 줄 — 점검표
화면: app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/project-detail.module.css, ui/row-actions/RowActions.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 · §7-9 · 05-UI-SPEC S1 · Copywriting 「막힘 — 견적 줄 행 행동」

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 전부 UI-SPEC Copywriting 원문 — 셀 이유 `거래처 없음` · 표 위 한 줄 `2차 고객 승인 전 · 고객 승인 표시`(서버가 보낸 문자열 그대로, 완료는 기존 잠김 줄이 말해 다시 쓰지 않음) · 합계 행 `저장 안 한 편집 N칸 · 먼저 일괄 저장`(DR-6 함수 `unsavedEditsReason`) · 힌트 줄 `지출결의 올리기 Ctrl+E`. 설명문 0개, 모두 명사형 한 줄(E2E `행 행동 갈래`가 글자를 단언)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 어느 줄에 어떤 행동이 서는지는 서버 `listLineDoors`가 판정해 보낸 값(`door.state` · `tableGateReason`)만 그리고 화면은 추론하지 않는다. 거래처 없음 vs 거래처 정보 가림(vendor.value)도 서버 판정이라 섞이지 않는다(E2E: 가린 계급에서 거래처 있는 줄 = `지출결의 올리기`)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 표 전체 게이트 중에는 `지출결의 올리기`를 렌더하지 않고 이유를 표 위 한 줄로(E2E 단언: 버튼 0개 · 이유 1개). 취소 · 조정 · 견적 외 비용 줄은 빈 셀. 700~1023 · 거래처 열 없는 계급은 `거래처 고르기`를 그리지 않는다(갈 칸이 없다). 누르는 동안 같은 열 나머지 버튼은 `aria-disabled`(E2E)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 화면 1차 `일괄 저장`은 건드리지 않았다. 행 셀은 줄마다 3차 행동 하나(`지출결의 올리기` 또는 `지출결의 열기` 또는 `거래처 고르기`)이고 거래처 없음 줄도 3차는 하나다
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 위험 동작 추가 없음. 이유 글자 `거래처 없음`과 실패 · 미저장 편집 한 줄은 `--status-danger`(`.doorNoVendor` · 합계 행 danger 항목)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 표 전체 게이트 이유는 표 위 한 줄 하나뿐이고 합계 행에 다시 쓰지 않는다. `완료`는 기존 `완료 · 견적 줄 잠김` 줄이 말해 게이트 이유를 겹쳐 쓰지 않는다(`status !== "completed"` 조건). 힌트 줄은 복사 · 붙여넣기를 `범위 복사 Ctrl+C / 붙여넣기 Ctrl+V` 하나로 합쳐 7개를 지킨다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 화면 변경 없음(`emptyAction` 불변)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 편집 중이 아닐 때 `Ctrl+E`가 활성 셀 줄의 셀 동작과 같다(`preventDefault` — `ui/table/use-grid-keyboard.ts`, 단위 4건 + E2E: 항목 칸에서 Ctrl+E → `/expenses/…`). 셀의 3차는 `tabIndex -1`로 격자 로빙(탭 정지 1개)에서 빠지고 `aria-describedby` = 그 줄 항목 칸 id(E2E 단언). 힌트 줄 끝에 `지출결의 올리기 Ctrl+E`
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 모든 셀 행동이 `RowActions`의 `RowAction`(이동이면 href 링크 `지출결의 열기`, 아니면 button `지출결의 올리기` · `거래처 고르기`)이고 새 컴포넌트가 없다. `RowAction`에 선택 prop 둘(`busy` · `tabIndex`)만 더했고 기존 호출부는 그대로다

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 견적 표 안 편집 · 엑셀 키 · 열 순서 불변(E2E `quote-table` · `ledger-save-flow` · `quote-revisions` 회귀 통과), 모달 · 옆 패널을 더하지 않았다, 거래처 정보를 가린 계급의 거래처 열 없음(사용자 결정 2026-10-01)을 그대로 지킨다

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 새 CSS는 `project-detail.module.css`의 `.doorNoVendor` 한 규칙(`--status-danger` · `--text-aux` · `white-space: nowrap`)뿐이고 `pnpm lint`(stylelint) 0 · `node scripts/design/mark-legacy.mjs --audit "app/(app)/projects"` 종료 코드 0 · `docs/design/tokens.css` diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 이 변경은 PC(≥700) 표 행동 셀과 키 처리다. 폰(<700)은 행 시트 `action` 자리를 건드리지 않았고(상태 값만 Task 1에서 `StatusTag`로) `mobile-expense-form.spec.ts`(375 · 320 가로 넘침 0 · 3차 높이 ≥ `--touch-min`)를 다시 돌려 통과를 확인했다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 판정은 스크린샷 육안이 아니라 `CI=true` 프로덕션 빌드의 DOM 단언(E2E `행 행동 갈래` 7건 — 1280 · 800 폭 · 가림 계급, 셀 텍스트 · 버튼 수 · aria-disabled · tabindex · URL) — 별도 촬영 없음, 독립 DOM 감사 · `/design-review`는 오케스트레이터 몫
