# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: cdbfadde^...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261003-170519-5912`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261003-170519-5912/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/code-tables?tableKey=project_status | 768 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(3\) | visual | 태블릿 화면에 P3로 선언된 값\(in_progress\)과 정렬\(1\)이 모두 노출된다. 값은 두 줄로 갈라져 표시된다. | SYSTEM.md §6-0: 700–1023px에서는 PC 셸을 유지하고 표의 P3 열을 숨긴다. 해당 두 열은 diff에서 모두 P3다. | 시각 지적 — 실측 필요 |  |
| 2 | /admin/code-tables?tableKey=evidence_type | 768 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(1\) | visual | 태블릿 화면에 P3 값\(tax_invoice\)과 정렬\(0\)이 노출된다. P1·P2 열과 함께 총 6열이 남아 있다. | SYSTEM.md §6-0: 700–1023px에서는 P3 열을 숨긴다. 코드표의 값·정렬은 P3 선언을 따른다. | 시각 지적 — 실측 필요 |  |
| 3 | /admin/code-tables?tableKey=evidence_type | 320 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(3\) | visual | 첫 항목의 설명과 규칙 요약이 서로 다른 보조 행으로 분리되고, 설명 아래에 구분선이 먼저 그어진다. 규칙 요약 행은 실측 286×90px이며 별도 초록 면으로 표시된다. | SYSTEM.md §7-3: P2는 자기 항목 아래 접힌 줄 하나로 모으고 --text-aux·--text-muted로 표시한다. 행 구분선은 접힌 정보 전체의 아래에 둔다. | 시각 지적 — 실측 필요 |  |
| 4 | /admin/code-tables?tableKey=evidence_type | 375 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(15\) | visual | 기타소득의 설명 아래 구분선 뒤에 규칙 요약이 별도 행으로 붙는다. 실측 341×90px·2줄인 요약은 설명보다 큰 본문 글자와 초록 면으로 강조되어 보조 정보의 위계가 달라진다. | SYSTEM.md §7-3: P2 값은 접힌 줄 하나에 --text-aux·--text-muted로 통합하고, 구분선은 접힌 줄 아래에만 둔다. | 시각 지적 — 실측 필요 |  |

## DOM 실측표

### /admin/code-tables?tableKey=evidence_type · 375px (admin_code_tables_tableKey_evidence_type-c4c3505b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | tax_invoice세금계산서과세 거래 · 부가세가 붙는 세금계산서0—비 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | invoice계산서면세 거래 · 부가세 없는 계산서1—비활성화삭제 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(7) | row | card_receipt카드 전표법인카드 결제 전표2—비활성화삭제 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(10) | row | cash_receipt현금영수증지출 증빙용 현금영수증3—비활성화삭제 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(13) | row | other_income기타소득강사료·경품 등 일시 소득 · 원천징수 대상 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(15) | row | 원천징수율과 면제 기준 · 10원 · 반올림 · 125,000원 · 지급 | 341×90 | 2 |  |  |  |
…(잘림: 27668바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 320px (admin_code_tables_tableKey_evidence_type-c4c3505b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | tax_invoice세금계산서과세 거래 · 부가세가 붙는 세금계산서0—비 | 286×128 | 3 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(6) | cell | 비활성화삭제 | 144×128 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일규칙 종류없음부가세  | 286×90 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) > td.Table-module__ikVkKa__cell | cell | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일규칙 종류없음부가세  | 286×90 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | invoice계산서면세 거래 · 부가세 없는 계산서1—비활성화삭제 | 286×128 | 3 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) > td.Table-module__ikVkKa__cell:nth-of-type(6) | cell | 비활성화삭제 | 144×128 | 2 |  |  |  |
…(잘림: 27655바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 768px (admin_code_tables_tableKey_evidence_type-c4c3505b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| tbody > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 174×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(4) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 174×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(13) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 174×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(16) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 174×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(19) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 174×32 | — | 예 |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일규칙 종류없음부가세  | 726×315 | 5 |  |  |  |
…(잘림: 37094바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 1280px (admin_code_tables_tableKey_evidence_type-c4c3505b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일규칙 종류없음부가세  | 1238×195 | 4 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) > td.Table-module__ikVkKa__cell | cell | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일규칙 종류없음부가세  | 1238×195 | 4 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(6) | row | 없음규칙 종류없음부가세 가산율원천징수율과 면제 기준원천징수 회사 대납세율 | 1238×135 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(6) > td.Table-module__ikVkKa__cell | cell | 없음규칙 종류없음부가세 가산율원천징수율과 면제 기준원천징수 회사 대납세율 | 1238×135 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(9) | row | 없음규칙 종류없음부가세 가산율원천징수율과 면제 기준원천징수 회사 대납세율 | 1238×135 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(9) > td.Table-module__ikVkKa__cell | cell | 없음규칙 종류없음부가세 가산율원천징수율과 면제 기준원천징수 회사 대납세율 | 1238×135 | 2 |  |  |  |
…(잘림: 36966바이트 생략)
### /admin/code-tables?tableKey=project_status · 375px (admin_code_tables_tableKey_project_status-ba0d1727-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | bidding수주중제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | in_progress진행수주 확정 · 종료일 다음 날 자동으로 정산1—비 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(5) | row | settling정산행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계2— | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(7) | row | completed완료정산 마감 · 견적 줄이 잠기고 되돌리기 없음3—비활 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(9) | row | lost미수주수주 실패 · 쌓인 비용은 팀 미수주 비용4—비활성화삭제 | 341×68 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 16130바이트 생략)
### /admin/code-tables?tableKey=project_status · 320px (admin_code_tables_tableKey_project_status-ba0d1727-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | bidding수주중제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용 | 286×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | in_progress진행수주 확정 · 종료일 다음 날 자동으로 정산1—비 | 286×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(5) | row | settling정산행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계2— | 286×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(7) | row | completed완료정산 마감 · 견적 줄이 잠기고 되돌리기 없음3—비활 | 286×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(9) | row | lost미수주수주 실패 · 쌓인 비용은 팀 미수주 비용4—비활성화삭제 | 286×68 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 16129바이트 생략)
### /admin/code-tables?tableKey=project_status · 768px (admin_code_tables_tableKey_project_status-ba0d1727-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| tbody > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 210×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(3) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 210×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(5) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 210×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(7) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 210×32 | — | 예 |  |  |
| tbody > tr:nth-of-type(9) > td.Table-module__ikVkKa__cell:nth-of-type(3) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 210×32 | — | 예 |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | in_progress진행수주 확정 · 종료일 다음 날 자동으로 정산1—비 | 726×51 | 2 |  |  |  |
…(잘림: 17778바이트 생략)
### /admin/code-tables?tableKey=project_status · 1280px (admin_code_tables_tableKey_project_status-ba0d1727-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > thead | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody | 0 |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | 0 |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(5) | 0 |
…(잘림: 17720바이트 생략)
### /admin/people/roles · 375px (admin_people_roles-73424962-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > thead | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > tbody | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 계급 | 343×29 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 91×44 | 1 |  |  |  |
…(잘림: 8767바이트 생략)
### /admin/people/roles · 320px (admin_people_roles-73424962-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > thead | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > tbody | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 계급 | 288×29 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 77×44 | 1 |  |  |  |
…(잘림: 8760바이트 생략)
### /admin/people/roles · 768px (admin_people_roles-73424962-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > thead | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > tbody | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
…(잘림: 11742바이트 생략)
### /admin/people/roles · 1280px (admin_people_roles-73424962-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > thead | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable > table.Table-module__ikVkKa__table > tbody | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
…(잘림: 11761바이트 생략)
