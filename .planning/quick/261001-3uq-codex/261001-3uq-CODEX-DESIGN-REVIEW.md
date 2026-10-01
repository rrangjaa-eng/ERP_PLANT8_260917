# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json·Codex 원문): `test-results/codex-design-review/20261001-031229`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/people | 768 | td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | height | 행의 삭제 버튼 실측 높이가 19px로, 규정된 32px보다 13px 작다. | §6-0: 태블릿 700–1023px는 PC 규칙 적용. §3·§7-1: PC 버튼 높이 32px. | 20×19px · 1줄 · 자기 넘침 아니오 · 화면 밖 아니오 |  |
| 2 | /admin/people | 1280 | td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | height | 행의 삭제 버튼 실측 높이가 19px로, 규정된 32px보다 13px 작다. 본문 행 높이 36px 충족과 별개로 버튼 자체 높이가 부족하다. | §3·§7-1: PC 버튼 높이 32px. 관리자 삭제의 임시 예외는 확인 방식 등에 한정되며 버튼 높이 예외는 없다. | 20×19px · 1줄 · 자기 넘침 아니오 · 화면 밖 아니오 |  |

## DOM 실측표

### /admin/people · 375px (admin_people-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow | row | 이메일 e2e-27945436-045c-4ad7-852e-7f10739a | 347×47 | 2 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow > td.people-module__nODLsG__collapsedCell | cell | 이메일 e2e-27945436-045c-4ad7-852e-7f10739a | 347×47 | 2 |  |  |  |
| header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 56×44 | 1 |  |  |  |
| #main-content > div.PageHeader-module__08UEOa__header > h1.PageHeader-module__08UEOa__title | heading | 사람 | 30×25 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > thead > tr | row | 이름이메일계급현재 소속상태동작 | 347×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(1) | cell | 이름 | 88×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(5) | cell | 상태 | 133×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(6) | cell | 동작 | 126×39 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > tbody > tr | row | E2E Admine2e-27945436-045c-4ad7-852e-7f1 | 347×64 | 1 |  |  |  |
| #people-row-0-name | cell | E2E Admin | 88×64 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(4) | cell | 임시 비밀번호 사용 중 | 133×64 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(5) | cell | 상세삭제 | 126×64 | 1 |  |  |  |
| td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 삭제 | 44×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 103×44 | 1 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > div.PageHeader-module__08UEOa__header | #main-content > div.people-module__nODLsG__filterRow | 16 |
| #main-content | #main-content > div.people-module__nODLsG__filterRow | #main-content > table.people-module__nODLsG__table | 12 |
| #main-content > table.people-module__nODLsG__table | #main-content > table.people-module__nODLsG__table > thead | #main-content > table.people-module__nODLsG__table > tbody | 1 |
| #main-content > table.people-module__nODLsG__table > tbody | #main-content > table.people-module__nODLsG__table > tbody > tr | #main-content > table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow | 0 |

### /admin/people · 320px (admin_people-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > table.people-module__nODLsG__table > tbody > tr | row | E2E Admine2e-27945436-045c-4ad7-852e-7f1 | 292×124 | 5 |  |  |  |
| #people-row-0-name | cell | E2E Admin | 68×124 | 2 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(5) | cell | 상세삭제 | 101×124 | 2 |  |  |  |
| #main-content > table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow | row | 이메일 e2e-27945436-045c-4ad7-852e-7f10739a | 292×47 | 2 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow > td.people-module__nODLsG__collapsedCell | cell | 이메일 e2e-27945436-045c-4ad7-852e-7f10739a | 292×47 | 2 |  |  |  |
| header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 56×44 | 1 |  |  |  |
| #main-content > div.PageHeader-module__08UEOa__header > h1.PageHeader-module__08UEOa__title | heading | 사람 | 30×25 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > thead > tr | row | 이름이메일계급현재 소속상태동작 | 292×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(1) | cell | 이름 | 68×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(5) | cell | 상태 | 123×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(6) | cell | 동작 | 101×39 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(4) | cell | 임시 비밀번호 사용 중 | 123×124 | 1 |  |  |  |
| td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 삭제 | 44×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 89×44 | 1 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > div.PageHeader-module__08UEOa__header | #main-content > div.people-module__nODLsG__filterRow | 16 |
| #main-content | #main-content > div.people-module__nODLsG__filterRow | #main-content > table.people-module__nODLsG__table | 12 |
| #main-content > table.people-module__nODLsG__table | #main-content > table.people-module__nODLsG__table > thead | #main-content > table.people-module__nODLsG__table > tbody | 1 |
| #main-content > table.people-module__nODLsG__table > tbody | #main-content > table.people-module__nODLsG__table > tbody > tr | #main-content > table.people-module__nODLsG__table > tbody > tr.people-module__nODLsG__collapsedRow | 0 |

### /admin/people · 768px (admin_people-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > table.people-module__nODLsG__table > tbody > tr | row | E2E Admine2e-27945436-045c-4ad7-852e-7f1 | 728×55 | 3 |  |  |  |
| #people-row-0-name | cell | E2E Admin | 73×55 | 2 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(1) | cell | e2e-27945436-045c-4ad7-852e-7f10739a480e | 337×55 | 2 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(2) | cell | 시스템 관리자 | 80×55 | 2 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 20×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 20×37 | 1 |  |  |  |
| header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 56×37 | 1 |  |  |  |
| #main-content > div.PageHeader-module__08UEOa__header > h1.PageHeader-module__08UEOa__title | heading | 사람 | 30×25 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > thead > tr | row | 이름이메일계급현재 소속상태동작 | 728×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(1) | cell | 이름 | 73×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(2) | cell | 이메일 | 337×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(3) | cell | 계급 | 80×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(4) | cell | 현재 소속 | 59×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(5) | cell | 상태 | 107×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(6) | cell | 동작 | 73×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(3) | cell | — | 59×55 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(4) | cell | 임시 비밀번호 사용 중 | 107×55 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(5) | cell | 상세삭제 | 73×55 | 1 |  |  |  |
| td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 삭제 | 20×19 | 1 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > div.PageHeader-module__08UEOa__header | #main-content > div.people-module__nODLsG__filterRow | 16 |
| #main-content | #main-content > div.people-module__nODLsG__filterRow | #main-content > table.people-module__nODLsG__table | 12 |
| #main-content > table.people-module__nODLsG__table | #main-content > table.people-module__nODLsG__table > thead | #main-content > table.people-module__nODLsG__table > tbody | 1 |

### /admin/people · 1280px (admin_people-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 41×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 20×37 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 20×37 | 1 |  |  |  |
| header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 56×37 | 1 |  |  |  |
| #main-content > div.PageHeader-module__08UEOa__header > h1.PageHeader-module__08UEOa__title | heading | 사람 | 30×25 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > thead > tr | row | 이름이메일계급현재 소속상태동작 | 1240×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(1) | cell | 이름 | 123×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(2) | cell | 이메일 | 618×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(3) | cell | 계급 | 137×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th.people-module__nODLsG__prioP2:nth-of-type(4) | cell | 현재 소속 | 90×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(5) | cell | 상태 | 162×31 | 1 |  |  |  |
| table.people-module__nODLsG__table > thead > tr > th:nth-of-type(6) | cell | 동작 | 110×31 | 1 |  |  |  |
| #main-content > table.people-module__nODLsG__table > tbody > tr | row | E2E Admine2e-27945436-045c-4ad7-852e-7f1 | 1240×36 | 1 |  |  |  |
| #people-row-0-name | cell | E2E Admin | 123×36 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(1) | cell | e2e-27945436-045c-4ad7-852e-7f10739a480e | 618×36 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(2) | cell | 시스템 관리자 | 137×36 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td.people-module__nODLsG__prioP2:nth-of-type(3) | cell | — | 90×36 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(4) | cell | 임시 비밀번호 사용 중 | 162×36 | 1 |  |  |  |
| table.people-module__nODLsG__table > tbody > tr > td:nth-of-type(5) | cell | 상세삭제 | 110×36 | 1 |  |  |  |
| td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 삭제 | 20×19 | 1 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > div.PageHeader-module__08UEOa__header | #main-content > div.people-module__nODLsG__filterRow | 16 |
| #main-content | #main-content > div.people-module__nODLsG__filterRow | #main-content > table.people-module__nODLsG__table | 12 |
| #main-content > table.people-module__nODLsG__table | #main-content > table.people-module__nODLsG__table > thead | #main-content > table.people-module__nODLsG__table > tbody | 1 |


## Codex 원문

````text
```json
[
  {
    "route": "/admin/people",
    "width": 768,
    "selector": "td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn",
    "metric": "height",
    "claim": "행의 삭제 버튼 실측 높이가 19px로, 규정된 32px보다 13px 작다.",
    "expected": "§6-0: 태블릿 700–1023px는 PC 규칙 적용. §3·§7-1: PC 버튼 높이 32px."
  },
  {
    "route": "/admin/people",
    "width": 1280,
    "selector": "td:nth-of-type(5) > span.people-module__nODLsG__rowActions > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn",
    "metric": "height",
    "claim": "행의 삭제 버튼 실측 높이가 19px로, 규정된 32px보다 13px 작다. 본문 행 높이 36px 충족과 별개로 버튼 자체 높이가 부족하다.",
    "expected": "§3·§7-1: PC 버튼 높이 32px. 관리자 삭제의 임시 예외는 확인 방식 등에 한정되며 버튼 높이 예외는 없다."
  }
]
```

확정 위반은 삭제 버튼 높이이며, 두 폭에서 재현된다.
네 폭 모두 문서 가로 넘침은 없다.
320px에서 행동이 두 줄로 접히며 주 행이 124px로 늘지만, 내용에 따른 높이와 줄바꿈은 허용되어 위반으로 단정하지 않았다.
폰 삭제 버튼은 44×44px, 주 행과 접힌 줄 사이 간격은 0px로 기준을 충족한다.

````
