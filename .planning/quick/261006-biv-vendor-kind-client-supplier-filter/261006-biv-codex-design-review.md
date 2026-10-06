# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261006-095302-16939`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261006-095302-16939/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/vendors?new=1 | 768 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 추가된 ‘구분’ select가 스크린샷 y=176~216에서 높이 40px로 보인다. 태블릿에 폰 입력 높이가 적용되어 있다. | §6-0: 700~1023은 PC 셸. §7-2: PC 입력 높이 32px. | 시각 지적 — 실측 필요 |  |
| 2 | /admin/vendors?new=1 | 1280 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 추가된 ‘구분’ select가 스크린샷 y=176~216에서 높이 40px로 보인다. PC 기준보다 8px 높다. | §7-2: PC 입력 높이 32px. | 시각 지적 — 실측 필요 |  |
| 3 | /admin/vendors?new=1 | 375 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 이름 입력 하단 y≈231과 구분 입력 상단 y≈272 사이가 약 41px다. 한 줄 라벨 약 21px와 라벨-입력 간격 4px를 제외하면 항목 사이 여백은 약 16px로, 기준보다 8px 좁다. | §3: 폼 항목 사이 24px, 라벨-입력 세로 간격 4px. | 시각 지적 — 실측 필요 |  |
| 4 | /admin/vendors?new=1 | 320 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 이름 입력 하단 y≈231과 구분 입력 상단 y≈272 사이가 약 41px다. 한 줄 라벨 약 21px와 라벨-입력 간격 4px를 제외하면 항목 사이 여백은 약 16px로, 기준보다 8px 좁다. | §3: 폼 항목 사이 24px, 라벨-입력 세로 간격 4px. | 시각 지적 — 실측 필요 |  |
| 5 | /admin/vendors?new=1 | 768 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 이름 입력 하단 y≈135와 구분 입력 상단 y≈176 사이가 약 41px다. 한 줄 라벨 약 21px와 라벨-입력 간격 4px를 제외하면 항목 사이 여백은 약 16px로, 기준보다 8px 좁다. | §3: 폼 항목 사이 24px, 라벨-입력 세로 간격 4px. | 시각 지적 — 실측 필요 |  |
| 6 | /admin/vendors?new=1 | 1280 | #main-content › div.ListScreen-module__ciqCrG__screen › dialog.SidePanel-module__NCDbBq__panel › div.SidePanel-module__NCDbBq__content | visual | 이름 입력 하단 y≈135와 구분 입력 상단 y≈176 사이가 약 41px다. 한 줄 라벨 약 21px와 라벨-입력 간격 4px를 제외하면 항목 사이 여백은 약 16px로, 기준보다 8px 좁다. | §3: 폼 항목 사이 24px, 라벨-입력 세로 간격 4px. | 시각 지적 — 실측 필요 |  |

## DOM 실측표

### /admin/vendors · 375px (admin_vendors-4117d36b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
…(잘림: 2206바이트 생략)
### /admin/vendors · 320px (admin_vendors-4117d36b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
…(잘림: 2205바이트 생략)
### /admin/vendors · 768px (admin_vendors-4117d36b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2143바이트 생략)
### /admin/vendors · 1280px (admin_vendors-4117d36b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2144바이트 생략)
### /admin/vendors?kind=client · 375px (admin_vendors_kind_client-4299d275-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
…(잘림: 2206바이트 생략)
### /admin/vendors?kind=client · 320px (admin_vendors_kind_client-4299d275-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
…(잘림: 2205바이트 생략)
### /admin/vendors?kind=client · 768px (admin_vendors_kind_client-4299d275-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2143바이트 생략)
### /admin/vendors?kind=client · 1280px (admin_vendors_kind_client-4299d275-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2144바이트 생략)
### /admin/vendors?new=1 · 375px (admin_vendors_new_1-2da4cf60-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |
…(잘림: 5353바이트 생략)
### /admin/vendors?new=1 · 320px (admin_vendors_new_1-2da4cf60-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > nav.vendors-module__sFgu7q__kindNav | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar > div.ListScreen-module__ciqCrG__filters > a.vendors-module__sFgu7q__toggle | 16 |
…(잘림: 5351바이트 생략)
### /admin/vendors?new=1 · 768px (admin_vendors_new_1-2da4cf60-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel | #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel > div.SidePanel-module__NCDbBq__hd | #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel > div.SidePanel-module__NCDbBq__content | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
…(잘림: 5017바이트 생략)
### /admin/vendors?new=1 · 1280px (admin_vendors_new_1-2da4cf60-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel | #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel > div.SidePanel-module__NCDbBq__hd | #main-content > div.ListScreen-module__ciqCrG__screen > dialog.SidePanel-module__NCDbBq__panel > div.SidePanel-module__NCDbBq__content | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
…(잘림: 5018바이트 생략)
### /projects · 375px (projects-902ceeb2-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 1389바이트 생략)
### /projects · 320px (projects-902ceeb2-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div.ListScreen-module__ciqCrG__screen > div | 12 |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row | #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > span.ListEmpty-module__LT6Aja__message | #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | 12 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
…(잘림: 1764바이트 생략)
### /projects · 768px (projects-902ceeb2-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2333바이트 생략)
### /projects · 1280px (projects-902ceeb2-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

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
…(잘림: 2334바이트 생략)
