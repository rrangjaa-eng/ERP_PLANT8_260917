# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- 계획: .planning/phases/07-schedule-notify-audit/07-UI-SPEC.md
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261021-055812-4290`
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261021-055812-4290/codex-output.md`
- 실린 SYSTEM 절: 7-3 · 0 · 3 · 4-1 · 6-0 · 6-1 — 끝 절 일부 잘림
- 핵심 칸 글자(1280) /admin/action-log — 제목: 행동 로그 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/people — 제목: 사람 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/people/roles — 제목: 계급 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/permissions — 제목: 권한표 · 금액 칸: 없음
- 핵심 칸 글자(1280) /admin/settings — 제목: 설정 · 금액 칸: 50,000
- 핵심 칸 글자(1280) /admin/vendors — 제목: 거래처 · 금액 칸: 없음
- 핵심 칸 글자(1280) /expenses — 제목: 지출결의 · 금액 칸: 없음
- 핵심 칸 글자(1280) /expenses/new — 제목: 지출결의 · 금액 칸: 없음
- 핵심 칸 글자(1280) /notifications — 제목: 알림함 · 금액 칸: 없음

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /expenses/new | 375 | #expense-form | visual | 스크린샷에서 저장·제출·증빙 안내 영역이 약 y=631~755를 덮고, 이어지는 폼의 증빙 종류·통화 영역과 겹친다. 하단 탭도 y=756부터 폼 위에 놓인다. 가로 넘침이 없어도 입력 영역의 세로 가림은 남는다. | SYSTEM §3의 폼 항목 간격 24px와 폰 입력 높이 40px를 유지하면서 입력·라벨이 고정 행동 영역 및 §6-0의 하단 탭 44px에 가리지 않도록 배치한다. | 시각 지적 — 실측 필요 | 결함 아님 — 375 끝 스크롤에서 formBar y630~755·탭 y755~800, 폼 안 formBarSpacer 112px가 있어 모든 칸이 스크롤로 드러남(elementFromPoint 가림 0). 기존 화면, SC-02 칸 추가 뒤에도 스페이서 유지 |
| 2 | /expenses/new | 320 | #expense-form | visual | 스크린샷에서 저장·제출·증빙 안내 영역이 약 y=631~755에 놓여 후속 필드 영역을 가린다. SC-02의 희망 지급일·희망 사유·예정일 규칙 줄을 추가해도 이 겹침을 해소한다는 계약이 없다. | SYSTEM §6-0의 320px 최소 폭에서도 폼을 사용할 수 있어야 한다. §3의 입력 40px·항목 간격 24px를 유지하고, 고정 행동 줄과 하단 탭에 가려지는 필드가 없도록 한다. | 시각 지적 — 실측 필요 | 결함 아님 — 320 동일 구조(스페이서 112px, 가림 0) |
| 3 | /admin/vendors | 375 | #main-content › div.ListScreen-module__ciqCrG__screen › div.ListScreen-module__ciqCrG__bar | visual | 선택 링크 네 개가 첫 줄의 전체·클라이언트·협력사 세 개와 다음 줄의 숨김 포함 한 개로 나뉜다. 현재 배치는 3+1이다. | SYSTEM §3: 폰에서 선택 링크가 넷 이상이면 repeat\(2, minmax\(0, 1fr\)\)의 2열 격자, 왼쪽 정렬, 각 줄 44px인 두 줄로 고정한다. | 시각 지적 — 실측 필요 | 결함 확정(07 밖 기존) — .filters flex-wrap, 링크 y109 세 개 + y169 한 개(높이 44), grid 아님. 원인 vendors.module.css .kindNav. SC-16은 이 배치를 건드리지 않음 → 07 밖 quick 후보 |
| 4 | /admin/vendors | 320 | #main-content › div.ListScreen-module__ciqCrG__screen › div.ListScreen-module__ciqCrG__bar | visual | 375px와 동일하게 선택 링크 네 개가 3+1로 배치되어 있다. 320px에서도 두 열로 고정되지 않는다. | SYSTEM §3·§6-0: 320~699px에 같은 폰 규칙을 적용한다. 선택 링크 넷은 2열 격자로 44px 두 줄을 구성하며 320px 전용 배치를 추가하지 않는다. | 시각 지적 — 실측 필요 | 결함 확정(07 밖 기존) — 320 좌표 375와 동일(3+1). #3과 한 건 |
| 5 | /expenses | 1280 | #main-content › div.ListScreen-module__ciqCrG__screen | visual | UI-SPEC Typography의 '700은 title·subtitle에만 쓴다'를 SC-01에 적용하면, 읽기 목록 합계 금액의 본문 굵기 700을 사용할 수 없게 된다. 계획 내부의 굵기 제한이 SYSTEM의 합계 위계와 충돌한다. | SYSTEM §7-3·§6-1: 읽기 목록의 표 위 합계 금액은 --text-body 14px·--fw-bold 700이다. UI-SPEC의 700 사용처에 합계 금액을 포함한다. | 시각 지적 — 실측 필요 | 결함 확정(문구) — UI-SPEC:106 「700은 title·subtitle에만」이 SYSTEM.md:129·:409 합계 금액 700과 충돌. 106행에 합계 금액 예외 추가(설계 반영 U17) |
| 6 | /expenses/new | 1280 | #expense-form | visual | UI-SPEC Color의 --surface-base 사용처에 '폼 면'이 포함되어 있다. 이를 SC-02의 페이지 폼 전체에 적용하면 현재 바탕 위 한 열 폼이 흰 면으로 둘러싸이게 된다. | SYSTEM §0: 페이지 배치 폼은 바탕 위 한 열이며 흰 면은 입력 칸이다. SC-02는 --surface-canvas 위에 두고, 흰 폼 면은 옆 패널 폼 등 해당 문맥으로 한정한다. | 시각 지적 — 실측 필요 | 결함 아님 — UI-SPEC:116은 페이지 폼을 --surface-base로 칠하라 하지 않음(SYSTEM.md:15·:98과 모순 없음). 오독 방지로 「옆 패널 폼」으로 좁힘(U17) |

## DOM 실측표

### /admin/action-log · 375px (admin_action_log-89cbdb58-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 15097바이트 생략)
### /admin/action-log · 320px (admin_action_log-89cbdb58-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 15096바이트 생략)
### /admin/action-log · 768px (admin_action_log-89cbdb58-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 16812바이트 생략)
### /admin/action-log · 1280px (admin_action_log-89cbdb58-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 16831바이트 생략)
### /admin/people · 375px (admin_people-e66932d6-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | E2E Admine2e-e10fdb68-1d12-4235-a72c-ee6 | 341×128 | 3 |  |  |  |
…(잘림: 17035바이트 생략)
### /admin/people · 320px (admin_people-e66932d6-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > tbody > tr:nth-of-type(1) | row | E2E Admine2e-e10fdb68-1d12-4235-a72c-ee6 | 286×128 | 3 |  |  |  |
…(잘림: 17020바이트 생략)
### /admin/people · 768px (admin_people-e66932d6-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen > table.Table-module__ikVkKa__table > thead > tr:nth-of-type(1) | row | 이름이메일계급현재 소속상태동작 | 726×67 | 3 |  |  |  |
…(잘림: 16444바이트 생략)
### /admin/people · 1280px (admin_people-e66932d6-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 16358바이트 생략)
### /admin/people/roles · 375px (admin_people_roles-73424962-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 16 |
…(잘림: 10785바이트 생략)
### /admin/people/roles · 320px (admin_people_roles-73424962-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.people-module__nODLsG__rolesTable | 16 |
…(잘림: 10778바이트 생략)
### /admin/people/roles · 768px (admin_people_roles-73424962-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 15691바이트 생략)
### /admin/people/roles · 1280px (admin_people_roles-73424962-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 15718바이트 생략)
### /admin/permissions · 375px (admin_permissions-84eca72b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |
…(잘림: 27200바이트 생략)
### /admin/permissions · 320px (admin_permissions-84eca72b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |
…(잘림: 27199바이트 생략)
### /admin/permissions · 768px (admin_permissions-84eca72b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 1680개(요소 상한 400)

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
…(잘림: 91836바이트 생략)
### /admin/permissions · 1280px (admin_permissions-84eca72b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 1680개(요소 상한 400)

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
…(잘림: 91837바이트 생략)
### /admin/settings · 375px (admin_settings-f6245d45-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
…(잘림: 93118바이트 생략)
### /admin/settings · 320px (admin_settings-f6245d45-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.DetailScreen-module__0yNRdq__screen | #main-content > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #main-content > div.DetailScreen-module__0yNRdq__screen > div.single-column | 12 |
…(잘림: 93115바이트 생략)
### /admin/settings · 768px (admin_settings-f6245d45-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 31개(요소 상한 400)

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 103874바이트 생략)
### /admin/settings · 1280px (admin_settings-f6245d45-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음
- 측정 생략 31개(요소 상한 400)

넘침·줄바꿈 표시 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 103874바이트 생략)
### /admin/vendors · 375px (admin_vendors-4117d36b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3202바이트 생략)
### /admin/vendors · 320px (admin_vendors-4117d36b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3201바이트 생략)
### /admin/vendors · 768px (admin_vendors-4117d36b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3053바이트 생략)
### /admin/vendors · 1280px (admin_vendors-4117d36b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3054바이트 생략)
### /expenses · 375px (expenses-ed86b41b-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3451바이트 생략)
### /expenses · 320px (expenses-ed86b41b-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3450바이트 생략)
### /expenses · 768px (expenses-ed86b41b-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 3782바이트 생략)
### /expenses · 1280px (expenses-ed86b41b-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div.ListScreen-module__ciqCrG__bar | 16 |
…(잘림: 4074바이트 생략)
### /expenses/new · 375px (expenses_new-a6d3c117-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen | #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #expense-form | 12 |
| #expense-form | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(1) | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(2) | 24 |
…(잘림: 7148바이트 생략)
### /expenses/new · 320px (expenses_new-a6d3c117-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen | #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #expense-form | 12 |
| #expense-form | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(1) | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(2) | 24 |
…(잘림: 7146바이트 생략)
### /expenses/new · 768px (expenses_new-a6d3c117-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen | #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #expense-form | 12 |
| #expense-form | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(1) | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(2) | 24 |
…(잘림: 7453바이트 생략)
### /expenses/new · 1280px (expenses_new-a6d3c117-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen | #main-content > div.expense-module__kx56Zq__column > div.DetailScreen-module__0yNRdq__screen > div.DetailScreen-module__0yNRdq__head | #expense-form | 12 |
| #expense-form | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(1) | #expense-form > div.Form-module__qIqsGG__row:nth-of-type(2) | 24 |
…(잘림: 7453바이트 생략)
### /notifications · 375px (notifications-3b17d638-375.png)
- 페이지 가로: scrollWidth 375 / clientWidth 375 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1164바이트 생략)
### /notifications · 320px (notifications-3b17d638-320.png)
- 페이지 가로: scrollWidth 320 / clientWidth 320 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1163바이트 생략)
### /notifications · 768px (notifications-3b17d638-768.png)
- 페이지 가로: scrollWidth 768 / clientWidth 768 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1497바이트 생략)
### /notifications · 1280px (notifications-3b17d638-1280.png)
- 페이지 가로: scrollWidth 1280 / clientWidth 1280 → 넘침 없음
- 안쪽 가로 스크롤: 없음

| 부모 | 앞 | 뒤 | 세로 간격 |
|---|---|---|---|
| #main-content > div.ListScreen-module__ciqCrG__screen | #main-content > div.ListScreen-module__ciqCrG__screen > h1.ListScreen-module__ciqCrG__title | #main-content > div.ListScreen-module__ciqCrG__screen > div | 16 |

나머지 요소

| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |
|---|---|---|---|---|---|---|---|
…(잘림: 1498바이트 생략)
