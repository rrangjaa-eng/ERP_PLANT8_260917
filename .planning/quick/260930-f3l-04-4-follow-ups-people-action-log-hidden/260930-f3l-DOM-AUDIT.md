# 260930-f3l 독립 DOM 감사

- 감사자: 독립 에이전트(실행자 아님). 방법: `CI=true pnpm build` 프로덕션 빌드 + `pnpm start`(playwright.config.ts webServer, DB erp_test) 위에서 Playwright로 getComputedStyle · getBoundingClientRect · elementFromPoint 실측. 스크린샷 육안 판정 없음.
- 대상 코드: HEAD (`git diff c0b5bdc..HEAD -- app ui`). 폭: 360 · 375 · 640 · 700 · 768 · 900 · 1280. 허용 오차 0.5px.
- 임시 감사 스펙(test/e2e/zz-dom-audit.spec.ts)과 임시 설정(playwright.audit.config.ts)은 실행 뒤 삭제했다. 원본 측정 로그: scratchpad/audit.jsonl · audit2.jsonl.

## 집계

| 판정 | 건수 |
|---|---|
| PASS | 1005 |
| FAIL | 0 |
| UNVERIFIED | 2 |
| N/A | 20 |

N/A = 그 상태에 해당 요소가 애초에 없어 측정 대상이 아님(집계 밖): 접힌 줄이 없는 표(법인카드 · 코드표 · 계급 · 소속 발령 이력)의 「접힌 줄 부풀림」, 삭제 권한 없는 계급의 「상세·삭제 쌍」.

## 결과 요약

- **FAIL 0건.** 계획 must_haves.truths 전 항목과 <verification> DOM 감사 목록이 실측으로 충족된다.
- UNVERIFIED 2건(아래 절), 관찰 3건(FAIL 아님, 아래 절).

## 측정표

### /admin/people [관리자(시스템 관리자)]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 6 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 360 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 360 | 폰: 접힌 줄 보임 | 6/6 | 전부 | PASS |
| 360 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(6행) ≥ --row-min | 64.50px | ≥ 43.5px | PASS |
| 360 | 폰: 표·머리글 행동 요소 44×44 이상 | 12개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 360 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 360 | 폰: 「상세」·「삭제」 배치(참고) | 5/5행 줄바꿈 | (참고) | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 6 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 375 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 375 | 폰: 접힌 줄 보임 | 6/6 | 전부 | PASS |
| 375 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(6행) ≥ --row-min | 64.50px | ≥ 43.5px | PASS |
| 375 | 폰: 표·머리글 행동 요소 44×44 이상 | 12개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 375 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 375 | 폰: 「상세」·「삭제」 배치(참고) | 5/5행 줄바꿈 | (참고) | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 6 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 640 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 640 | 폰: 접힌 줄 보임 | 6/6 | 전부 | PASS |
| 640 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(6행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 폰: 표·머리글 행동 요소 44×44 이상 | 12개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 640 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 640 | 폰: 「상세」·「삭제」 배치(참고) | 0/5행 줄바꿈 | (참고) | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 6 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 700 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 700 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(6행) ≥ --row-min | 96.50px | ≥ 35.5px | PASS |
| 700 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 700 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 6 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 768 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 768 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(6행) ≥ --row-min | 75.50px | ≥ 35.5px | PASS |
| 768 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 768 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 6 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 900 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 900 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(6행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 900 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 900 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["시스템 관리자","기획 PM"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["이름","이메일","계급","현재 소속","상태","동작"] | ["이름","이메일","계급","현재 소속","상태","동작"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 6 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄이 모든 행 뒤에 있음 | 6/6 | 전부 | PASS |
| 1280 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 1280 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(6행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 1280 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 1 | ≥1 | PASS |
| - | ?new=1 등록 폼 유무 | 1 | ≥1 | PASS |

### /admin/people (관리자)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [people-module__nODLsG__toggle] "사람 등록" | 1px→2px | 1px→2px | PASS |
| 1280 | 밑줄 [people-module__nODLsG__detailLink] "상세" | 1px→2px | 1px→2px | PASS |

### /admin/people?new=1

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [people-module__nODLsG__toggle] "취소" | 1px→2px | 1px→2px | PASS |
| 1280 | 밑줄 [people-module__nODLsG__detailLink] "상세" | 1px→2px | 1px→2px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people/roles

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [people-module__nODLsG__toggle] "계급 추가" | 1px→2px | 1px→2px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people/org

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [people-module__nODLsG__toggle] "본부 추가" | 1px→2px | 1px→2px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people [DR-7 긴 행]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 폰 긴 행 「상세」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 360 | 폰 긴 행 「상세」 화면 안 | l=271.6 r=315.6 | 0 ≤ l, r ≤ 360 | PASS |
| 360 | 폰 긴 행 「삭제」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 360 | 폰 긴 행 「삭제」 화면 안 | l=271.6 r=315.6 | 0 ≤ l, r ≤ 360 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 폰 긴 행 「상세」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 375 | 폰 긴 행 「상세」 화면 안 | l=284.0 r=328.0 | 0 ≤ l, r ≤ 375 | PASS |
| 375 | 폰 긴 행 「삭제」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 375 | 폰 긴 행 「삭제」 화면 안 | l=284.0 r=328.0 | 0 ≤ l, r ≤ 375 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 폰 긴 행 「상세」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 640 | 폰 긴 행 「상세」 화면 안 | l=500.1 r=544.1 | 0 ≤ l, r ≤ 640 | PASS |
| 640 | 폰 긴 행 「삭제」 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 640 | 폰 긴 행 「삭제」 화면 안 | l=560.1 r=604.1 | 0 ≤ l, r ≤ 640 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 긴 행: 「상세」↔「삭제」 간격 | 16.00px | ≥ 16px | PASS |
| 700 | 긴 행: 「삭제」가 「상세」와 같은 줄 | top 791.9 vs 791.4 | 같은 줄 | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 긴 행: 「상세」↔「삭제」 간격 | 16.00px | ≥ 16px | PASS |
| 768 | 긴 행: 「삭제」가 「상세」와 같은 줄 | top 655.4 vs 654.9 | 같은 줄 | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 긴 행: 「상세」↔「삭제」 간격 | 16.00px | ≥ 16px | PASS |
| 900 | 긴 행: 「삭제」가 「상세」와 같은 줄 | top 529.4 vs 528.9 | 같은 줄 | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 긴 행: 「상세」↔「삭제」 간격 | 16.00px | ≥ 16px | PASS |
| 1280 | 긴 행: 「삭제」가 「상세」와 같은 줄 | top 395.9 vs 395.4 | 같은 줄 | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people [person 꺼짐 · role+team 켜짐]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 7 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 360 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 360 | 폰: 접힌 줄 보임 | 7/7 | 전부 | PASS |
| 360 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(7행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 7 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 375 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 375 | 폰: 접힌 줄 보임 | 7/7 | 전부 | PASS |
| 375 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(7행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 7 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 640 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 640 | 폰: 접힌 줄 보임 | 7/7 | 전부 | PASS |
| 640 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(7행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 7 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 700 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 700 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(7행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 7 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 768 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 768 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(7행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 7 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 900 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 900 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(7행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["시스템 관리자","기획 PM","E2E감사 계급팀 493a25"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["계급","현재 소속"] | ["계급","현재 소속"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 7 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (2칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄이 모든 행 뒤에 있음 | 7/7 | 전부 | PASS |
| 1280 | 접힌 줄 colSpan = 보이는 열 수(2) | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 구분자: 값 1개 · 앞뒤 구분자 없음 | 예: "—" | 값 사이에만 ' · ' | PASS |
| 1280 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(7행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /admin/people [team 켜짐만]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 8 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(8행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 8 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(8행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 8 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(8행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 8 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(8행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 8 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(8행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 8 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(8행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | [] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["현재 소속"] | ["현재 소속"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 8 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(8행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /admin/people [role 켜짐만]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 9 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(9행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 9 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(9행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 9 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(9행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 9 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(9행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 9 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(9행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 9 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(9행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["시스템 관리자","기획 PM","E2E감사 계급팀 493a25","E2E감사 팀만 2b1f03","E2E감사 계급만 c0f4ab"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["계급"] | ["계급"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 9 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (1칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄 없음(접을 값 없음) | 0행에 있음 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(9행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /admin/people [person+team 켜짐 · role 꺼짐 · 보기만]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 10 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 360 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 360 | 폰: 접힌 줄 보임 | 10/10 | 전부 | PASS |
| 360 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(10행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 360 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 360 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 10 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 375 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 375 | 폰: 접힌 줄 보임 | 10/10 | 전부 | PASS |
| 375 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(10행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 375 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 375 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 10 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 640 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 640 | 폰: 접힌 줄 보임 | 10/10 | 전부 | PASS |
| 640 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(10행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 640 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 10 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 700 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 700 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(10행) ≥ --row-min | 75.50px | ≥ 35.5px | PASS |
| 700 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 10 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 768 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 768 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(10행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 768 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 10 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 900 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 900 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(10행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 900 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["—"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["이름","이메일","계급","현재 소속","상태","동작"] | ["이름","이메일","계급","현재 소속","상태","동작"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 10 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄이 모든 행 뒤에 있음 | 10/10 | 전부 | PASS |
| 1280 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-0e721d3d-dda3-415b-9a59-f9107ac7b4d5@example.test · — · —" | 값 사이에만 ' · ' | PASS |
| 1280 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(10행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /admin/people [전부 켜짐 · 보기만(쓰기 없음)]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 11 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 360 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 360 | 폰: 접힌 줄 보임 | 11/11 | 전부 | PASS |
| 360 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(11행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 360 | 폰: 표·머리글 행동 요소 44×44 이상 | 11개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 360 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 11 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 375 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 375 | 폰: 접힌 줄 보임 | 11/11 | 전부 | PASS |
| 375 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(11행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 375 | 폰: 표·머리글 행동 요소 44×44 이상 | 11개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 375 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 11 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 640 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 640 | 폰: 접힌 줄 보임 | 11/11 | 전부 | PASS |
| 640 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(11행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 폰: 표·머리글 행동 요소 44×44 이상 | 11개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 640 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 11 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 700 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 700 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(11행) ≥ --row-min | 96.50px | ≥ 35.5px | PASS |
| 700 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 11 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 768 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 768 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(11행) ≥ --row-min | 75.50px | ≥ 35.5px | PASS |
| 768 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 11 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 900 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 900 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(11행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 900 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["시스템 관리자","기획 PM","E2E감사 계급팀 493a25","E2E감사 팀만 2b1f03","E2E감사 계급만 c0f4ab","E2E감사 사람팀 e4a428","E2E감사 전부보기 b962fd"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["이름","이메일","계급","현재 소속","상태","동작"] | ["이름","이메일","계급","현재 소속","상태","동작"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 11 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄이 모든 행 뒤에 있음 | 11/11 | 전부 | PASS |
| 1280 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-07908a24-1678-4693-a203-b641686f7dac@example.test · 시스템 관리자 · —" | 값 사이에만 ' · ' | PASS |
| 1280 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(11행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | DR-7 상세·삭제 쌍 | 쌍 없음 — 삭제 권한 없음 또는 행 없음 | ≥1 | N/A |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /admin/people [세 항목 꺼짐 → 잠김 한 줄]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 표(<table>) 없음 | 0 | 0 | PASS |
| 360 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 360 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 360 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 360 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 표(<table>) 없음 | 0 | 0 | PASS |
| 375 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 375 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 375 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 375 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 표(<table>) 없음 | 0 | 0 | PASS |
| 640 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 640 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 640 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 640 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 표(<table>) 없음 | 0 | 0 | PASS |
| 700 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 700 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 700 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 700 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 표(<table>) 없음 | 0 | 0 | PASS |
| 768 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 768 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 768 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 768 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 표(<table>) 없음 | 0 | 0 | PASS |
| 900 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 900 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 900 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 900 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 표(<table>) 없음 | 0 | 0 | PASS |
| 1280 | 잠김 한 줄 「정보 노출표 · 사람 정보 잠김」 정확히 1개 | 1개 "정보 노출표 · 사람 정보 잠김" | 1개 | PASS |
| 1280 | 그 줄에 링크·버튼 없음 | 0 | 0 | PASS |
| 1280 | 「등록된 사람이 없습니다」 없음 | 없음 | 없음 | PASS |
| 1280 | main 안에 「사람 등록」 없음 | 없음 | 없음 | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/action-log [관리자]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 「사람」 칸(라벨+select) 존재 | label=사람 select=true | 존재 | PASS |
| 1280 | 선택지 중 빈 value·빈 이름 없음(첫 「전체」 제외) | 15개 모두 유효 | 0개 | PASS |
| 1280 | 첫 선택지 = 「전체」(value 빈) | {"v":"","t":"전체"} | {"v":"","t":"전체"} | PASS |
| 1280 | 사람 선택으로 필터 제출 → URL actorId + 화면 정상 | url=?actorId=W9KEC82PUa2fGFdOYz0P25syYAsBXtya&from=&to=&actionTy heading=true err=0 | actorId 포함 · 오류 없음 | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (57행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 360 | 접힌 줄 부풀림 없음 (57줄, 최대 높이 106.4) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (57행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 375 | 접힌 줄 부풀림 없음 (57줄, 최대 높이 87.3) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (57행) ≥ --row-min | 44.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄 부풀림 없음 (57줄, 최대 높이 48.9) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (57행) ≥ --row-min | 57.28px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (57행) ≥ --row-min | 57.28px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (57행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (57행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/action-log?actionType (필터 지우기)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [action-log-module__iZuPIG__toggle] "필터 지우기" | 1px→2px | 1px→2px | PASS |

### /admin/action-log?actionType=document_create

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/action-log [admin.action-log 보기 + person.value 꺼짐]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| - | HTTP 상태 | 200 | 200 | PASS |
| 360 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 「사람」 칸(라벨+select) 없음 · 다른 칸은 있음 | select=false label=false labels=시작일\|종료일\|행동 종류\|문서 번호\|정리 포함 | 사람 없음, 시작일·행동 종류 있음 | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| 1280 | 필터 제출(행동 종류) → 화면 정상 | url=?from=&to=&actionType=login&documentId= heading=true err=0 actorId파라미터=false | 정상 · 오류 없음 | PASS |
| 1280 | 필터 제출(시작일) → 화면 정상 | url=?from=2026-01-01&to=&actionType=login&documentId= heading=true | 정상 | PASS |

### /admin/system-status

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| - | 「실행 기록」 target=_blank | _blank | _blank | PASS |
| - | 「실행 기록」 rel noopener noreferrer | noopener noreferrer | noopener noreferrer 포함 | PASS |
| - | 일시(2026-09-24 03:14) font-variant-numeric | {"tag":"SPAN","cls":"system-status-module__PWgnza__num","numeric":"tabular-nums"} | tabular-nums 포함 | PASS |
| 360 | W3: dd 줄 높이가 링크 display 무관(기준=inline) | asIs=85.00 ref=85.00 | 차 ≤ 1px | PASS |
| 360 | W3: 링크 글자 위치 불변 | asIs=74.00 ref=74.00 | 차 ≤ 1px | PASS |
| 360 | 폰: 링크 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 360 | 폰: 링크 화면 안 | x=110.0 right=154.0 | 0 ≤ x, right ≤ 360 | PASS |
| 360 | W-A: 44×44 상자 25점 elementFromPoint 적중 | 25/25 | 25/25 | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | W3: dd 줄 높이가 링크 display 무관(기준=inline) | asIs=85.00 ref=85.00 | 차 ≤ 1px | PASS |
| 375 | W3: 링크 글자 위치 불변 | asIs=74.00 ref=74.00 | 차 ≤ 1px | PASS |
| 375 | 폰: 링크 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 375 | 폰: 링크 화면 안 | x=110.0 right=154.0 | 0 ≤ x, right ≤ 375 | PASS |
| 375 | W-A: 44×44 상자 25점 elementFromPoint 적중 | 25/25 | 25/25 | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | W3: dd 줄 높이가 링크 display 무관(기준=inline) | asIs=37.00 ref=37.00 | 차 ≤ 1px | PASS |
| 640 | W3: 링크 글자 위치 불변 | asIs=26.00 ref=26.00 | 차 ≤ 1px | PASS |
| 640 | 폰: 링크 44×44 | 44.0×44.0 | ≥44×44 | PASS |
| 640 | 폰: 링크 화면 안 | x=571.2 right=615.2 | 0 ≤ x, right ≤ 640 | PASS |
| 640 | W-A: 44×44 상자 25점 elementFromPoint 적중 | 25/25 | 25/25 | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | PC: dd 줄 높이(참고) | 35.39 | (참고) | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | PC: dd 줄 높이(참고) | 35.39 | (참고) | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | PC: dd 줄 높이(참고) | 35.39 | (참고) | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | PC: dd 줄 높이(참고) | 35.39 | (참고) | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| 1280 | 밑줄 [system-status-module__PWgnza__runLink] "실행 기록" | 1px→2px | 1px→2px | PASS |

### /admin/vendors 거래처 표

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (2행) ≥ --row-min | 109.00px | ≥ 43.5px | PASS |
| 360 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (2행) ≥ --row-min | 109.00px | ≥ 43.5px | PASS |
| 375 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (2행) ≥ --row-min | 65.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (2행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (2행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (2행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (2행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/vendors

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [vendors-module__sFgu7q__toggle] "숨김 포함" | 1px→2px | 1px→2px | PASS |

### /admin/corp-cards 법인카드 표

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (1행) ≥ --row-min | 164.50px | ≥ 43.5px | PASS |
| 360 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (1행) ≥ --row-min | 152.50px | ≥ 43.5px | PASS |
| 375 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (1행) ≥ --row-min | 109.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/corp-cards

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [corp-cards-module__KVu_zq__toggle] "숨김 포함" | 1px→2px | 1px→2px | PASS |

### /admin/code-tables 코드표

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (6행) ≥ --row-min | 111.00px | ≥ 43.5px | PASS |
| 360 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (6행) ≥ --row-min | 111.00px | ≥ 43.5px | PASS |
| 375 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (6행) ≥ --row-min | 111.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (6행) ≥ --row-min | 58.88px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (6행) ≥ --row-min | 58.88px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (6행) ≥ --row-min | 58.88px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (6행) ≥ --row-min | 44.50px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/code-tables

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [code-tables-module__bziNDW__toggle] "증빙 종류" | 1px→2px | 1px→2px | PASS |

### /admin/people/roles 계급 표

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (12행) ≥ --row-min | 61.00px | ≥ 43.5px | PASS |
| 360 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (12행) ≥ --row-min | 61.00px | ≥ 43.5px | PASS |
| 375 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (12행) ≥ --row-min | 61.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (12행) ≥ --row-min | 44.50px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (12행) ≥ --row-min | 44.50px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (12행) ≥ --row-min | 44.50px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (12행) ≥ --row-min | 44.50px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/archive 보관함 표

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (1행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 360 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (1행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 375 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (1행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄 부풀림 없음 (1줄, 최대 높이 29.7) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people/<id> 소속 발령 이력(ui/history-list)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (1행) ≥ --row-min | 44.50px | ≥ 43.5px | PASS |
| 360 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (1행) ≥ --row-min | 44.50px | ≥ 43.5px | PASS |
| 375 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (1행) ≥ --row-min | 44.50px | ≥ 43.5px | PASS |
| 640 | 접힌 줄이 부풀지 않음(칸 height 0 강제 시와 동일) | 접힌 줄 없음/숨김 — 접힌 줄 없음 | - | N/A |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (1행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/people 사람 표(관리자)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이 (17행) ≥ --row-min | 64.50px | ≥ 43.5px | PASS |
| 360 | 접힌 줄 부풀림 없음 (17줄, 최대 높이 64.5) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이 (17행) ≥ --row-min | 64.50px | ≥ 43.5px | PASS |
| 375 | 접힌 줄 부풀림 없음 (17줄, 최대 높이 64.5) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이 (17행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 접힌 줄 부풀림 없음 (17줄, 최대 높이 28.5) | 부풀림 최대 0.00px | ≤ 0.5px | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이 (17행) ≥ --row-min | 96.50px | ≥ 35.5px | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이 (17행) ≥ --row-min | 76.00px | ≥ 35.5px | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이 (17행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이 (17행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/archive 오류 토스트 「닫기」

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [Toast-module__7hHhha__action] 「닫기」 | 1px→2px hover=true | 1px→2px | PASS |

### /admin/settings 복원 줄

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [settings-module__5aL-lq__restoreAction] "복원" | 1px→2px | 1px→2px | PASS |

### /admin/settings 복원 줄 표시 상태

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /admin/settings 토스트 「되돌리기」 (ui/toast .action)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [Toast-module__7hHhha__action] | 1px→2px hover=true | 1px→2px | PASS |

### /leave

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [leave-module__rQjX-W__link leave-module__rQjX-W__rowLink] "종일 05-25 ~ 05-26" | 1px→2px | 1px→2px | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /projects/<id> 복원 줄

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [project-detail-module__TCuKga__restoreAction] "복원" | 1px→2px | 1px→2px | PASS |

### /projects/<id> 복원 줄 표시 상태

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /projects/<id> 토스트 「되돌리기」 (ui/toast .action)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [Toast-module__7hHhha__action] | 1px→2px hover=true | 1px→2px | PASS |

### /projects/<id> 충돌 셀 issueAction (덮어쓰기 / 그 값으로)

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [Table-module__ikVkKa__issueAction] "덮어쓰기" | 1px→2px | 1px→2px | PASS |

### /projects/<id> 이전 차수 복원 줄

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | aria-disabled=true 「복사…」 [project-detail-module__TCuKga__restoreAction] hover | 1px→1px hover=true | hover 뒤에도 1px 그대로 | PASS |
| 1280 | 활성 「복사」 hover | 1px→2px hover=true | 1px→2px | PASS |

### /pnl/reserves 복원 줄

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [reserves-module__arr3Pq__restoreAction] "복원" | 1px→2px | 1px→2px | PASS |

### /pnl/reserves 복원 줄 표시 상태

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |

### /pnl/reserves 토스트 「되돌리기」

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 밑줄 [Toast-module__7hHhha__action] | 1px→2px hover=true | 1px→2px | PASS |

### /admin/people [비관리자 · 보기 + 보관 쓰기(삭제 노출)]

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 360 | primary 행 수 | 5 | ≥1 | PASS |
| 360 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 360 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 360 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 360 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 360 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 360 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 360 | 폰: 접힌 줄 보임 | 5/5 | 전부 | PASS |
| 360 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 360 | --row-min 토큰값 | 44px | 44px | PASS |
| 360 | 주 행 최저 높이(5행) ≥ --row-min | 108.00px | ≥ 43.5px | PASS |
| 360 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 360 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 360 | 폰: 「상세」·「삭제」 배치(참고) | 5/5행 줄바꿈 | (참고) | PASS |
| 360 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 360 <= 360 | scrollWidth <= clientWidth | PASS |
| 375 | primary 행 수 | 5 | ≥1 | PASS |
| 375 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 375 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 375 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 375 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 375 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 375 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 375 | 폰: 접힌 줄 보임 | 5/5 | 전부 | PASS |
| 375 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 375 | --row-min 토큰값 | 44px | 44px | PASS |
| 375 | 주 행 최저 높이(5행) ≥ --row-min | 108.00px | ≥ 43.5px | PASS |
| 375 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 375 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 375 | 폰: 「상세」·「삭제」 배치(참고) | 5/5행 줄바꿈 | (참고) | PASS |
| 375 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 375 <= 375 | scrollWidth <= clientWidth | PASS |
| 640 | primary 행 수 | 5 | ≥1 | PASS |
| 640 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 640 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 640 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 640 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 640 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 640 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 640 | 폰: 접힌 줄 보임 | 5/5 | 전부 | PASS |
| 640 | 폰: 접힌 줄 부풀림 없음 | 0.00px | ≤0.5px | PASS |
| 640 | --row-min 토큰값 | 44px | 44px | PASS |
| 640 | 주 행 최저 높이(5행) ≥ --row-min | 64.00px | ≥ 43.5px | PASS |
| 640 | 폰: 표·머리글 행동 요소 44×44 이상 | 10개 모두 ≥44 | 전부 ≥44×44 | PASS |
| 640 | 폰: 행동 요소가 화면 안 | 전부 안 | 0개 밖 | PASS |
| 640 | 폰: 「상세」·「삭제」 배치(참고) | 0/5행 줄바꿈 | (참고) | PASS |
| 640 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 640 <= 640 | scrollWidth <= clientWidth | PASS |
| 700 | primary 행 수 | 5 | ≥1 | PASS |
| 700 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 700 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 700 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 700 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 700 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 700 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 700 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 700 | --row-min 토큰값 | 36px | 36px | PASS |
| 700 | 주 행 최저 높이(5행) ≥ --row-min | 96.50px | ≥ 35.5px | PASS |
| 700 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 700 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 700 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 700 <= 700 | scrollWidth <= clientWidth | PASS |
| 768 | primary 행 수 | 5 | ≥1 | PASS |
| 768 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 768 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 768 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 768 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 768 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 768 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 768 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 768 | --row-min 토큰값 | 36px | 36px | PASS |
| 768 | 주 행 최저 높이(5행) ≥ --row-min | 96.50px | ≥ 35.5px | PASS |
| 768 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 768 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 768 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 768 <= 768 | scrollWidth <= clientWidth | PASS |
| 900 | primary 행 수 | 5 | ≥1 | PASS |
| 900 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 900 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 900 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 900 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 900 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 900 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 900 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 900 | --row-min 토큰값 | 36px | 36px | PASS |
| 900 | 주 행 최저 높이(5행) ≥ --row-min | 54.50px | ≥ 35.5px | PASS |
| 900 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 900 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 900 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 900 <= 900 | scrollWidth <= clientWidth | PASS |
| 1280 | 계급 칸 값(참고: 고유값) | ["기획 PM","E2E감사 보기보관 18c2c3"] | (참고) | PASS |
| 1280 | 열 머리글 목록 | ["이름","이메일","계급","현재 소속","상태","동작"] | ["이름","이메일","계급","현재 소속","상태","동작"] | PASS |
| 1280 | 가려진 열(이름·이메일·상태·동작 중 비노출) 머리글 없음 | 없음 | 없음 | PASS |
| 1280 | primary 행 수 | 5 | ≥1 | PASS |
| 1280 | 행마다 칸 수 = 머리글 수(빈 칸 없음) | 불일치 0행 | 0행 (6칸) | PASS |
| 1280 | 행 머리글 th[scope=row]#people-row-<순번>-name = 첫 칸 | 불일치 0행 | 0행 | PASS |
| 1280 | 행 머리글 화면에 보임(폰 포함) | 숨김 0행 | 0행 | PASS |
| 1280 | 접힌 줄이 모든 행 뒤에 있음 | 5/5 | 전부 | PASS |
| 1280 | 접힌 줄 colSpan = 보이는 열 수(6) | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 td[headers] = 행 머리글 id | 불일치 0 | 0 | PASS |
| 1280 | 접힌 줄 구분자: 값 3개 · 앞뒤 구분자 없음 | 예: "e2e-f3ea1af8-fb40-460e-9131-f65fe6028a44@example.test · 기획 PM · E2E팀-72797f7b" | 값 사이에만 ' · ' | PASS |
| 1280 | PC: 접힌 줄 숨김 | 0행 보임 | 0행 | PASS |
| 1280 | --row-min 토큰값 | 36px | 36px | PASS |
| 1280 | 주 행 최저 높이(5행) ≥ --row-min | 36.00px | ≥ 35.5px | PASS |
| 1280 | DR-7 「상세」↔「삭제」 간격(5행 최저) | 16.00px | ≥ 16px | PASS |
| 1280 | DR-7 「삭제」가 「상세」와 같은 줄 | 5/5행 | 전 행 | PASS |
| 1280 | 가로 넘침 없음 (scrollingElement.scrollWidth <= clientWidth) | 1280 <= 1280 | scrollWidth <= clientWidth | PASS |
| - | 「사람 등록」 링크 유무 | 0 | 0 | PASS |
| - | ?new=1 등록 폼 유무 | 0 | 0 | PASS |

### /pnl/reserves · ui/table .issueAction

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| - | 오류·충돌 셀 이유 줄의 행동 버튼(.issueAction) 밑줄 1px→2px | 상태 도달 불가 — reserves-table.tsx가 ui/table을 쓰지만 cellIssue에 actions를 넘기는 코드가 없어(grep 0건) 버튼이 렌더되지 않는다. 같은 .issueAction 규칙은 /projects/<id> 충돌 셀에서 1px→2px PASS로 실측 | 1px→2px | UNVERIFIED |

### /admin/settings .restoreAction

| 폭 | 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| - | aria-disabled="true" 상태에서 hover 두께 불변 | 상태 도달 불가 — settings-form-client.tsx의 .restoreAction 두 버튼은 aria-disabled를 쓰지 않는다. settings.module.css:139는 .restoreAction:hover에 :not([aria-disabled="true"]) 가드가 없다(project-detail·reserves는 있음) — 현재는 도달 불가라 무영향. 동일 가드 동작은 project-detail 「복사…」(aria-disabled)에서 1px→1px PASS로 실측 | hover 뒤에도 1px | UNVERIFIED |

## FAIL 항목

없음(0건).

## UNVERIFIED 항목

1. **/pnl/reserves 의 ui/table `.issueAction`** — reserves-table.tsx는 ui/table을 쓰지만 셀 이유에 행동 버튼(actions)을 넘기는 코드가 없어 로컬에서 그 상태를 만들 수 없다. 같은 `ui/table/Table.module.css .issueAction` 규칙은 /projects/<id> 견적 표 충돌 셀(덮어쓰기 / 그 값으로)에서 1px→2px로 실측 PASS. 다른 화면에서 같은 규칙이 덮이는지는 코드상 그럴 요소가 없다.
2. **/admin/settings `.restoreAction` 의 aria-disabled="true" 상태** — settings-form-client.tsx(695-700행)의 두 버튼은 aria-disabled를 쓰지 않아 그 상태가 없다. 복원 줄 hover 1px→2px는 실측 PASS. aria-disabled 불변 동작은 project-detail의 「복사…」(진행 중, aria-disabled=true)에서 hover 뒤에도 1px으로 실측 PASS(project-detail.module.css:227 `:not([aria-disabled="true"])` 가드).

## 관찰(FAIL 아님 — 계획 must_haves에 정의가 없거나 이번 변경 밖)

1. **person.value 켜짐 + role.value 꺼짐 계급의 사람 목록 「계급」 열이 전부 「—」로 그려진다** (실측: 계급 칸 고유값 ["—"], 접힌 줄 `<이메일> · — · <소속>`). 원인: 열 보임을 DTO 키 유무로 판정하는데 `roleId`가 person.value 소속이라 키가 있고(app/(app)/admin/people/page.tsx `has("roleName") || has("roleId")`), 이름 조회는 listRoles로 하므로 role.value가 꺼진 계급에서는 「—」만 나온다. 계획의 DR-4 truth는 이 조합을 규정하지 않는다(person 꺼짐+role/team 켜짐, 전부 꺼짐, 전부 켜짐만 규정). 열 개수 · colSpan · 행 머리글 · 구분자 · 높이 · 넘침은 이 조합에서도 모두 PASS. 「가려진 정보의 열은 그리지 않는다」 정신으로는 role.value 꺼짐이면 열을 없애는 쪽이 맞을 수 있어 오케스트레이터 판단이 필요하다.
2. **admin.action-log 보기 권한만 있고 action_log.detail 노출이 꺼진 계급은 /admin/action-log가 500**(`domain/action-log/index.ts:265` ForbiddenError "행동 로그 열람 권한 없음"이 던져짐). domain/ 은 이번 diff에 없으므로 기존 동작이다. 「사람」 칸 감사는 action_log.detail 을 켠 계급(person.value 꺼짐)으로 수행했다.
3. settings.module.css `.restoreAction:hover`는 project-detail · reserves와 달리 `:not([aria-disabled="true"])` 가드가 없다. 현재 settings에는 aria-disabled 버튼이 없어 무영향(위 UNVERIFIED 2).

## 판정 근거 요약(계획 truths 대응)

- DR-4/DR-5: 세 계급 상태 모두 열 머리글 = 계획 기대와 정확히 일치, 이름·이메일·상태·동작 열 누출 0, 행 머리글 th[scope=row]#people-row-N-name = 첫 칸이고 폰에서도 보임, 접힌 줄 colSpan = 보이는 열 수, td[headers] = 행 머리글 id, 접힌 줄 값 사이에만 ' · '(앞뒤 구분자 없음), 접을 값 없는 계급(팀만/계급만)에는 접힌 줄 없음.
- DR-4 잠김: 세 항목 꺼짐 계급은 표 0개 · 「정보 노출표 · 사람 정보 잠김」 p 1개 · 그 줄의 링크/버튼 0 · 「등록된 사람이 없습니다」 없음 · 「사람 등록」 없음, 전 폭 넘침 없음.
- DR-6: 쓰기 권한 없는 3개 계급(보기만 · 사람+팀 · 보관 쓰기 포함)에서 「사람 등록」 링크 0 · ?new=1 폼 0, 관리자에서는 각각 ≥1.
- DR-7: 1280 · 900 · 768 · 700에서 관리자 · 비관리자(보관 쓰기) 모든 행 간격 16.00px · 같은 줄, 긴 이름/이메일 행도 16.00px · 같은 줄(상하 0.5px 이내). 폰 360/375/640에서 긴 행 「상세」·「삭제」 44.0×44.0 · 화면 안 · 넘침 없음.
- 항목 1: 관리자 사람 select 선택지 15개 전부 유효(빈 value/이름 없음) · 필터 제출 정상, person.value 꺼짐 계급은 「사람」 라벨+select 없음 · 나머지 필터 유지 · 행동 종류/시작일 제출 정상(actorId 파라미터 없음).
- 항목 8·9: 「일시」 tabular-nums, 「실행 기록」 target=_blank rel="noopener noreferrer", 폰 360/375/640 44×44·화면 안·elementFromPoint 25/25·dd 줄 높이 W3 ≤1px.
- 항목 5: 밑줄 3차 링크 13곳 전부 hover 1px→2px(사람 .toggle·.detailLink, 코드표/거래처/법인카드/행동 로그 .toggle, 상태 .runLink, /leave .link, 설정·프로젝트·리저브 .restoreAction, ui/table .issueAction, ui/toast .action(되돌리기·닫기)), aria-disabled 「복사…」는 hover에 그대로.
- 항목 6: 사람(관리자·가림)·행동 로그·거래처·법인카드·보관함·소속 발령 이력의 주 행 최저 높이가 PC 36 이상 · 폰 44 이상(--row-min 토큰 36/44 확인), 접힌 줄은 칸 height 0 강제 시와 높이가 같아(부풀림 0.00px) 44로 부풀지 않음. 계급 · 코드표는 변경 없이 이미 충족.