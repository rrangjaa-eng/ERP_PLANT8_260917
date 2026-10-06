# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-081737-28004`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-081737-28004/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /dev/components | 320 | div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(9\) › div › table.Table-module__ikVkKa__table › tbody:nth-of-type\(2\) › tr:nth-of-type\(2\) | visual | 편집 표의 ‘현수막’ 행에 오류 이유 접힌 줄이 0개다. PC에서 보이는 ‘숫자 입력’ 오류 이유가 폰에서는 사라져, 해당 행에서 오류와 다음 행동을 확인할 수 없다. | §7-3 폰 전략: P1 셀의 오류 이유는 각 행 아래 P2 접힌 줄로 옮긴다. 오류 행에는 이유가 포함된 접힌 줄 1개가 있어야 한다. | 시각 지적 — 실측 필요 | 실측: 320에서 `p.issueReason`(「숫자 입력」) 0×0·보이지 않음, 「숫자 입력」을 가진 보이는 요소 0개(768·1280은 보임). main도 같은 값 → **05-01과 무관한 기존 결함**(아래 판정 C1) |
| 2 | /dev/components | 375 | div.DetailScreen-module__0yNRdq__screen › section.DetailScreen-module__0yNRdq__section:nth-of-type\(9\) › div › table.Table-module__ikVkKa__table › tbody:nth-of-type\(2\) › tr:nth-of-type\(2\) | visual | 편집 표의 ‘현수막’ 행에 오류 이유 접힌 줄이 0개다. ‘현수막 · 540,000’ 주 행 다음에 합계가 이어져, 숨긴 단가 셀의 오류 이유가 행 아래에 남지 않는다. | §7-3 폰 전략: 숨긴 오류 이유를 해당 행의 P2 접힌 줄 1개에 포함하고, 행 구분선은 접힌 줄 아래에 둔다. | 시각 지적 — 실측 필요 | 실측: 375에서도 같음(이유 0×0, 「현수막 540,000」 행 h 47 · 접힌 줄 없음). main 동일 → 기존 결함(C1과 한 건) |

## 웨이브 2(05-01) 판정 — 2026-10-04, DOM 실측만

- `/design-review` 스킬 호출: 예(보고 전용 — 이 웨이브에서 코드를 고치지 않음). Codex: 실행됨(gpt-6.1-sol · medium, exit 0) · 후보 2건
- Codex 캡처는 빈 결재함만 본다(Codex 스스로 「변경된 결재 표·시트·확인 창은 검증하지 못함」). 그래서 시드한 상태 캡처를 따로 했다:
  팀장 결재함(`내 결재` 1 + `처리함` 1) · 결재 시트 · 시트→반려 확인 · `/leave/[id]` 결재자 화면 · 반려 확인 · 기안자 회수 확인 × 375·320·768·1280,
  같은 스펙을 `origin/main`(55647a0b) 워크트리에서 `CI=true` 빌드로 다시 돌려 비교(이름의 무작위 4자 정규화, ±3px)
- 증거(커밋 안 함): `/mnt/project-files/notes/05-review/wave2/` — `branch-codex/` · `main-codex/` · `branch-states/` · `main-states/`(PNG + JSON) · `states-branch-vs-main.txt` · `README.md`

| # | 대상 | 판정 | 실측 |
|---|---|---|---|
| C1 | Codex 후보 1·2 — `/dev/components` 편집 표 폰 오류 이유 | **기존 결함(05-01 밖)** | 375·320에서 「숫자 입력」 보이는 요소 0개, `p.issueReason` 0×0. 원인 `ui/table/Table.tsx:858-862` — 편집 가능 P2 열은 `summary` 없으면 접힌 줄에서 빠지고, 셀 오류 이유도 접힌 줄로 옮겨지지 않는다(SYSTEM §7-3 :850 「접힌 줄에 … 오류 이유가 들어간다」와 어긋남). main 같은 값. 별도 quick 작업 후보 |
| E1 | 결재함 숫자 열 머리글 서버 값(`measureHeader`) | EXPECTED · 차이 없음 | 머리글 1280·768 `문서·기안·일수·상태·행동`, 375·320 `문서·일수·상태` — main과 같음. 숫자 칸 `3일`·`2일`·`1일` 같음 |
| E2 | 확인 창 제목 `{종류} 반려`·`{종류} 회수` | EXPECTED · 글자 불변 | 결재함·문서 화면 모두 `연차 반려`·`연차 회수`, 창 폭 1280·768 480 / 폰 = 화면 폭, 창 본문 글자 main과 같음 |
| E3 | `/leave/[id]` 화면 | EXPECTED · 불변 | 결재자 화면·반려·회수 확인 4폭 전부 main과 같음(±3px, 이름 정규화) |
| E4 | 결재 시트(onApprove 콜백 추출) | EXPECTED · 불변 | 시트 4폭 main과 같음, `승인` aria-disabled 없음(연차는 막힘 이유 없음) |
| E5 | `/dev/components` `본인 승인` 태그 | EXPECTED(시각 기준 사진 변경 예정) | StatusTag 96→98개, `본인 승인` 색 rgb(14,122,102) = `--status-success`. 768에서 아래 표가 34px 내려감(태그 줄 추가) |
| E6 | 결재함 뼈대 열 5→2(`INBOX_SKELETON_COLUMNS`) | EXPECTED(UI-SPEC :596 Round 6 N4) | 순간 상태라 캡처 안 함 — 코드 근거만 |
| N1 | 시트 `승인` 막힘 상태(E3 `approveBlockedReason`) | 캡처 불가 · 판정 보류 | 이유를 주는 종류가 아직 없음(연차는 null). 처음 쓰는 플랜(정산 결재 05-10 등)의 웨이브 감사에서 실측 |
| N2 | 가로 넘침 | 결함 없음 | 모든 상태·폭 `scrollWidth = clientWidth`, 요소 화면 밖 0 |

결론: 05-01이 만든 화면 결함 0건. 남은 것은 05-01과 무관한 기존 결함 1건(C1).

## DOM 실측표

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
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 연차 목록 보기 | 109×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 91×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 103×44 | 1 |  |  |  |

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
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 연차 목록 보기 | 109×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(1) | nav | 내 차례 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(2) | nav | 결재 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > a.BottomTabs-module__PJycjq__tab:nth-of-type(3) | nav | 손익 | 77×44 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > nav.BottomTabs-module__PJycjq__tabs > button.BottomTabs-module__PJycjq__tab | button | 더보기 | 89×44 | 1 |  |  |  |

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
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 결재 | 728×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 연차 목록 보기 | 104×32 | 1 |  |  |  |

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
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(3) | nav | 법인카드 | 44×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(4) | nav | 결재 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > nav.TopBar-module__tle3Rq__nav > a.TopBar-module__tle3Rq__navLink:nth-of-type(5) | nav | 손익 | 22×23 | 1 |  |  |  |
| div.Shell-module__h6bOmG__shell > header.TopBar-module__tle3Rq__bar > div.TopBar-module__tle3Rq__right > div.TopBar-module__tle3Rq__userWrap > button.TopBar-module__tle3Rq__userTrigger | button | E2E Admin | 61×48 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | heading | 결재 | 1240×29 | 1 |  |  |  |
| #main-content > div.ListScreen-module__ciqCrG__screen > div > p.ListEmpty-module__LT6Aja__row > a.Button-module__TNl3Yq__btn | link | 연차 목록 보기 | 104×32 | 1 |  |  |  |

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
…(잘림: 47853바이트 생략)
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
