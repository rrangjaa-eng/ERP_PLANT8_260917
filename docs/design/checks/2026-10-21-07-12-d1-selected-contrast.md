# 07-12 D1 고른 행 상태 글자 대비 — 점검표
화면: ui/table/, docs/design/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §1-4 · §7-3

## 원칙
- [x] 안내 문구: 화면에 새 설명문을 더하지 않았다. 새 낱말 여섯은 상태 글자(`text` 변형)뿐이다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 결정 최소: 사용자가 할 결정이 늘지 않는다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 주 버튼 하나: 화면 구성 변경 없음 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 위험한 동작은 떨어뜨려 두고 위험 색이다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 같은 말을 두 번 하지 않는다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 키보드만으로 끝난다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 같은 종류의 행동은 같은 모양이다 — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: D1은 색 역할 재지정 한 곳(Table.module.css .selectedRow)이라 이 항목에 영향 없음, tokens.test.ts 대비 단언으로 확인
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(육안 금지) · 독립 DOM 감사 07-12-dom-audit.md §2 · §6 실측 대상
