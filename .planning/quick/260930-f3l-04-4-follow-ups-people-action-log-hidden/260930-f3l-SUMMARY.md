---
phase: quick-260930-f3l
plan: 01
subsystem: admin-screens
tags: [design, people-list, action-log, system-status, css, row-min]
status: complete
commits: 17
plan_head_before: a56ca36bdcc735872c41c6390a5b9bfc32d10daa
requirements: [QUICK-260930-f3l, OPS-03, MAST-02, ADMN-02, ADMN-10]
key-files:
  modified:
    - app/(app)/admin/people/page.tsx
    - app/(app)/admin/people/people.module.css
    - app/(app)/admin/action-log/page.tsx
    - app/(app)/admin/action-log/filter-bar.tsx
    - app/(app)/admin/action-log/action-log.module.css
    - app/(app)/admin/system-status/page.tsx
    - app/(app)/admin/corp-cards/corp-cards.module.css
    - ui/history-list/HistoryList.module.css
    - docs/design/DECISIONS.md
  created:
    - test/unit/app/action-log-filter-people.test.ts
    - test/unit/app/tertiary-underline-css.test.ts
    - test/e2e/table-row-min.spec.ts
    - docs/design/checks/2026-09-30-04.4-follow-ups.md
actuals:
  tokens: 0
  tasks: 3
  commits: 13
---

# Quick 260930-f3l: 04.4 후속 과제 (사람 목록 · 행동 로그 · 상태 화면 · 밑줄 · 행 높이) Summary

권한이 좁은 계급의 사람 목록은 보이는 열만 그리고(모두 가려지면 잠김 한 줄), 등록 링크는 쓰기 권한이 있을 때만 나오며, 3차 링크 밑줄은 hover 2px로 13곳이 통일되고, 재현된 수작업 표(사람 · 행동 로그 · 발령 이력 · 법인카드)는 행 높이가 `--row-min` 이상이 됐다.

## Task 결과

| 항목 | 판정 | 커밋 |
|---|---|---|
| Task 1 RED: 사람 목록 단위(5건 실패) + 1280 간격 E2E(0px 실패) | 실패 실측 | 60421e9 |
| DR-6 쓰기 권한 없으면 「사람 등록」 · ?new=1 폼 없음 | 완료 | 7cc359a |
| DR-4 · DR-5 보이는 열만 · 전부 가림 = 잠김 한 줄 · 접힌 줄 구분자 (+DECISIONS.md) | 완료 | 24ffe67 |
| DR-7 「상세」↔「삭제」 --s-4 | 완료 | 03691d2 |
| Task 2 RED: 행동 로그 필터 단위(2건 실패) + 상태 화면 E2E(일시 normal · target 없음 실패) | 실패 실측 | a48b68e |
| 항목 1 행동 로그 「사람」 필터 id 없는 선택지 · 0명이면 칸째 숨김 | 완료 | a089f3f |
| 항목 8 「일시」 tabular-nums | 완료 | f6a7b8e |
| 항목 9 「실행 기록」 새 탭 + rel noopener noreferrer (+DECISIONS.md) | 완료 | 7a62969 |
| Task 3 항목 5 RED: 밑줄 스윕(13개 규칙 실패) | 실패 실측 | e88ba75 |
| 항목 5 밑줄 base 1px → hover 2px (app 11 · ui 2 = 13규칙, 12파일) | 완료 | 1421a4b |
| 항목 6 표 행 높이 탐침 E2E (재현: 사람 · 행동 로그 · 발령 이력) | 실측 | dac89c9 |
| 항목 6 사람 · 행동 로그 · 발령 이력 `height: var(--row-min)` | 완료 | 2c3d047 |
| 항목 6 법인카드 (전체 실행 데이터에서 재현) | 완료 | d401679 |

## 실측 (CI=true 프로덕션 빌드, Playwright DOM 실측)

### DR-7 「상세」↔「삭제」 간격 (PC 1280)

| 시점 | 간격 |
|---|---|
| 수정 전 | 0px (기대 ≥ 16px) |
| 수정 후 | 17px (반올림 상자 기준, 단언은 --s-4 − 0.5 = 15.5 이상) |
| 중간 실패 | 전체 실행에서 `flex-wrap`이 PC에서도 켜져 있어 표가 좁아지면 동작 칸이 세로로 쌓임(간격 −20.3px) → 줄바꿈은 폰(≤699.98px)만 허용, E2E는 긴 이름으로 표를 좁혀 놓고 잼 |

### 항목 6 표별 주 행 최저 높이 (접힌 줄 제외)

| 표 | 1280 수정 전 | 1280 수정 후 | 375 수정 전 | 375 수정 후 | 재현 | 조치 |
|---|---|---|---|---|---|---|
| 사람(관리자) | 33.5 | 36 | 64 | 64 | 재현 | `.table td` · 행 머리글 th `height` |
| 사람(person.value 꺼짐) | 33.5 | 36 | 42.5 | 44 | 재현 | 위와 같음 |
| 계급 표(같은 `.table`) | 44.5 | 44.5 | 61 | 61 | 미달 없음 | 모양 변화 없음 확인 |
| 거래처 | 35.69 | 36 이상(허용 오차 0.05 스펙 통과) | 109 | 통과 | 독립 DOM 감사 후 미달 확정 | `.table td` `height` + `.collapsedCell` height auto |
| 법인카드 | 35.69 → 전체 실행 35.39 | 통과 | 152.5 | 통과 | 전체 실행 데이터에서 재현 | `.table td` `height` |
| 코드표(관리자, 입력 칸) | 44.5 | 미변경 | 111 | 미변경 | 미달 없음 | 입력 44.5px이 칸 높이를 가렸다 |
| 코드표(보기만 하는 계급, 글자 행) | 34.89 | 36 이상(스펙 통과) | 44 이상(미달 없음) | 통과 | 재현(/review) | `.table td` `height: var(--row-min)`, 폰은 격자 항목이라 `height: auto` + `min-height: var(--row-min)` (칸에 `height`만 주면 입력이 6px 넘쳐 mobile-code-tables 실패 — 실측) |
| 행동 로그 | 34.89 | 36 | 44 | 44 | 재현 | `.table td` `height` + `.collapsedCell` height auto |
| 보관함 | 35.69 | 36 이상(허용 오차 0.05 스펙 통과) | 64 | 통과 | 독립 DOM 감사 후 미달 확정 | `.table td` `height` + `.collapsedCell` height auto |
| 소속 발령 이력(ui/history-list) | 34.89 | 36 | 44.5 | 44.5 | 재현 | `.table td` `height` |

접힌 줄 높이(375, 수정 후): 사람(관리자) 46.5(내용 두 줄) · 사람(가림) 28.5 · 행동 로그 29.7 · 보관함 29.7 — 44로 부풀지 않는다.
계급 표는 `.table td`를 사람 목록과 공유하지만 이미 더 높아 모양이 바뀌지 않는다(44.5 / 61 그대로).

## Deviations from Plan

**1. [Rule 3 - 병합 차이] 밑줄 스윕 실패 목록 13개 (계획 12개)**
- origin/main 병합(09c579a)으로 들어온 `app/(app)/admin/settings/settings.module.css` `.restoreAction`이 같은 패턴(밑줄, hover 없음)이라 스윕에 잡혔다. 계획의 범위 문장(app/ · ui/ 모든 CSS 모듈)에 따라 같이 고쳤다(`:hover`, aria-disabled 미사용). 점검표 「화면:」에 `app/(app)/admin/settings/` 추가.

**2. [Rule 3 - 실측] 법인카드 표도 고쳤다**
- 단독 실행 35.69px는 허용 오차 안이라 재현이 아니었으나, 다른 스펙이 남긴 행이 있는 전체 실행에서 35.39px로 미달이 재현됐다. 재현된 표만 바꾼다는 규칙에 따라 법인카드 CSS를 별도 커밋으로 바꿨다. 거래처 · 보관함은 같은 35.69px로 허용 오차 안이고 전체 실행에서도 통과해 바꾸지 않았다. **미확인 위험:** 이 두 표는 같은 자연 높이(35.69)라 데이터에 따라 CI에서 0.5px를 넘어 미달할 수 있다 — 그러면 같은 한 줄(`min-height` → `height`)로 고친다.

**3. [Rule 1 - 버그] DR-7 flex-wrap을 폰에서만**
- 실측 참조. PC에서 wrap을 켜 두면 전체 실행 데이터에서 표가 좁아질 때 동작 칸이 세로로 쌓였다(간격 −20px). 계획은 `flex-wrap: wrap` 항상이었으나 폰만으로 좁혔다.

**4. [테스트 보정] 단위 테스트 helper**
- 전부 가림 경우는 표(tbody)가 없는 것이 정상이라 `render()`가 tbody 없음에서 던지지 않게 했다. 행동 로그 테스트는 체크박스가 id가 없어 `name` 속성으로 확인한다.

**독립 DOM 감사 후속 수정**: (a) 허용 오차 0.5px가 거래처·보관함 PC 35.69px 미달을 가렸다 — 0.05px로 줄이고(0fd0b6d) 두 표를 `height: var(--row-min)`로 고쳤다(6152454, 위 표 갱신). (b) 폰 375에서 사람 목록 「상세」·「삭제」가 세로로 쌓여 간격 0px → 폰 미디어 쿼리 `.rowActions`에 `row-gap: var(--s-4)`(7bf864c 테스트 RED 0px, 9bd8e7e 수정, 통과). 위 Deviation 2의 미확인 위험이 실제로 나타난 경우다.

**5. [/review 수정 · D1 사용자 결정] 행동 로그 actorId**: D1 사용자 결정(2026-09-30): 고를 사람이 없는 계급은 URL actorId를 적용하지 않는다 — 계획 <context>의 「URL actorId 서버 필터는 그대로」를 대체 (조회 필터·내보내기·정리·필터 줄 모두).

**6. [/review 수정 · D2 사용자 결정] 상태 화면 「실행 기록」**: 링크에 sr-only 「 (새 탭)」. W3 실측의 글자 위치 범위를 첫 글자 노드로 좁혔다(sr-only 사각형이 섞여 14px 어긋남 — 측정 문제, 레이아웃 변화 아님).

**7. [/review 수정] 사람 목록**: 계급 열 조건 `hasKey("roleName")`(role.value 키), 빈 목록 action은 canWrite일 때만. 스펙 위생: table-row-min이 만든 계급은 끝에 보관, roles import 병합, people.spec DR-7 describe 제목에서 뷰포트 제거.

**8. 그 외**: 스윕 테스트 규칙 정규식은 계획의 명세대로이며, 커밋 접두어 `test:`는 훅 경고(docs/feat/fix/chore 권장)가 났으나 계획이 지정한 형식을 따랐다.

## 판단 근거

- **DR-4 키 유무 판정:** person-status.ts와 같은 관례이고, 키와 노출 항목의 대응은 PERSON_DTO_SPEC 한 곳에만 둔다(visible()을 화면이 다시 부르면 그 대응을 화면이 알아야 하고 DB 조회가 는다).
- **항목 1 칸째 숨김:** 행위자 이름은 DETAIL_INFO_ITEM이 따로 가려 person.value와 무관하다 — 행에 이름은 보이는데 고를 id가 없는 계급이 있을 수 있다. 「전체」 하나뿐인 select는 할 수 없는 선택이다. URL로 넣은 actorId 서버 필터는 그대로다.

## 범위 밖 관찰 (고치지 않음)

- 사람 목록 ListEmpty 「등록된 사람이 없습니다 · 사람 등록」 분기는 보는 사람 자신이 늘 목록에 있어 사실상 닿지 않는다. 쓰기 권한 없는 계급에 이 분기가 닿으면 「사람 등록」 action이 남는다(ListEmpty 쪽 조건은 손대지 않음).
- 상태 화면의 배포 버전 · DB 커넥션 · 마지막 백업 값에는 `.num`이 없다(04.4 이전 코드).
- ui/toast `.action`의 `text-underline-offset: 2px` 리터럴은 `--underline-offset`(2px)과 값이 같다 — 바꾸지 않았다.
- 다른 관리자 표 동작 칸(거래처 · 법인카드 · 코드표 등)의 행동 사이 간격은 이 quick 범위 밖이다.
- 「실행 기록」에 새 탭 안내 글자 · 아이콘은 더하지 않았다(§7 문구 최소).
- prettier는 기존 filter-bar.tsx에서도 경고가 나는 상태이고 프로젝트 게이트(eslint/stylelint)에는 없다.

## 게이트 결과 (로컬)

- `pnpm lint`(eslint + stylelint): 통과 (exit 0)
- `pnpm typecheck`: 통과
- `pnpm test:unit`: 170 files / 2256 tests 통과
- 통합 테스트: domain/repositories/db를 건드리지 않아 실행하지 않음
- `CI=true pnpm exec playwright test <Task 3 verify 스펙 15개>`: 562 passed, 0 failed (desktop 전체 포함)
- domain/ · db/ · .github/ · infra/ · .claude/ 변경 없음, 새 의존성 없음, push 없음

## 오케스트레이터 인계

- 독립 DOM 감사(PLAN `<verification>` 목록): 폭 360 · 375 · 640 · 700 · 768 · 900 · 1280. 특히 (a) 사람 목록 4가지 계급(관리자 · 계급/팀만 보임 · 세 항목 모두 꺼짐 = 잠김 한 줄 · 보기만 있는 계급의 「사람 등록」 유무), (b) 행동 로그 「사람」 칸 유무, (c) 상태 화면 target/rel · 일시 tabular-nums · 폰 44 · W3 · W-A, (d) 밑줄 13곳 hover 1px → 2px(aria-disabled 복원 버튼은 그대로), (e) 행 높이를 바꾼 화면(사람 · 행동 로그 · 법인카드 · 사람 상세 발령 이력)의 폰 접힌 줄 부풀음과 넘침.
- 디자인 결정 기록: `docs/design/DECISIONS.md` 두 항목(사람 목록 잠김 한 줄 · 앱 밖 링크 새 탭). 사용자 결정 「DECISIONS.md에만」에 따라 CHECKLIST.md는 고치지 않았다.
- 점검표: `docs/design/checks/2026-09-30-04.4-follow-ups.md` (빈칸 없음, 화면: 12개 폴더 + ui/history-list).

## Self-Check: PASSED

- 13개 커밋 모두 `git log`에서 확인(a56ca36..HEAD = 13, 측정값).
- 생성 파일 존재: action-log-filter-people.test.ts · tertiary-underline-css.test.ts · table-row-min.spec.ts · 점검표.
