# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-102331-31358`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-102331-31358/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/settings | 768 | div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) › div.settings-module__5aL-lq__field:nth-of-type\(1\) › div.TextField-module__WxakZq__row › label.TextField-module__WxakZq__label | visual | 「부가세 절사 단위\(원\)」 라벨의 DOM 실측 폭이 100px으로, 규정된 PC 라벨 폭보다 4px 넓다. 같은 폭이 번호 설정·보안 설정의 라벨에서도 반복된다. | SYSTEM.md §7-2: PC 폼 라벨은 입력 왼쪽 96px. 설정 섹션 내부도 같은 라벨-입력 규칙을 적용한다. | 시각 지적 — 실측 필요 | 실측: 768 라벨 상자 100×46 = `calc(--label-w 96 + --s-1)` · `margin-inline-end -4`라 입력 x 124 = 20+96+8(§7-2 열 그대로). `ui/input/TextField.module.css:76-81` 의도(#158 사파리 2줄 방지). main 같은 값 → **NOT-A-DEFECT · 05-04 밖** |
| 2 | /admin/settings | 1280 | div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(4\) › div.settings-module__5aL-lq__field:nth-of-type\(1\) › div.TextField-module__WxakZq__row › label.TextField-module__WxakZq__label | visual | 「부가세 절사 단위\(원\)」 라벨의 DOM 실측 폭이 100px으로, 규정된 PC 라벨 폭보다 4px 넓다. 화면 폭을 1280px로 넓혀도 동일하다. | SYSTEM.md §7-2: PC 폼 라벨은 입력 왼쪽 96px. | 시각 지적 — 실측 필요 | 실측: 1280도 같음(라벨 100, 입력 x 124). main 같은 값 → **NOT-A-DEFECT**(1과 한 건) |
| 3 | /admin/settings | 768 | div.DetailScreen-module__0yNRdq__screen › div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(3\) › div.settings-module__5aL-lq__field:nth-of-type\(7\) › label.settings-module__5aL-lq__selectLabel | visual | 「원천징수 적용 기준일」은 라벨 아래에 select가 놓여 텍스트 입력과 다른 정렬을 사용한다. 라벨 래퍼 실측은 720×46px·2줄로, 폼 전체 폭을 차지한다. | SYSTEM.md §7-2: 설정 섹션의 필드는 PC에서 라벨 96px을 입력 왼쪽에 배치한다. §6-0: 700–1023px도 PC 규칙을 유지한다. | 시각 지적 — 실측 필요 | 실측: 720×46은 라벨 요소가 감싼 grid 전체 폭. select x 124 · y 1981 = 라벨 글자 y 1981 → 라벨 왼쪽 96 · select 오른쪽(`app/(app)/admin/settings/settings.module.css:42-61` `.selectLabel` grid). main 같은 값 → **NOT-A-DEFECT · 05-04 밖**(라벨 글자 69×36 두 줄은 96 칸 줄바꿈, main 같음) |
| 4 | /admin/settings | 1280 | div.DetailScreen-module__0yNRdq__screen › div.single-column › div › section.DetailScreen-module__0yNRdq__section:nth-of-type\(3\) › div.settings-module__5aL-lq__field:nth-of-type\(7\) › label.settings-module__5aL-lq__selectLabel | visual | 「원천징수 적용 기준일」의 라벨과 select가 위아래로 배치된다. 라벨 래퍼는 720×46px·2줄로 측정되어, PC의 왼쪽 라벨 열 정렬과 일치하지 않는다. | SYSTEM.md §7-2: 설정 섹션에도 PC 라벨 96px·입력 왼쪽 배치 규칙을 적용한다. | 시각 지적 — 실측 필요 | 실측: 1280도 같음. main 같은 값 → **NOT-A-DEFECT**(3과 한 건) |

## 웨이브 5(05-04) 판정 — 2026-10-04, DOM 실측만

- `/design-review` 스킬 호출: 예(보고 전용 — 이 웨이브에서 코드를 고치지 않음). Codex: 실행됨(exit 0) · 후보 4건 — 넷 다 05-04가 건드리지 않은 칸(부가세 절사 단위 · 원천징수 적용 기준일)
- Codex 캡처는 기본 화면만 본다. 그래서 시드한 상태 캡처를 따로 했다(375·320·768·1280, 전부 `CI=true` 빌드):
  설정 기본 · `증빙 크기 한도` 비우고 blur한 형식 오류 · 연차 2단 보관본을 둔 채 새로 고침(복원 줄)
  × 세 나무 — 브랜치(d68d5a9b) · `origin/main`(55647a0b) · 고치기 전 `afc95506`(WINDOWS #42 재현 커밋).
  main에는 05-03의 `지출결의 결재선` 섹션이 없어(섹션 13개, 브랜치 15개) 「두 섹션에 새던」 이전 상태는 `afc95506`에서만 잴 수 있다
- 증거(커밋 안 함): `/mnt/project-files/notes/05-review/wave5/` — `branch-states/` · `main-states/` · `prefix-states/`(PNG + JSON) · `measurements-summary.txt` · `README.md`

| # | 대상 | 판정 | 실측 |
|---|---|---|---|
| D1 | 폰 오류 상태의 단위 글자 `MB` | **DEFECT** | 375 · 320에서 칸 오류(`저장 실패 · 숫자 형식 오류 · 10처럼`)가 뜨면 `MB`가 25px 내려간다: 375 입력 y 11266–11306 · `MB` y 11291–11331(기본 상태는 0 차이). `MB` 세로 가운데 11311이 입력 아래 끝보다 5px 아래 — 입력이 아니라 오류 줄 옆에 붙는다. PC(768 · 1280)는 0 차이. 원인 `app/(app)/admin/settings/settings.module.css:108-112`(`.withUnit` `align-items: flex-end`) + `:125`(`.unit` `margin-bottom: var(--s-4)`)가 「TextField 끝 = 입력 아래 + 16」을 가정하는데 오류 줄(4 + 21)이 그 끝을 25 내린다. 고침 안: 단위를 TextField 바닥이 아니라 입력 줄에 붙인다 — 폰에서도 `align-items: flex-start` + `.unit` 위 여백 = 라벨 줄 높이 + `--s-1`, 또는 TextField에 입력 옆 단위 자리를 두어 같은 줄에서 그린다 |
| D2 | 폰 힌트 간격(다듬기) | **DEFECT(polish)** | 375 · 320에서 `증빙 크기 한도` 입력 아래 → 힌트 20px, 같은 화면의 다른 숫자 칸(`setting-auth.lockout.threshold`)은 16px. PC는 둘 다 20. 원인: TextField `.row`의 `margin-bottom: var(--s-4)`(`ui/input/TextField.module.css:4`)가 `.withUnit` flex 항목 안에 갇혀 `.hint`의 `margin-top: var(--s-1)`과 겹치지 않는다(다른 칸은 겹쳐 16). 고침 안: D1과 함께 단위를 입력 줄에 두면 풀린다. 따로면 폰에서 `.withUnit + .hint { margin-top: 0 }` |
| E1 | 새 섹션 `증빙` · 필드 패턴 | EXPECTED | 섹션이 맨 끝에 붙고 위 내용은 그대로(`부가세 절사 단위(원)` 375 y 2875 · 768 y 2197 — main · 브랜치 같음). 라벨 rgb(82,97,92) 13px/600 · 입력 테두리 1px rgb(124,138,134) · radius 6px · 높이 40(폰)/32(PC) · PC 입력 x 124 · 힌트 x 124 — 기준 칸과 값이 같다. 새 색 · 서체 · radius 없음 |
| E2 | 단위 글자 `MB`(기본 상태) | EXPECTED | 입력 오른쪽 `--s-2` 8px, 입력과 같은 높이 띠(dy 0, 폰 40 · PC 32), 색 · 크기 = 힌트와 같은 rgb(82,97,92) 13px. 입력은 그만큼 좁아짐(375 343→316, 768 616→589). 입력 안 자리표시자 단위 없음(§7-2 number 비고) · 기본값 10 |
| E3 | 형식 오류 상태 | EXPECTED(D1 · D2 빼고) | 오류 글자 `저장 실패 · 숫자 형식 오류 · 10처럼` rgb(155,28,28) = `--status-danger` 13px, 입력 아래 4px, 입력 테두리 위험 색, `aria-invalid=true`, `aria-describedby` = 오류 + 힌트 |
| E4 | 복원 줄 섹션 한정(WINDOWS #42) | EXPECTED · 고쳐짐 | 연차 2단 보관본: `afc95506`은 4폭 모두 `연차 결재선` · `지출결의 결재선` 두 곳에 줄(재현), 브랜치는 `연차 결재선`에만 · `지출결의 결재선` 0. 줄 모양은 main과 같다 — 폰 줄 h 44 · `복원` `버림` 44×44, PC 줄 h 23 · 버튼 34×23(PC 44 규칙 없음), rgb(82,97,92) 13px |
| N1 | 가로 넘침 | 결함 없음 | 세 나무 · 모든 상태 · 4폭 `scrollWidth = clientWidth`, 화면 밖 요소 0 |
| N2 | 폰 터치 대상 | 05-04 새 결함 없음 | 폰에서 44 미만 컨트롤 main 72 → 브랜치 97 — 늘어난 것은 05-03 · 05-04 섹션의 입력(높이 40 = §7-2 폰 입력 정본)과 체크박스. 05-04가 더한 컨트롤은 `증빙 크기 한도` 입력(40, 기준 칸과 같음) 하나, 복원 · 버림은 44×44 |

결론: 05-04 화면 결함 2건(D1 폰 오류 상태 `MB` 25px 처짐 · D2 폰 힌트 간격 +4px, 둘 다 같은 `.withUnit` 구조에서 나옴). WINDOWS #42는 실측으로 고쳐짐 확인. Codex 후보 4건은 05-04 밖이고 결함 아님.

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
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(6) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(8) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(8) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(11) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(11) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(12) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(12) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(13) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(13) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(14) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(14) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(15) | 24 |

…(잘림: 69475바이트 생략)
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
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(6) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(8) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(8) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(9) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(11) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(11) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(12) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(12) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(13) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(13) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(14) | 24 |
| #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(14) | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(15) | 24 |

…(잘림: 69472바이트 생략)
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
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(8) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(10) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(12) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(13) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(15) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(16) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 구분자 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(17) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(18) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 링크 유효 시간(시간) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) > div.settings-module__5aL-lq__field:nth-of-type(5) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 개인정보취급자 비활동 만료(분) | 100×46 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
…(잘림: 70122바이트 생략)
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
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(8) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(10) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(12) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 연도 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(13) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(15) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 연차 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(16) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 구분자 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(17) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 순번 자릿수 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(7) > div.settings-module__5aL-lq__field:nth-of-type(18) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 지출결의 번호 순번 시작값 | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) > div.settings-module__5aL-lq__field:nth-of-type(2) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 확인증 링크 유효 시간(시간) | 100×46 | 2 |  |  |  |
| div.single-column > div > section.DetailScreen-module__0yNRdq__section:nth-of-type(10) > div.settings-module__5aL-lq__field:nth-of-type(5) > div.TextField-module__WxakZq__row > label.TextField-module__WxakZq__label | label | 개인정보취급자 비활동 만료(분) | 100×46 | 2 |  |  |  |

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
…(잘림: 70122바이트 생략)
