# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-041304-21194`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-041304-21194/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/settings | 768 | div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) › div.settings-module__5aL-lq__field:nth-of-type\(1\) › div.TextField-module__WxakZq__row › label.TextField-module__WxakZq__label | visual | PC 폼의 ‘부가세 절사 단위\(원\)’ 라벨 폭이 실측 100px로, 지정된 라벨 폭보다 4px 넓다. 라벨은 2줄·높이 46px이다. | SYSTEM.md §7-2: PC 폼 라벨은 왼쪽 96px. 2줄 자체는 위반이 아니지만 라벨 열 폭은 96px에 맞춘다. | 시각 지적 — 실측 필요 | 결함 아님 — 아래 판정 |
| 2 | /admin/settings | 1280 | div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) › div.settings-module__5aL-lq__field:nth-of-type\(1\) › div.TextField-module__WxakZq__row › label.TextField-module__WxakZq__label | visual | 1280px에서도 ‘부가세 절사 단위\(원\)’ 라벨 폭이 실측 100px로, 지정된 96px보다 4px 넓다. | SYSTEM.md §7-2: 설정 섹션의 PC 폼 라벨 열은 96px. | 시각 지적 — 실측 필요 | 결함 아님 — 아래 판정 |

## DOM 실측표

### /admin/settings · 375px (admin_settings-f6245d45-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > div.settings-module__5aL-lq__exportRow | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(6) | 24 |
…(잘림: 59127바이트 생략)
### /admin/settings · 320px (admin_settings-f6245d45-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > div.settings-module__5aL-lq__exportRow | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(6) | 24 |
…(잘림: 59124바이트 생략)
### /admin/settings · 768px (admin_settings-f6245d45-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.settings-module__5aL-lq__field:nth-of-type(7) > label.settings-module__5aL-lq__selectLabel | label | 원천징수 적용 기준일payment_dateevidence_dateissu | 720×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 부가세 절사 단위(원) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 원천징수 절사 단위(원) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 접두어 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(3) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(4) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 구분자 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(5) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(7) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
…(잘림: 59481바이트 생략)
### /admin/settings · 1280px (admin_settings-f6245d45-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.settings-module__5aL-lq__field:nth-of-type(7) > label.settings-module__5aL-lq__selectLabel | label | 원천징수 적용 기준일payment_dateevidence_dateissu | 720×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 부가세 절사 단위(원) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(4) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 원천징수 절사 단위(원) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(1) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 접두어 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(3) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(4) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 구분자 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(5) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 프로젝트 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(7) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
…(잘림: 59481바이트 생략)
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
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 프로젝트 | 343×29 | 1 |  |  |  |
| div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > form.projects-module__GXRNnG__filterFields > div.projects-module__GXRNnG__selectLabel:nth-of-type(1) > label | label | 검색 | 343×21 | 1 |  |  |  |
| #q | input |  | 343×40 | — |  |  |  |
| div.ListScreen-module__ciqCrG__filters > form.projects-module__GXRNnG__filterFields > div.projects-module__GXRNnG__filterBar > div > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 필터 | 51×44 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 거래처 등록 | 93×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 103×44 | 1 |  |  |  |

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
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 프로젝트 | 288×29 | 1 |  |  |  |
| div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > form.projects-module__GXRNnG__filterFields > div.projects-module__GXRNnG__selectLabel:nth-of-type(1) > label | label | 검색 | 288×21 | 1 |  |  |  |
| #q | input |  | 288×40 | — |  |  |  |
| div.ListScreen-module__ciqCrG__filters > form.projects-module__GXRNnG__filterFields > div.projects-module__GXRNnG__filterBar > div > span.Button-module__TNl3Yq__wrap > button.Button-module__TNl3Yq__btn | button | 필터 | 51×44 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 거래처 등록 | 93×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 89×44 | 1 |  |  |  |

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
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 프로젝트 | 728×29 | 1 |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(1) > label | label | 상태 | 89×21 | 1 |  |  |  |
| #status | input | 전체 상태수주중진행정산완료미수주 | 89×32 | — |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(2) > label | label | 팀 | 98×21 | 1 |  |  |  |
| #teamId | input | 전체 팀경영관리팀기획1팀 | 98×32 | — |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(3) > label | label | 연도 | 89×21 | 1 |  |  |  |
| #year | input | 전체 연도20272026202520242023 | 89×32 | — |  |  |  |
…(잘림: 719바이트 생략)
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
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(2) | nav | 지출결의 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 프로젝트 | 1240×29 | 1 |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(1) > label | label | 상태 | 89×21 | 1 |  |  |  |
| #status | input | 전체 상태수주중진행정산완료미수주 | 89×32 | — |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(2) > label | label | 팀 | 98×21 | 1 |  |  |  |
| #teamId | input | 전체 팀경영관리팀기획1팀 | 98×32 | — |  |  |  |
| #project-filter-fields > div.projects-module__GXRNnG__selectLabel:nth-of-type(3) > label | label | 연도 | 89×21 | 1 |  |  |  |
| #year | input | 전체 연도20272026202520242023 | 89×32 | — |  |  |  |
…(잘림: 719바이트 생략)

## 판정 (실측)

- 후보 1·2(설정 「부가세 절사 단위(원)」 라벨 폭 100px, 768·1280): **결함 아님 · 이 PR 밖.** 실측표에서 설정 화면의 모든 TextField 라벨이 768·1280에서 폭 100(새 「수익률 기준선(%)」 칸도 100 × 25, 1줄)이다. `ui/input/TextField.module.css`의 `.label { flex: 0 0 calc(var(--label-w) + var(--s-1)); margin-inline-end: calc(-1 * var(--s-1)); }`가 #158 사파리 비교로 넣은 의도된 값이고 입력 칸 x는 그대로다. 이 PR은 `ui/`를 바꾸지 않았다(`git diff origin/main --stat -- ui` 빈 출력).
- 이 PR 변경 대상(목록 수익률 색 · 설정 새 칸)에 대한 Codex 지적 없음.
- 산출물 사본(Playwright가 test-results/를 지우므로): `/mnt/project-files/notes/quick-261004-51o/codex/run/` (4폭 PNG · measurements*.json · codex-output.md).
