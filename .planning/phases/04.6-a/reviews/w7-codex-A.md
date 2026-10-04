# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: 88be3a53...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261003-170320-4581`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261003-170320-4581/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /login | 375 | main › div.AuthFrame-module__CEVfQG__page › div.AuthFrame-module__CEVfQG__frame › form › div.TextField-module__WxakZq__row:nth-of-type\(2\) | gap | 첫 번째 입력 항목과 두 번째 입력 항목 사이의 실측 세로 간격이 16px로, 기준보다 8px 작다. | SYSTEM.md §3 폼: 항목 사이 24px. | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) 16px, main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.login-form-module__EUvy-G__submitRow 16px |  |
| 2 | /login | 320 | main › div.AuthFrame-module__CEVfQG__page › div.AuthFrame-module__CEVfQG__frame › form › div.TextField-module__WxakZq__row:nth-of-type\(2\) | gap | 첫 번째 입력 항목과 두 번째 입력 항목 사이의 실측 세로 간격이 16px로, 기준보다 8px 작다. | SYSTEM.md §3 폼: 항목 사이 24px. | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) 16px, main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.login-form-module__EUvy-G__submitRow 16px |  |
| 3 | /login | 768 | main › div.AuthFrame-module__CEVfQG__page › div.AuthFrame-module__CEVfQG__frame › form › div.TextField-module__WxakZq__row:nth-of-type\(2\) | gap | 첫 번째 입력 항목과 두 번째 입력 항목 사이의 실측 세로 간격이 16px로, 기준보다 8px 작다. | SYSTEM.md §3 폼: 항목 사이 24px. | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) 16px, main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.login-form-module__EUvy-G__submitRow 16px |  |
| 4 | /login | 1280 | main › div.AuthFrame-module__CEVfQG__page › div.AuthFrame-module__CEVfQG__frame › form › div.TextField-module__WxakZq__row:nth-of-type\(2\) | gap | 첫 번째 입력 항목과 두 번째 입력 항목 사이의 실측 세로 간격이 16px로, 기준보다 8px 작다. | SYSTEM.md §3 폼: 항목 사이 24px. | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) 16px, main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2)→main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.login-form-module__EUvy-G__submitRow 16px |  |

## DOM 실측표

### /admin · 375px (admin-84a04c24-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.ListScreen-module__ciqCrG__screen | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(1) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(3) | 12 |
…(잘림: 5948바이트 생략)
### /admin · 320px (admin-84a04c24-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.ListScreen-module__ciqCrG__screen | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(1) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(3) | 12 |
…(잘림: 5947바이트 생략)
### /admin · 768px (admin-84a04c24-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.ListScreen-module__ciqCrG__screen | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(1) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(3) | 12 |
…(잘림: 6281바이트 생략)
### /admin · 1280px (admin-84a04c24-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content | #main-content > p.Banner-module__iSwN9W__banner | #main-content > div.ListScreen-module__ciqCrG__screen | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(1) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(2) | #main-content > div.ListScreen-module__ciqCrG__screen > div.single-column > section:nth-of-type(3) | 12 |
…(잘림: 6282바이트 생략)
### /approvals · 375px (approvals-266bac7e-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 결재 | 343×29 | 1 |  |  |  |
…(잘림: 827바이트 생략)
### /approvals · 320px (approvals-266bac7e-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 결재 | 288×29 | 1 |  |  |  |
…(잘림: 826바이트 생략)
### /approvals · 768px (approvals-266bac7e-768.png)
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
…(잘림: 1134바이트 생략)
### /approvals · 1280px (approvals-266bac7e-1280.png)
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
…(잘림: 1135바이트 생략)
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
…(잘림: 826바이트 생략)
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
…(잘림: 825바이트 생략)
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
…(잘림: 1139바이트 생략)
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
…(잘림: 1140바이트 생략)
### /login · 375px (login-7e93fba0-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > p.AuthFrame-module__CEVfQG__mark | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | 24 |
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1) | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) | 16 |
…(잘림: 1309바이트 생략)
### /login · 320px (login-7e93fba0-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > p.AuthFrame-module__CEVfQG__mark | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | 24 |
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1) | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) | 16 |
…(잘림: 1309바이트 생략)
### /login · 768px (login-7e93fba0-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > p.AuthFrame-module__CEVfQG__mark | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | 24 |
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1) | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) | 16 |
…(잘림: 1309바이트 생략)
### /login · 1280px (login-7e93fba0-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > p.AuthFrame-module__CEVfQG__mark | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | 24 |
| main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(1) | main > div.AuthFrame-module__CEVfQG__page > div.AuthFrame-module__CEVfQG__frame > form > div.TextField-module__WxakZq__row:nth-of-type(2) | 16 |
…(잘림: 1309바이트 생략)
### /projects · 375px (projects-902ceeb2-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
…(잘림: 1526바이트 생략)
### /projects · 320px (projects-902ceeb2-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
…(잘림: 1525바이트 생략)
### /projects · 768px (projects-902ceeb2-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
…(잘림: 2524바이트 생략)
### /projects · 1280px (projects-902ceeb2-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(1) | nav | 프로젝트 | 44×23 | 1 |  |  |  |
…(잘림: 2525바이트 생략)
