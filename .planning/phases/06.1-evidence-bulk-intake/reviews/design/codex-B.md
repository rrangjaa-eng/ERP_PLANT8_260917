# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- 계획: .planning/phases/06.1-evidence-bulk-intake/reviews/tmp-codex-input/uispec-part2.md
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-132003-13360`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-132003-13360/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /dev/components | 320 | #main-content › div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) | visual | 오류 입력 아래에 '형식 오류'만 1줄 표시된다. 다음 행동 안내는 0개다. | §7-2: 오류 입력 아래 한 줄에 '원인 · 다음 행동'을 함께 표시한다. | 시각 지적 — 실측 필요 |  |
| 2 | /dev/components | 375 | #main-content › div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) | visual | 오류 입력 아래에 '형식 오류'만 1줄 표시된다. 다음 행동 안내는 0개다. | §7-2: 오류 입력 아래 한 줄에 '원인 · 다음 행동'을 함께 표시한다. | 시각 지적 — 실측 필요 |  |
| 3 | /dev/components | 1280 | section.DetailScreen-module__0yNRdq__section:nth-of-type\(9\) › div › table.Table-module__ikVkKa__table › tbody:nth-of-type\(2\) › tr:nth-of-type\(2\) › td.Table-module__ikVkKa__cell:nth-of-type\(3\) | visual | 붉은 오류 셀 아래 안내가 '숫자 입력'만 표시되어 오류 원인 안내는 0개다. | §7-3: 오류 셀 아래 이유 한 줄을 표시한다. §7-2: 오류 문구는 '원인 · 다음 행동' 형식이다. | 시각 지적 — 실측 필요 |  |

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

