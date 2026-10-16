# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- 계획: .planning/phases/06.1-evidence-bulk-intake/reviews/tmp-codex-input/plan-ui-excerpt.md
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-132218-14758`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-132218-14758/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /dev/components | 1280 | #main-content › div.DetailScreen-module__0yNRdq__screen | visual | 입력 오류 예시의 안내는 ‘형식 오류’ 한 줄이며, 올바른 형식 예시나 다음 행동은 0개다. | SYSTEM §7-2: 입력 아래 오류 한 줄에 ‘원인 · 다음 행동’을 함께 표시한다. | 시각 지적 — 실측 필요 |  |
| 2 | /dev/components | 320 | #main-content › div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(1\) | visual | 1차 비활성 예시는 ‘권한 없음 · 담당에게 요청’을 일반 글자로 표시한다. 다음 행동을 실행하는 3차 버튼은 보이지 않는다. | SYSTEM §7-1: 비활성 이유 옆에 다음 한 수를 3차 버튼으로 제공한다. | 시각 지적 — 실측 필요 |  |
| 3 | /dev/components | 1280 | #main-content › div.DetailScreen-module__0yNRdq__screen | visual | 편집 표에 붉은 오류 셀 1개가 있지만, 합계 행에는 ‘합계 · 3줄 · 6,440,000’만 보이고 오른쪽 저장 거부 메시지는 0개다. | SYSTEM §7-3: 저장 실패 상태를 시연한다면 오류 셀과 함께 합계 행 오른쪽에 ‘오류 1칸 · 전부 거부’를 표시한다. | 시각 지적 — 실측 필요 |  |
| 4 | .planning/phases/06.1-evidence-bulk-intake/reviews/tmp-codex-input/plan-ui-excerpt.md | 1280 | #main-content › div.DetailScreen-module__0yNRdq__screen | visual | 계획 검토: \[05:66\]은 60자 거래처 이름 자체를 ‘표 셀 두 줄 + 말줄임’으로 명세한다. 거래처 이름을 2줄로 허용하는 부분이 SYSTEM과 충돌한다. 선택자는 현재 쇼케이스 대조 범위이며 신규 화면의 DOM 실측이 아니다. | SYSTEM §7-3: 거래처 이름은 한 줄 말줄임. \[05:54\]의 종류·사업자번호 등 보조 정보는 이름과 별도 줄로 표시한다. | 시각 지적 — 실측 필요 |  |
| 5 | .planning/phases/06.1-evidence-bulk-intake/reviews/tmp-codex-input/plan-ui-excerpt.md | 768 | #main-content › div.DetailScreen-module__0yNRdq__screen | visual | 계획 검토: \[05:56\]은 전체 합계를 ‘합계 행’으로 정하지만, \[05:68\]의 1024px 미만 읽기 전용 분기에 표 위 합계 줄로 전환하는 명세는 없다. 아래 합계 행을 그대로 유지하면 읽기 목록 규칙과 충돌한다. 선택자는 현재 쇼케이스 대조 범위이며 신규 화면의 DOM 실측이 아니다. | SYSTEM §6-1·§7-3: 읽기 목록 합계는 필터 바로 아래·표 위 합계 면에 표시한다. 편집 표의 합계 행만 표 아래에 둔다. | 시각 지적 — 실측 필요 |  |

## DOM 실측표

### /dev/components · 375px (dev_components-dcd2b4e8-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 110×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 113×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 95×44 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | 24 |
…(잘림: 51076바이트 생략)
### /dev/components · 320px (dev_components-dcd2b4e8-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 110×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 113×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 95×44 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | 24 |
…(잘림: 54777바이트 생략)
### /dev/components · 768px (dev_components-dcd2b4e8-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 105×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 107×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 74×22 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) | row | 현수막1245,000숫자 입력540,000 | 726×53 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 45,000숫자 입력 | 210×53 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
…(잘림: 47327바이트 생략)
### /dev/components · 1280px (dev_components-dcd2b4e8-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 105×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 107×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 74×22 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) | row | 현수막1245,000숫자 입력540,000 | 1238×53 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 45,000숫자 입력 | 359×53 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
…(잘림: 46323바이트 생략)
### /expenses · 375px (expenses-ed86b41b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 지출결의 | 343×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 법인카드 보기 | 106×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 103×44 | 1 |  |  |  |

### /expenses · 320px (expenses-ed86b41b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 지출결의 | 288×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 법인카드 보기 | 106×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 89×44 | 1 |  |  |  |

### /expenses · 768px (expenses-ed86b41b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 지출결의 | 728×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 법인카드 보기 | 100×32 | 1 |  |  |  |

### /expenses · 1280px (expenses-ed86b41b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 지출결의 | 1240×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 법인카드 보기 | 100×32 | 1 |  |  |  |

