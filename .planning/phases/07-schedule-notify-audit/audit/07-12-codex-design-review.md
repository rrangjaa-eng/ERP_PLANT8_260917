# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261021-155953-15861`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261021-155953-15861/codex-output.md`
- 실린 SYSTEM 절: 1-4 · 7-5 · 7-3 · 0 · 3 · 4-1 · 6-0 — 끝 절 일부 잘림
- 핵심 칸 글자(1280) /dev/components — 제목: 컴포넌트 모음 · 금액 칸: 4,200,000
- 핵심 칸 글자(1280) /expenses — 제목: 지출결의 · 금액 칸: 13,640,000
- 핵심 칸 글자(1280) /projects/{projectId} — 제목: 캡처지급정산-5bd961 · 금액 칸: 13,400,000

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /projects/{projectId} | 1280 | #main-content › div.DetailScreen-module__0yNRdq__screen › table.Table-module__ikVkKa__table › thead › tr:nth-of-type\(1\) | visual | 견적 표 머리글 배경이 #E4EAE7\(n-100\)이다. 같은 표의 그룹 줄 #F6F8F7과 달라 개정 11의 머리글 면 통일이 반영되지 않았다. | §7-3 개정 11: 머리글은 --surface-head, 그룹 줄은 --surface-group이며 둘 다 #F6F8F7\(n-50\). --surface-selected\(n-100\)는 선택 면에 사용. | 시각 지적 — 실측 필요 | 결함 아님 — DOM 감사 §1-1 실측 머리글 bg #E4EAE7 · 글자 #00211C. SYSTEM §7-3 「편집 표 머리글 = `--surface-selected` + `--g-950`」 명시(읽기 표 768 머리글은 #F6F8F7). 문서와 일치 |
| 2 | /projects/{projectId} | 320 | #main-content › div.DetailScreen-module__0yNRdq__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(2\) › td.Table-module__ikVkKa__cell:nth-of-type\(3\) | lines | 항목 셀이 105×92px, 3줄이며 ‘제작-5bd96’ 다음 줄에 마지막 ‘1’만 남는다. 항목의 식별 문자열이 중간에서 분리된다. | §7-3 열 폭: 항목명은 keep-all로 줄바꿈 허용. 공백 등 정상 분리 지점에서 접고 식별 문자열 내부의 강제 줄바꿈은 방지. | 105×92px · 3줄 · 자기 넘침 아니오 · 화면 밖 아니오 | 실측 3줄(자동 대조) — 시드 접미사 `-5bd961`이 공백 없는 긴 토큰이라 생기는 줄바꿈. 이 PR이 칸 줄바꿈 CSS를 바꾸지 않음(diff 밖) → 이 PR 결함 아님 · 후속 후보 |
| 3 | /projects/{projectId} | 768 | #main-content › div.DetailScreen-module__0yNRdq__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(4\) › td.Table-module__ikVkKa__cell:nth-of-type\(12\) | visual | 행동 셀에 ‘지출결의 올리기’와 ‘카드 사용 등록’ 두 행동 및 막힘 이유가 함께 남는다. 셀은 115×142px, 6줄로 늘어나 한 행의 행동 위계가 분산된다. | §7-3 \(차\): 행동 셀은 3차 하나 또는 이유 글자 + 3차 하나. 막힌 행동 자리에는 이유를 두고 실행 가능한 다음 행동은 최대 1개. | 시각 지적 — 실측 필요 | 이 PR 범위 밖 — 행동 칸 구성은 견적 표 화면 코드(diff 밖), 개정 11은 면 색만 바꿈. 후속 후보(그 화면 플랜) |
| 4 | /projects/{projectId} | 1280 | #main-content › div.DetailScreen-module__0yNRdq__screen › table.Table-module__ikVkKa__table › tbody › tr:nth-of-type\(4\) › td.Table-module__ikVkKa__cell:nth-of-type\(12\) | visual | 행동 셀에 ‘지출결의 올리기’와 ‘카드 사용 등록’ 두 행동 및 막힘 이유가 함께 표시된다. 넓은 화면에서도 151×103px, 4줄을 차지한다. | §7-3 \(차\): 행동 셀은 3차 하나 또는 이유 글자 + 3차 하나로 구성. | 시각 지적 — 실측 필요 | 21번과 같음 — 이 PR 범위 밖, 후속 후보 |
| 5 | /dev/components | 375 | div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(9\) › div:nth-of-type\(2\) › table.Table-module__ikVkKa__table › tfoot › tr:nth-of-type\(1\) | visual | 폰 합계 행에 부제 ‘3줄’이 그대로 표시된다. 해당 합계 행은 341×51px, 2줄이다. | §7-3 폰 전략: 합계 행 부제인 공급가액·줄 수는 숨기고, 합계와 저장 결과는 유지. | 시각 지적 — 실측 필요 | 이 PR 범위 밖 — tfoot 부제 표시 규칙은 이 diff가 건드리지 않음(합계 줄 CSS 무변경). 후속 후보 |
| 6 | /dev/components | 320 | div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(9\) › div:nth-of-type\(2\) › table.Table-module__ikVkKa__table › tfoot › tr:nth-of-type\(1\) | visual | 폰 합계 행에 부제 ‘3줄’이 그대로 표시된다. 해당 합계 행은 286×51px, 2줄이다. | §7-3 폰 전략: 합계 행 부제인 공급가액·줄 수는 숨기고, 합계와 저장 결과는 유지. | 시각 지적 — 실측 필요 | 23번과 같음 — 이 PR 범위 밖, 후속 후보 |


- 게이트 판정(2026-10-21, DOM 실측만): 이 PR 결함 0. 같은 게이트 `/review`가 DOM으로 찾은 범위 선택 칸 대비(4.31)는 `434c243`에서 고침(7.31 재측정, `07-12-dom-audit.md` 「D1 재측정」).
## DOM 실측표

### /dev/components · 375px (dev_components-dcd2b4e8-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 110×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 113×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 95×44 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(2) > table.Table-module__ikVkKa__table > tfoot > tr:nth-of-type(1) | row | 합계 3줄오류 1칸 · 붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠 | 341×51 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(2) > table.Table-module__ikVkKa__table > tfoot > tr:nth-of-type(1) > td | cell | 합계 3줄오류 1칸 · 붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠 | 341×51 | 2 |  |  |  |
…(잘림: 86982바이트 생략)
### /dev/components · 320px (dev_components-dcd2b4e8-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 110×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 113×40 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 95×44 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(2) > table.Table-module__ikVkKa__table > tfoot > tr:nth-of-type(1) | row | 합계 3줄오류 1칸 · 붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠 | 286×51 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(2) > table.Table-module__ikVkKa__table > tfoot > tr:nth-of-type(1) > td | cell | 합계 3줄오류 1칸 · 붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠 | 286×51 | 2 |  |  |  |
…(잘림: 92994바이트 생략)
### /dev/components · 768px (dev_components-dcd2b4e8-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 105×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 107×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 74×22 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(1) > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) | row | 현수막1245,000숫자 입력540,000 | 726×53 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(1) > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 45,000숫자 입력 | 210×53 | 2 |  |  |  |
…(잘림: 78992바이트 생략)
### /dev/components · 1280px (dev_components-dcd2b4e8-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(1) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 1차 진행 중…처리 중 | 105×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(2) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 2차 진행 중…처리 중 | 107×32 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(3) > div.components-module___3yG4a__samples > span.Button-module__TNl3Yq__wrap:nth-of-type(3) > button.Button-module__TNl3Yq__btn | button | 3차 진행 중…처리 중 | 74×22 | 2 |  |  |  |
| div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(1) > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) | row | 현수막1245,000숫자 입력540,000 | 1238×53 | 2 |  |  |  |
| section.DetailScreen-module__0yNRdq__section:nth-of-type(9) > div:nth-of-type(1) > table.Table-module__ikVkKa__table > tbody:nth-of-type(2) > tr:nth-of-type(2) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 45,000숫자 입력 | 359×53 | 2 |  |  |  |
…(잘림: 76882바이트 생략)
### /expenses · 375px (expenses-ed86b41b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(2) > span.expenses-module__nX7r8a__titleCell > a.expenses-module__nX7r8a__link | link | 캡처지급정산-66547a · 무대 제작-66547a | 111×23 | 1 | 예 |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | 12 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | #main-content > div > div.ListScreen-module__ciqCrG__screen > div | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | 기안b626 | 52×48 | 1 |  |  |  |
…(잘림: 5175바이트 생략)
### /expenses · 320px (expenses-ed86b41b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(2) > span.expenses-module__nX7r8a__titleCell > a.expenses-module__nX7r8a__link | link | 캡처지급정산-66547a · 무대 제작-66547a | 89×23 | 1 | 예 |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | 12 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | #main-content > div > div.ListScreen-module__ciqCrG__screen > div | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 57×48 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | 기안b626 | 52×48 | 1 |  |  |  |
…(잘림: 5174바이트 생략)
### /expenses · 768px (expenses-ed86b41b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div > div.ListScreen-module__ciqCrG__screen > div > table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) | row | 26002-0001캡처지급정산-66547a · 무대 제작-66547a캡처 | 726×50 | 2 |  |  |  |
| div.ListScreen-module__ciqCrG__screen > div > table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(4) | cell | 신한은행****-**-6789테스트 예금주 | 170×50 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | 12 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | #main-content > div > div.ListScreen-module__ciqCrG__screen > div | 0 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > a.TopBar-module__tle3Rq__markLink | link | PLANT8 | 54×48 | 1 |  |  |  |
…(잘림: 6173바이트 생략)
### /expenses · 1280px (expenses-ed86b41b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| div > div.ListScreen-module__ciqCrG__screen > div > table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) | row | 26002-0001증빙 확인 전 · 증빙 확인캡처지급정산-66547a · | 1238×53 | 2 |  |  |  |
| div.ListScreen-module__ciqCrG__screen > div > table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(2) | cell | 26002-0001증빙 확인 전 · 증빙 확인 | 147×53 | 2 |  |  |  |
| div.ListScreen-module__ciqCrG__screen > div > table.Table-module__ikVkKa__table > tbody.Table-module__ikVkKa__rowLinkGroup > tr:nth-of-type(1) > td.Table-module__ikVkKa__cell:nth-of-type(5) | cell | 신한은행****-**-6789테스트 예금주 | 170×53 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | 12 |
| #main-content > div > div.ListScreen-module__ciqCrG__screen | #main-content > div > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__summary | #main-content > div > div.ListScreen-module__ciqCrG__screen > div | 0 |
…(잘림: 10093바이트 생략)
### /projects/{projectId} · 375px (projects_projectId_-26cea9b2-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(3) | row | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 341×52 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(3) > td.Table-module__ikVkKa__collapsedCell | cell | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 341×52 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(5) | row | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 341×51 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(5) > td.Table-module__ikVkKa__collapsedCell | cell | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 341×51 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > section.DetailScreen-module__0yNRdq__section:nth-of-type(5) > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | 1차2026-10-222줄26,800,000승인승인 증빙 | 341×68 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
…(잘림: 30531바이트 생략)
### /projects/{projectId} · 320px (projects_projectId_-26cea9b2-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(2) | row | 1무대·시공무대 제작-5bd961캡처거래처-5bd961113,400,00 | 286×92 | 3 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(2) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 무대 제작-5bd961 | 105×92 | 3 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(3) | row | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 286×52 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(3) > td.Table-module__ikVkKa__collapsedCell | cell | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 286×52 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | 2무대·시공영상 제작-5bd961캡처거래처-5bd961113,400,00 | 286×92 | 3 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) > td.Table-module__ikVkKa__cell:nth-of-type(3) | cell | 영상 제작-5bd961 | 105×92 | 3 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr.Table-module__ikVkKa__collapsedRow:nth-of-type(5) | row | 캡처거래처-5bd961 · 1 · 13,400,000 · 13,400,0 | 286×51 | 2 |  |  |  |
…(잘림: 30504바이트 생략)
### /projects/{projectId} · 768px (projects_projectId_-26cea9b2-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > thead > tr:nth-of-type(1) | row | 번호소분류항목거래처수량단가견적가실행가차익상태비고행동 | 726×46 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | 2무대·시공영상 제작-5bd961캡처거래처-5bd961113,400,00 | 726×142 | 6 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) > td.Table-module__ikVkKa__cell:nth-of-type(12) | cell | 지출결의 올리기카드 사용 1건 연결됨 · 지출결의는 다른 줄카드 사용 등 | 115×142 | 6 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(2) | 41 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(3) | 4 |
…(잘림: 34393바이트 생략)
### /projects/{projectId} · 1280px (projects_projectId_-26cea9b2-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > thead > tr:nth-of-type(1) | row | 번호소분류항목거래처수량단가견적가실행가차익상태비고행동 | 1238×46 | 2 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) | row | 2무대·시공영상 제작-5bd961캡처거래처-5bd961113,400,00 | 1238×103 | 4 |  |  |  |
| #main-content > div.DetailScreen-module__0yNRdq__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(4) > td.Table-module__ikVkKa__cell:nth-of-type(12) | cell | 지출결의 올리기카드 사용 1건 연결됨 · 지출결의는 다른 줄카드 사용 등 | 151×103 | 4 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | 12 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.DetailScreen-module__0yNRdq__meta | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(2) | 41 |
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(2) | #main-content > div.DetailScreen-module__0yNRdq__screen > p.project-detail-module__TCuKga__periodLine:nth-of-type(3) | 4 |
…(잘림: 38412바이트 생략)
