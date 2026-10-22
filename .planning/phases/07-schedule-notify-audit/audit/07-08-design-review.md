# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261022-050542-18651`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261022-050542-18651/codex-output.md`
- 실린 SYSTEM 절: 7-3 · 0 · 3 · 4-1 · 6-0 · 6-1 — 끝 절 일부 잘림
- 핵심 칸 글자(1280) /account — 제목: 내 계정 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/code-tables?tableKey=evidence_type — 제목: 코드표 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/corp-cards — 제목: 법인카드 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/corp-cards?new=1 — 제목: 법인카드 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/holidays — 제목: 공휴일 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/settings — 제목: 설정 · 금액 칸: 50,000

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/code-tables?tableKey=evidence_type | 375 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(1\) | visual | 첫 항목이 주 행·설명 줄·세금 규칙 요약 줄의 3개 행으로 분리된다. 설명과 규칙 요약 사이에도 구분선이 있어, 같은 항목의 접힌 정보가 두 묶음으로 보인다. | §7-3 폰 전략: P2는 각 주 행 아래 접힌 줄 하나로 합치고, 값은 열 순서대로 ' · '로 연결한다. 행 구분선은 접힌 정보가 끝난 뒤에만 둔다. | 시각 지적 — 실측 필요 | 확인 · 기존 구조(이 PR 밖) — 375: 항목당 tr 3개(주 행 68px td 테두리 0 · collapsedRow 33px td 1px · static-table-detail 68px td 1px), 설명 줄 아래에 1px 선. StaticTable·code-tables/page 구조는 origin/main과 같음 → 보고만 |
| 2 | /admin/code-tables?tableKey=evidence_type | 320 | #main-content › div.ListScreen-module__ciqCrG__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(1\) | visual | 첫 항목의 설명과 세금 규칙 요약이 별도 행으로 나뉘고 그 사이에 구분선이 있다. 규칙 요약까지 2줄로 접혀, 한 항목이 주 행과 두 개의 보조 행으로 늘어난다. | §7-3 폰 전략: 주 행 아래 P2 접힌 줄은 하나이며, --text-aux·--text-muted로 표시한다. 좁은 폭의 자연 줄바꿈은 허용하되 보조 정보를 별도 행으로 분할하지 않는다. | 시각 지적 — 실측 필요 | 확인 · 기존 구조(이 PR 밖) — 320: 같은 3행, detail 줄 90px(자연 줄바꿈), 선 위치 같음 → 보고만 |

## DOM 실측표

### /account · 375px (account-441bb226-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.DetailScreen-module__0yNRdq__screen | 16 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 16 |
…(잘림: 3423바이트 생략)
### /account · 320px (account-441bb226-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.DetailScreen-module__0yNRdq__screen | 16 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 16 |
…(잘림: 3422바이트 생략)
### /account · 768px (account-441bb226-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.DetailScreen-module__0yNRdq__screen | 16 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 16 |
…(잘림: 3756바이트 생략)
### /account · 1280px (account-441bb226-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.DetailScreen-module__0yNRdq__screen | 16 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 16 |
…(잘림: 3756바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 375px (admin_code_tables_tableKey_evidence_type-c4c3505b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | tax_invoice세금계산서과세 거래 · 부가세가 붙는 세금계산서0—비 | 341×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | invoice계산서면세 거래 · 부가세 없는 계산서1—비활성화삭제 | 341×68 | 2 |  |  |  |
…(잘림: 27917바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 320px (admin_code_tables_tableKey_evidence_type-c4c3505b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | tax_invoice세금계산서과세 거래 · 부가세가 붙는 세금계산서0—비 | 286×68 | 2 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(3) | row | 부가세 가산율 · 1원 · 반올림 · 0원 · 증빙일올린 사람 · 경영관 | 286×90 | 2 |  |  |  |
…(잘림: 27902바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 768px (admin_code_tables_tableKey_evidence_type-c4c3505b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| tbody > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(2) > div.pc-only-module__bNEY5a__pcOnly > span.code-tables-module__bziNDW__descriptionCell > input.code-tables-module__bziNDW__labelInput | input |  | 148×32 | — | 예 |  |  |
| tr:nth-of-type(3) > td.Table-module__ikVkKa__cell > div.pc-only-module__bNEY5a__pcOnly > div.code-tables-module__bziNDW__taxRuleSection > div.code-tables-module__bziNDW__selectLabel:nth-of-type(1) > label | label | 올린 사람 · 경영관리만 보기 | 96×43 | 2 |  |  |  |
…(잘림: 42619바이트 생략)
### /admin/code-tables?tableKey=evidence_type · 1280px (admin_code_tables_tableKey_evidence_type-c4c3505b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| tr:nth-of-type(3) > td.Table-module__ikVkKa__cell > div.pc-only-module__bNEY5a__pcOnly > div.code-tables-module__bziNDW__taxRuleSection > div.code-tables-module__bziNDW__selectLabel:nth-of-type(1) > label | label | 올린 사람 · 경영관리만 보기 | 96×43 | 2 |  |  |  |
| tr:nth-of-type(6) > td.Table-module__ikVkKa__cell > div.pc-only-module__bNEY5a__pcOnly > div.code-tables-module__bziNDW__taxRuleSection > div.code-tables-module__bziNDW__selectLabel:nth-of-type(1) > label | label | 올린 사람 · 경영관리만 보기 | 96×43 | 2 |  |  |  |
…(잘림: 42605바이트 생략)
### /admin/corp-cards · 375px (admin_corp_cards-12d6ac6f-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1567바이트 생략)
### /admin/corp-cards · 320px (admin_corp_cards-12d6ac6f-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1566바이트 생략)
### /admin/corp-cards · 768px (admin_corp_cards-12d6ac6f-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1900바이트 생략)
### /admin/corp-cards · 1280px (admin_corp_cards-12d6ac6f-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1901바이트 생략)
### /admin/corp-cards?new=1 · 375px (admin_corp_cards_new_1-b8b31842-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
…(잘림: 4113바이트 생략)
### /admin/corp-cards?new=1 · 320px (admin_corp_cards_new_1-b8b31842-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
…(잘림: 4111바이트 생략)
### /admin/corp-cards?new=1 · 768px (admin_corp_cards_new_1-b8b31842-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
…(잘림: 4443바이트 생략)
### /admin/corp-cards?new=1 · 1280px (admin_corp_cards_new_1-b8b31842-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
…(잘림: 4444바이트 생략)
### /admin/holidays · 375px (admin_holidays-45daace2-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.holidays-module__PWQ_ha__statusRow | 12 |
…(잘림: 44965바이트 생략)
### /admin/holidays · 320px (admin_holidays-45daace2-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.holidays-module__PWQ_ha__statusRow | 12 |
…(잘림: 44964바이트 생략)
### /admin/holidays · 768px (admin_holidays-45daace2-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.holidays-module__PWQ_ha__statusRow | 12 |
…(잘림: 38702바이트 생략)
### /admin/holidays · 1280px (admin_holidays-45daace2-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div.holidays-module__PWQ_ha__statusRow | 12 |
…(잘림: 38772바이트 생략)
### /admin/settings · 375px (admin_settings-f6245d45-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > div.settings-module__5aL-lq__exportRow | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
…(잘림: 84478바이트 생략)
### /admin/settings · 320px (admin_settings-f6245d45-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > div.settings-module__5aL-lq__exportRow | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
…(잘림: 84475바이트 생략)
### /admin/settings · 768px (admin_settings-f6245d45-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 39개(요소 상한 400)

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.settings-module__5aL-lq__field:nth-of-type(6) > div.Form-module__qIqsGG__row > label.Form-module__qIqsGG__label | label | 원천징수 적용 기준일 | 96×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 부가세 절사 단위(원) | 100×46 | 2 |  |  |  |
…(잘림: 92988바이트 생략)
### /admin/settings · 1280px (admin_settings-f6245d45-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 39개(요소 상한 400)

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.settings-module__5aL-lq__field:nth-of-type(6) > div.Form-module__qIqsGG__row > label.Form-module__qIqsGG__label | label | 원천징수 적용 기준일 | 96×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 부가세 절사 단위(원) | 100×46 | 2 |  |  |  |
…(잘림: 92988바이트 생략)


## 판정 (DOM 실측, 2026-10-22, CI=true 빌드 · erp_gate0708_test)

- 후보 1·2: 실측으로 「항목당 3행 · 설명 줄과 세금 규칙 줄 사이 1px 선」 사실 확인. 원인은 `ui/table/StaticTable.tsx`의 detail 줄(`data-ui="static-table-detail"`)이 폰에서 collapsedRow와 별도 tr로 남는 기존 구조이고, 이 PR(07-08)은 그 줄의 입력 스킨(`Table.module.css` :not(:where(...)))과 select 교체만 바꿨다. 이 PR의 회귀가 아님 → 수정하지 않고 보고(§7-3 폰 접힌 줄 하나 원칙과의 차이 — 디자인 판단 필요).
- 1280: collapsedRow display none, 주 행 44px td 1px, detail 줄 206/146px — 폼 스킨(C3) 그대로, 표 안 밑줄 스킨 미적용 확인.
- 카드 등록 `select#holderUserId` 첫 옵션: value "" · label 「소지자 선택」 · disabled false · required true — /review I-2(자리 옵션 다시 선택 가능, 서버 검증이 막음)와 같음 → 보고만.
- 결함(이 PR 회귀) 0건. 사용자 결정 D1·C1·C2·C3·PcOnly는 앞선 DOM 감사·재감사(07-08-dom-audit.md · 07-08-dom-reaudit-a806cdff.md)에서 통과, 이번 실측과 충돌 없음.
