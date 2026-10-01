---
phase: quick-260930-f3l
plan: 01
subsystem: admin-screens
tags: [people-list, action-log, system-status, css, design-gate, dom-measure]
requires:
  - phase: quick-260930-aq2
    provides: 04.4 UI-REVIEW 후속 과제 9건의 출처(DR-2 · DR-4 · DR-5 · DR-6 · DR-7 · DR-8 · 항목 1 · 8 · 9)
provides:
  - 사람 목록이 투영된 DTO 키가 있는 열만 그리고, 열이 하나도 없으면 ListEmpty 잠김 한 줄을 그린다
  - 행동 로그 「사람」 필터에서 id 없는 선택지 제거(0명이면 칸째 숨김)
  - 상태 화면 「일시」 tabular-nums · 「실행 기록」 새 탭
  - 밑줄 3차 링크 13곳의 hover 2px + 소스 스윕 단위 테스트
  - 수작업 표 주 행 --row-min 실측 E2E와 재현된 표의 CSS 수정
affects: [admin-people, admin-action-log, admin-system-status, ui-table, ui-toast, ui-history-list]
tech-stack:
  added: []
  patterns:
    - "열 보임 = people.some(person => key in person) (PERSON_DTO_SPEC이 가린 키는 투영 결과에 없다)"
    - "표 칸 최소 높이 = height: var(--row-min) (전역 border-box, holidays.module.css 선례) + 접힌 줄 칸 height: auto"
key-files:
  created:
    - test/unit/app/action-log-filter-people.test.ts
    - test/unit/app/tertiary-underline-css.test.ts
    - test/e2e/table-row-min.spec.ts
    - docs/design/checks/2026-09-30-04.4-follow-ups.md
  modified:
    - app/(app)/admin/people/page.tsx
    - app/(app)/admin/people/people.module.css
    - app/(app)/admin/action-log/page.tsx
    - app/(app)/admin/action-log/filter-bar.tsx
    - app/(app)/admin/system-status/page.tsx
    - docs/design/DECISIONS.md
    - test/unit/app/people-list-hidden-id.test.ts
    - test/e2e/people.spec.ts
    - test/e2e/system-status.spec.ts
key-decisions:
  - "DR-4: 열 보임 판정은 DTO 키 유무(person-status.ts 관례) — 노출 항목 대응은 PERSON_DTO_SPEC 한 곳에만 둔다"
  - "보이는 열 0이면 표 대신 ListEmpty(action 없음) 「정보 노출표 · 사람 정보 잠김」 (사용자 결정, DECISIONS.md)"
  - "「실행 기록」은 target=_blank rel=noopener noreferrer (사용자 결정, DECISIONS.md)"
  - "행동 로그 사람 필터는 0명이면 칸째 숨김"
  - "DR-7 간격은 --s-4 · PC는 nowrap(wrap이면 표가 칸을 눌러 줄바꿈), 폰만 wrap"
status: complete
metrics:
  duration: "약 3시간(재개 세션)"
  completed: 2026-09-30
actuals:
  tokens: 17000
  tasks: 3
  commits: 15
plan_head_before: c0b5bdc080006799101656edfdcefa88cb9448a4
---

# Phase quick-260930-f3l Plan 01: 04.4 후속 과제 9건 Summary

사람 목록을 「보이는 열만 · 없으면 잠김 한 줄 · 쓰기 권한 없으면 등록 없음 · 상세/삭제 간격 16px」로 고치고, 행동 로그 사람 필터 · 상태 화면 일시/새 탭 · 밑줄 hover 2px · 표 행 높이를 CI=true DOM 실측으로 닫았다.

`commits: 15`는 측정값(`git rev-list --count c0b5bdc..HEAD`)이다 — 이 실행자의 커밋 14개와 오케스트레이터의 docs 커밋 `95d71e3`(aq2 SUMMARY DR-1 줄)이 섞여 있다.

## Task 결과

| Task | 항목 | 판정 | 커밋 |
| ---- | ---- | ---- | ---- |
| 1 | RED: 사람 목록 5경우 단위 + DR-7 E2E | 새 단언이 의도한 이유로 실패(전부 가림 · 이름/이메일 가림 · 팀만 가림 · 쓰기 권한 없음 · 간격 0px), W1 두 테스트 · 모두 보임은 통과 | 812151d |
| 1 | DR-6 「사람 등록」 쓰기 권한 | 닫힘(표시 조건만, accounts.ts:25 서버 판정 그대로) | 442b1a9 |
| 1 | DR-4 · DR-5 · 잠김 한 줄 | 닫힘(DTO 키 유무, DECISIONS.md 항목 추가) | 37bfa8f |
| 1 | DR-7 상세/삭제 간격 | 닫힘(16px), 전체 묶음 실패 뒤 PC nowrap 보정 | 749c936 · 2b576bb |
| 2 | RED: 행동 로그 필터 단위 + 상태 화면 E2E | 가린 · 섞인 경우, 일시 normal, target 빈 값으로 실패 | a68b18c |
| 2 | 항목 1 행동 로그 사람 필터 | 닫힘 | 5f242ce |
| 2 | 항목 8 「일시」 tabular-nums | 닫힘 | a9d9345 |
| 2 | 항목 9 「실행 기록」 새 탭 | 닫힘(DECISIONS.md 항목 추가) | d444efb |
| 3 | RED: 밑줄 스윕 단위 | 실패 13개(계획 12 + 1, 아래 편차) | 868dcec |
| 3 | 항목 5 밑줄 hover 2px | 닫힘(13곳 · app 11 + ui 2) | fb92cc5 |
| 3 | RED: 행 높이 E2E | 사람 · 행동 로그 · 발령 이력 재현 | 1ef2a95 |
| 3 | 항목 6 행 높이 | 사람 · 행동 로그 · 발령 이력 수정 | f4a3a9c |
| 3 | 항목 6 보정 | 법인카드 · 거래처 · 보관함 수정(전체 묶음에서 재현) | 318657d |

## 실측

CI=true 프로덕션 빌드, `test/e2e/table-row-min.spec.ts`(주 행 = collapsedRow가 아닌 tbody tr, 허용 오차 0.5px). 단위 px, 최저 주 행 높이.

### DR-7 「상세」↔「삭제」 간격 (PC 1280)

| 시점 | 간격 |
| ---- | ---- |
| 수정 전 | 0px |
| .rowActions(wrap) 단독 실행 | 16px |
| 전체 묶음(긴 행 존재) | -20.33px(「삭제」가 「상세」 아래로 줄바꿈) — 긴 이름 · 이메일 행을 시드해 재현 |
| nowrap 보정 후(긴 행 시드 포함) | 16px |

### 항목 6 표별 행 높이

| 표 | 1280 수정 전 | 1280 수정 후 | 375 수정 전 | 375 수정 후 | 재현 여부 · 조치 |
| -- | ------------ | ------------ | ----------- | ----------- | --------------- |
| 사람(관리자) | 33.5 | 36 | 65.5 | 65.5 | 재현(PC) · 수정 |
| 사람(person.value 꺼짐 · 계급/팀 켜짐) | 33.5 | 36 | 42.5 | 44 | 재현(PC · 폰) · 수정 |
| 계급 | 44.5 | 44.5 | 61 | 61 | 재현 안 됨 · 변경 없음(사람 `.table td` 변경이 계급 표에도 적용되나 입력 칸 때문에 이미 더 높아 수치 불변) |
| 거래처 | 35.69 | 36 | 109 | 109 | 단독 실행은 오차 안이었으나 같은 결함이라 보정 수정 |
| 법인카드 | 35.69(단독) · 35.39(전체 묶음) | 36 | 153 | 152.5 | 전체 묶음에서 오차 초과로 재현 · 수정 |
| 코드표 | 44.5 | 44.5 | 111 | 111 | 재현 안 됨 · 변경 없음 |
| 행동 로그 | 34.89 | 36 | 44 | 44 | 재현(PC) · 수정 |
| 보관함 | 35.69 | 36 | 64 | 64 | 단독은 오차 안, 같은 패턴이라 보정 수정 |
| 소속 발령 이력(ui/history-list) | 34.89 | 36 | 44.5 | 44.5 | 재현(PC) · 수정 |

접힌 줄 최대 높이(수정 후, 폰 375): 사람(관리자) 46.5 · 사람(가림) 28.5 · 행동 로그 87.25 · 보관함 29.69 — 접힌 줄 칸은 `height: auto`라 44로 부풀지 않는다(내용 줄 수 그대로).

### 항목 5 밑줄 스윕

수정 전 실패 13개 = leave `.link` · action-log / code-tables / corp-cards / people / vendors `.toggle` · people `.detailLink` · system-status `.runLink` · project-detail / reserves / settings `.restoreAction` · ui/table `.issueAction` · ui/toast `.action`. 수정 후 스윕 · reserves-css 단위 테스트 통과.

## 게이트 (로컬)

| 명령 | 결과 |
| ---- | ---- |
| `pnpm lint` | 통과(exit 0, boundaries 플러그인 deprecated 경고만) |
| `pnpm typecheck` | 통과(exit 0) |
| `pnpm lint:sql` | `Found 0 issues in 21 files` |
| `pnpm test:unit` | `Test Files 166 passed (166)` · `Tests 2222 passed (2222)` |
| `pnpm test:integration` | `Test Files 81 passed (81)` · `Tests 2568 passed (2568)` (편집 전 시점 — 이후 변경은 화면 · 테스트 파일뿐) |
| `CI=true pnpm exec playwright test <plan 스펙 15개> --reporter=dot` (프로덕션 빌드 포함, desktop 전체 동반) | 첫 실행: `2 failed · 25 did not run · 529 passed` — 원인 규명 · 수정 후 재실행 `556 passed (11.6m)` exit 0 |
| `CI=true ... table-row-min.spec.ts people.spec.ts` (수정 뒤) | `16 passed` |
| `CI=true ... system-status.spec.ts action-log.spec.ts` | `12 passed` |

전체 E2E는 실행하지 않았다(CLAUDE.md §5 — CI가 한 번 돈다).

## 편차

1. **[Rule 1 - 계획 밖 규칙 추가] 밑줄 스윕 13개(계획 12개)** — origin/main(#105 결재선 설정)이 들여온 `app/(app)/admin/settings/settings.module.css .restoreAction`이 같은 결함이다. 계획은 「다르면 멈추고 SUMMARY에 적는다」였으나 범위가 「app/ · ui/ 모든 CSS 모듈」로 고정이라 같은 규칙으로 함께 고치고 점검표 「화면:」에 settings를 더했다(fb92cc5). aria-disabled를 쓰지 않아 `:hover`만 썼다.
2. **[Rule 1 - Bug] DR-7 간격이 전체 E2E 묶음에서 -20.33px** — `.rowActions`가 `flex-wrap: wrap`이면 다른 열이 긴 행에서 표 자동 레이아웃이 이 칸을 최소 폭으로 눌러 「삭제」가 「상세」 아래로 내려간다. 긴 이름 · 이메일 행을 시드한 프로브로 재현(같은 x, 세로 스택), PC는 `nowrap` + `white-space: nowrap`, 폰(<700)만 wrap으로 바꿔 16px 회복. DR-7 E2E에 긴 행 시드를 더해 고정했다(2b576bb). 계획의 「flex-wrap wrap」과 다르다.
3. **[Rule 1] 법인카드 표 행 높이가 전체 묶음에서 오차 초과(35.39)** — 단독 실행은 35.69(오차 안 = 계획상 재현 안 됨)였으나 데이터에 따라 0.5를 넘어 흔들린다. 같은 min-height 무효 결함이라 거래처 · 법인카드 · 보관함도 `height: var(--row-min)`으로 고쳤다(318657d). 계획은 「재현된 표만」이었고 세 표는 스스로 재현 여부가 흔들리는 경계라 가드가 flaky해지는 것을 막았다.
4. **테스트 도우미 보정** — 단위 테스트의 `render()`가 표(tbody)가 없는 경우를 견디도록 고쳤다(GREEN 커밋 37bfa8f에 포함, RED 커밋과 분리).
5. **점검표** — 계획은 「CHECKLIST.md 미변경」이며 지켰다. `docs/design/checks/2026-09-30-04.4-follow-ups.md`는 화면 커밋과 함께 갱신했다.

## 범위 밖 관찰

- 사람 목록 잠김 줄(ListEmpty)은 쓰기 권한이 있는 계급에서도 목록 머리글 「사람 등록」과 함께 보일 수 있다(등록은 그 계급이 할 수 있는 행동). 「등록된 사람이 없습니다」 분기는 보는 사람 자신이 늘 1행이라 사실상 닿지 않는다.
- 상태 화면의 배포 버전 · DB 커넥션 · 마지막 백업 값에는 `.num`(tabular-nums)이 없다(04.4 이전 코드).
- ui/toast `.action`의 `text-underline-offset: 2px` 리터럴은 `--underline-offset`(2px)과 값이 같아 바꾸지 않았다.
- 다른 관리자 표의 동작 칸(거래처 · 법인카드 · 코드표 · 조직)은 행동 사이 간격을 재지 않았다.
- 「실행 기록」 새 탭 안내 글자 · 아이콘은 더하지 않았다(§7 문구 최소, 요청 밖).
- 계급 표는 사람 `.table td` height 변경이 적용되나 수치 불변(44.5 / 61).

## 오케스트레이터 인계

- 독립 DOM 감사(별도 에이전트, CI=true 프로덕션 빌드): 폭 360 · 375 · 640 · 700 · 768 · 900 · 1280. 대상은 PLAN `<verification>`의 목록 — 사람(관리자 · 계급/팀만 켜진 계급 · 세 항목 모두 꺼진 계급 · 보기만 있는 계급), 행동 로그, 상태 화면, 밑줄을 바꾼 화면 전부(설정 화면 `.restoreAction` 포함), 행 높이를 바꾼 화면(사람 · 행동 로그 · 발령 이력 · 거래처 · 법인카드 · 보관함, 폰 접힌 줄 부풀지 않음).
- 디자인 결정 기록은 `docs/design/DECISIONS.md` 두 항목(DR-4 잠김 줄 · 앱 밖 링크 새 탭). 사용자 결정 2026-09-30에 따라 `.claude/skills/design-gate/CHECKLIST.md`는 고치지 않았다.
- push 하지 않았다. STATE.md · ROADMAP.md · aq2 SUMMARY는 건드리지 않았다.
- 이 브랜치는 `ccr-73fab648-aw1b9o`(계획의 `claude/execute-phase-04-4` 대신, origin/main 85806c7 병합 포함)이다.

## Self-Check: PASSED

- 신규 파일 4개 존재 확인: `test/unit/app/action-log-filter-people.test.ts` · `test/unit/app/tertiary-underline-css.test.ts` · `test/e2e/table-row-min.spec.ts` · `docs/design/checks/2026-09-30-04.4-follow-ups.md`
- 커밋 14개가 `git log`에 있다(812151d … 318657d). 작업 트리 깨끗.
- `commits: 15`는 `git rev-list --count c0b5bdc..HEAD` 측정값(오케스트레이터 docs 커밋 95d71e3 포함).
