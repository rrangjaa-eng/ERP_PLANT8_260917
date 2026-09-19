---
phase: 02-design-system-app-shell
plan: 05
subsystem: ui
tags: [next-turn, status-tag, empty-state, routes, react, css-modules]

requires:
  - phase: 02-design-system-app-shell
    provides: "02-04(role-menu.ts의 1차 메뉴 다섯 URL 정본, Shell의 유일한 <main> 랜드마크, (app) 레이아웃의 requireSession 게이트) · 02-03(ui/<component>/<Name>.tsx + .module.css 패턴, tokens.css 참조 관례, ui/button/Button.tsx) · 02-01(SYSTEM.md §7-4·§7-5·§7-7·§6-1 계약, 02-01 체크포인트 H① 「설정」 실라우트 확정)"
provides:
  - "ui/next-turn/build-next-turn-view.ts — 「내 차례」 표시 계약(정렬·6줄 절단·넘침 건수·블록 표시 여부)을 렌더와 분리한 순수 함수(D-24), export buildNextTurnView"
  - "ui/status-tag/StatusTag.tsx — §7-5 상태 태그. 의미 토큰 5종(danger·warning·accent·success·muted) kind prop + 테두리/색-글자 두 variant. 「내 차례」에 실제로 배선됨"
  - "ui/next-turn/NextTurn.tsx — §7-4 「내 차례」 블록. Task 1의 계산 결과만 그대로 렌더(재계산 없음)"
  - "ui/list-empty/ListEmpty.tsx — §7-7 EMPTY 한 줄 + 필수 다음 한 수(action). tone prop으로 오류 톤(2차 버튼) 겸용"
  - "루트가 「내 차례」 홈이 되고(D-28), 1차 메뉴 다섯 + 「설정」 화면 여섯이 신설되어 상단 바의 모든 메뉴가 화면으로 이어진다(D-22)"
affects: [02-06, 02-07]

actuals:
  tokens: 5674
  tasks: 3
  commits: 3
plan_head_before: eaf746d17da2a237dd8559c3e023842025cf6989

tech-stack:
  added: []
  patterns:
    - "「내 차례」의 표시 계산(정렬·절단·넘침 건수)을 렌더 컴포넌트와 완전히 분리된 순수 함수 하나에 둔다 — 컴포넌트는 계산 결과 타입(NextTurnView)만 받아 그대로 그린다. 향후 실데이터 배선은 이 순수 함수의 입력만 바꾸면 된다"
    - "EMPTY/ERROR 두 톤을 공유하는 컴포넌트는 tone prop 하나로 색과 버튼 위계(3차 vs 2차)만 바꾸고 구조는 고정한다(§7-7)"
    - "표시할 다음 한 수가 없는 컴포넌트 API는 아예 만들 수 없게 한다 — ListEmpty의 action prop을 선택적이 아닌 필수로 둬 타입이 §8 규칙 5(안내 문구 대신 행동 유도)를 강제한다"
    - "실물 preview.html의 그리드 배치 기법(explicit grid-column + auto-flow)을 새 값으로 재해석하지 않고 그대로 포트한다 — 이미 검증된 반응형 레이아웃을 재발명하지 않는다"

key-files:
  created:
    - test/unit/ui/next-turn.test.ts
    - ui/next-turn/build-next-turn-view.ts
    - ui/status-tag/StatusTag.tsx
    - ui/status-tag/StatusTag.module.css
    - ui/next-turn/NextTurn.tsx
    - ui/next-turn/NextTurn.module.css
    - ui/list-empty/ListEmpty.tsx
    - ui/list-empty/ListEmpty.module.css
    - app/(app)/projects/page.tsx
    - app/(app)/expenses/page.tsx
    - app/(app)/cards/page.tsx
    - app/(app)/approvals/page.tsx
    - app/(app)/pnl/page.tsx
    - app/(app)/settings/page.tsx
  modified:
    - app/(app)/page.tsx

key-decisions:
  - "§7-4 원문을 그대로 따라 태그→색 대응에서 결재·대기 둘 다 --accent를 쓴다 — §7-5의 일반 규칙(대기=muted)과 다르지만, §7-4가 「내 차례」 블록 전용으로 명시한 값이 더 구체적인 정본이다"
  - "NextTurn의 항목별 「다음 한 수」·「더 보기」 버튼은 ui/button/Button(변형 tertiary)을 그대로 쓴다 — 이 페이즈는 입력이 항상 빈 배열이라 실제 클릭 동작(href 이동)이 렌더되지 않으므로, 실제 항목 데이터가 연결되는 이후 페이즈가 상호작용(링크 이동 여부)을 마저 정한다"
  - "ListEmpty의 다음 한 수는 Button 컴포넌트를 재사용하지 않고 자체 <a> + 로컬 CSS로 3차/2차 버튼 모양을 재현했다 — Button.tsx는 <button>만 렌더하는데 ListEmpty는 이 페이즈부터 실제로 다른 화면으로 이동하는 링크여야 하기 때문(§10: 페이지 이동이면 <a>)"
  - "일곱 화면(루트+다섯 메뉴+설정)의 EMPTY 문구와 다음 한 수를 전부 다르게 쓰고, 서로를 가리키는 순환 링크로 구성했다 — 각 「다음 한 수」가 실제로 갈 수 있는 이미 존재하는 화면이어야 한다는 지시를 지키면서 「할 일이 없습니다」류 문구를 피했다"

patterns-established:
  - "ui/<component>/<Name>.tsx + <Name>.module.css 관례를 next-turn(순수 함수 + 컴포넌트 쌍)·status-tag·list-empty 셋으로 확장 — 02-03/02-04와 같은 구조"
  - "목록 화면 템플릿(화면 제목 h1 + 부제 p + ListEmpty 한 줄)을 CSS·컴포넌트 없이 최소 서버 컴포넌트로 반복 — account/system-status 페이지와 같은 무스타일 관례를 따른다(이 페이즈는 헤더 전용 컴포넌트를 새로 만들지 않는다)"

requirements-completed: []

coverage:
  - id: D1
    description: "build-next-turn-view.ts가 「내 차례」 표시 계약(태그 순서 고정 정렬, 안정 정렬, 정렬 뒤 6줄 절단, 넘침 건수 계산, 0건이면 미표시)을 순수 함수로 고정하고 단위 테스트 10개가 전부 통과한다"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/ui/next-turn.test.ts (10 tests)"
        status: pass
      - kind: other
        ref: "grep 기반 acceptance criteria(React import 0개, 태그 순서 상수가 모듈 안 단일 상수)"
        status: pass
    human_judgment: false
  - id: D2
    description: "StatusTag가 §7-5 의미 토큰 5종 + 테두리/색-글자 두 variant를 계약대로 제공하고, NextTurn이 이를 실제로 배선해 렌더하며(문자열 자리표시자 없음), 항목 0이면 아무것도 렌더하지 않는다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "pnpm build/lint/typecheck 통과 + grep(StatusTag 사용 3회, .sort/.slice 0개, img/svg 0개, 색 리터럴 합계 0개, domain/repositories/db import 0개)"
        status: pass
    human_judgment: true
    rationale: "폰(<700px) 두 줄 접힘의 실제 렌더 결과와 「내 차례」 실데이터가 채워졌을 때의 시각 검토는 이 실행 환경에 브라우저 렌더/스크린샷 도구가 없어 확인할 수 없다(02-04 선례와 같은 제약) — CSS는 preview.html의 검증된 grid 기법을 그대로 포트했지만 픽셀 확인은 사람 몫이다. 또한 이 페이즈의 실제 프로덕션 입력은 항상 빈 배열이라 항목이 있는 상태의 렌더는 코드 경로만 존재하고 실행되지 않는다"
  - id: D3
    description: "ListEmpty가 §7-7 EMPTY 한 줄(무엇이 없다 · 다음 한 수)을 필수 action prop으로 강제하고, tone=error일 때 2차 버튼 모양으로 바뀐다. 표 뼈대·그림·아이콘이 없다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "grep 기반 acceptance criteria(action 속성 필수 — 물음표 없음, img/svg 0개, 색 리터럴 0개)"
        status: pass
    human_judgment: false
  - id: D4
    description: "루트가 「내 차례」 홈이 되어 입력이 빈 배열이고(가짜 데이터 0건), 1차 메뉴 다섯 + 「설정」 화면 여섯이 role-menu.ts의 URL과 정확히 일치하며, 미인증 접근은 로그인으로 리다이렉트된다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts (3) + test/e2e/change-password.spec.ts (1) + test/e2e/system-status.spec.ts (2) — 스펙 파일 무수정, 6 tests"
        status: pass
      - kind: other
        ref: "pnpm build(라우트 12개 생성) + 라우트 대조 node 스크립트(role-menu.ts의 URL 7개 전부 대응 page.tsx 존재) + grep(EMPTY 문구 7개 중복 0, 「할 일이 없습니다」 문구 0, buildNextTurnView 입력이 빈 배열 리터럴)"
        status: pass
    human_judgment: false

duration: 약 20분
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 5: 셸이 진짜 셸임을 증명 — 「내 차례」·상태 태그·목록 EMPTY 컴포넌트 + 루트·1차 메뉴 다섯·설정 화면 Summary

**「내 차례」 표시 계약을 렌더와 분리된 순수 함수로 고정하고 상태 태그·목록 EMPTY 컴포넌트를 신설, 루트를 「내 차례」 홈으로 바꾸고 role-menu.ts가 정한 1차 메뉴 다섯 + 「설정」 화면을 새로 만들어 상단 바의 모든 메뉴가 실제 화면으로 이어지게 했다 — 전 구간 가짜 데이터 0건**

## Performance

- **Duration:** 약 20분 (정확한 시작 시각 미기록 — 근사)
- **Started:** 2026-09-19T16:47:00Z (근사)
- **Completed:** 2026-09-19T17:02:36Z
- **Tasks:** 3
- **Files modified:** 15 (14 신설, 1 수정)

## Accomplishments

- `ui/next-turn/build-next-turn-view.ts` 신설 — 「내 차례」 표시 계약(D-24)을 렌더와 무관한 순수 함수 하나로 고정: 태그 순서 상수(`NEXT_TURN_TAG_ORDER`) 하나로 안정 정렬 → 정렬 뒤 6줄 절단 → 넘침 건수 계산, 항목 0이면 `visible: false`. React import 0개
- `test/unit/ui/next-turn.test.ts`(10 tests) — TDD RED→GREEN으로 8가지 behavior 전부 고정: 0/6/7/20건 경계, 역순 태그 정렬, 동일 태그 안정 정렬, 절단이 정렬 뒤에 일어남(막힘 항목이 6줄 밖으로 밀려나지 않음), 결정성, 입력 불변성, 태그 순서가 단일 상수에서 옴
- `ui/status-tag/StatusTag.tsx` 신설 — §7-5 의미 토큰 5종(danger·warning·accent·success·muted) kind prop + 테두리(`tag`)/색-글자(`text`, 표 상태 열용) 두 variant. `ui/next-turn/NextTurn.tsx`가 이 컴포넌트로 태그를 렌더해 문자열 자리표시자를 두지 않는다
- `ui/next-turn/NextTurn.tsx` 신설 — Task 1의 계산 결과(`NextTurnView`)만 받아 그대로 렌더, 컴포넌트 안에 `.sort()`/`.slice()` 없음. 항목이 0이면(=`visible: false`) `null`을 반환해 빈 상태 문구를 대신 넣지 않는다. 폰(<700px)에서는 preview.html이 이미 검증한 grid 배치(explicit grid-column)를 그대로 포트해 두 줄로 접는다
- `ui/list-empty/ListEmpty.tsx` 신설 — §7-7 EMPTY 한 줄. `action` prop을 필수로 둬 다음 한 수 없이 원인만 쓰는 EMPTY를 타입으로 막는다. `tone` prop으로 오류 톤(2차 버튼, §7-7 ERROR 행)까지 같은 컴포넌트가 감당 — 표 뼈대·그림·아이콘 없음(02-01 DECISIONS.md에 기록된 이탈 그대로)
- `app/(app)/page.tsx`를 「내 차례」 홈으로 재작성(D-28) — `buildNextTurnView([])`로 항상 빈 배열을 넘겨 가짜 데이터를 넣지 않는다. 건수 0이므로 블록이 사라지고 `ListEmpty`가 그 자리에 올라온다. 미인증 → `/login` 리다이렉트 분기 유지
- `app/(app)/{projects,expenses,cards,approvals,pnl}/page.tsx` 신설 — role-menu.ts가 정한 URL 그대로 다섯 화면. 화면 제목 + 부제 + 서로 다른 EMPTY 문구 + 실제로 다른 화면을 가리키는 다음 한 수(순환 링크: 프로젝트→지출결의→법인카드→결재→손익→프로젝트)
- `app/(app)/settings/page.tsx` 신설 — 02-01 체크포인트 H①(라우트를 만든다) 반영, 「계정」 그룹의 마지막 자리
- 라우트 대조 검증(role-menu.ts의 URL 문자열 전부 스캔) 통과 — 7개 고유 단일 세그먼트 URL(`/account`·`/settings`·`/projects`·`/expenses`·`/cards`·`/approvals`·`/pnl`) 전부 대응 화면 존재
- 기존 E2E 세 스펙(login-logout·change-password·system-status, 6 tests)이 **스펙 파일 수정 없이** 전부 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: 「내 차례」 표시 계산 — 순수 함수와 그 계약** - `e40ecf8` (test, TDD)
2. **Task 2: 상태 태그 · 「내 차례」 블록 · 목록 EMPTY 컴포넌트** - `63d96f2` (feat)
3. **Task 3: 루트 홈 · 1차 메뉴 다섯 화면 · 계정 그룹이 가리키는 화면** - `a13f55e` (feat)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified

- `ui/next-turn/build-next-turn-view.ts` - 「내 차례」 표시 계약 순수 함수(신규)
- `test/unit/ui/next-turn.test.ts` - 계약 회귀 테스트 10개(신규)
- `ui/status-tag/StatusTag.tsx` + `StatusTag.module.css` - §7-5 상태 태그(신규)
- `ui/next-turn/NextTurn.tsx` + `NextTurn.module.css` - §7-4 「내 차례」 블록(신규)
- `ui/list-empty/ListEmpty.tsx` + `ListEmpty.module.css` - §7-7 목록 EMPTY(신규)
- `app/(app)/page.tsx` - 「내 차례」 홈으로 재작성(수정)
- `app/(app)/projects/page.tsx` - 프로젝트 목록 EMPTY(신규)
- `app/(app)/expenses/page.tsx` - 지출결의 목록 EMPTY(신규)
- `app/(app)/cards/page.tsx` - 법인카드 목록 EMPTY(신규)
- `app/(app)/approvals/page.tsx` - 결재함 목록 EMPTY(신규)
- `app/(app)/pnl/page.tsx` - 손익 원장 EMPTY(신규)
- `app/(app)/settings/page.tsx` - 설정 화면 EMPTY(신규, H① 반영)

## Decisions Made

- §7-4 원문(결재·대기 둘 다 `--accent`)을 §7-5의 일반 규칙(대기=muted)보다 우선 적용 — 「내 차례」 전용으로 더 구체적인 정본
- NextTurn의 항목별 3차 버튼은 `ui/button/Button`을 그대로 재사용 — 이 페이즈는 입력이 항상 빈 배열이라 실제 이동 동작은 렌더되지 않고, 실데이터가 붙는 이후 페이즈가 링크 여부를 마저 정한다
- ListEmpty의 다음 한 수는 Button이 아니라 자체 `<a>` + 로컬 CSS로 3차/2차 버튼 모양을 재현 — 이 컴포넌트는 이 페이즈부터 실제로 다른 화면으로 이동해야 해서(§10: 페이지 이동이면 `<a>`) `<button>`만 렌더하는 Button과 맞지 않는다
- 일곱 화면의 EMPTY 문구·다음 한 수를 전부 다르게 쓰고 서로를 가리키는 순환 링크로 구성 — 「할 일이 없습니다」류 문구를 피하면서 각 다음 한 수가 실제로 갈 수 있는 화면이어야 한다는 지시를 지켰다

## Deviations from Plan

None - 계획대로 세 태스크를 순서대로 실행했다. TDD(RED→GREEN) 확인, acceptance criteria 재검증 전부 계획대로 동작했다.

## Issues Encountered

- `pnpm playwright test`를 위한 Chromium이 이 세션의 캐시에 없어 `npx playwright install`이 사내 프록시에 막혔다(`cdn.playwright.dev` 403) — `playwright.config.ts`가 이미 클라우드 세션용 사전 설치 경로(`/opt/pw-browsers/chromium`, `CLAUDE_CODE_REMOTE=true`)를 자동 탐색하도록 되어 있었고, 실제로 그 경로에 Chromium이 있어 별도 조치 없이 정상 실행됐다. 코드 문제가 아니라 세션 환경 확인 절차였다

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 상단 바 1차 메뉴 다섯 + 「더보기」 시트의 계정 그룹 전부가 실제 화면으로 이어진다 — 02-06·02-07은 이 EMPTY 자리에 실제 기능을 쌓기만 하면 된다(표는 여전히 Phase 4 범위)
- `ui/next-turn/build-next-turn-view.ts`·`ui/status-tag/StatusTag.tsx`·`ui/list-empty/ListEmpty.tsx` 세 컴포넌트가 서서 이후 페이즈가 재사용할 수 있다 — 특히 `ListEmpty`는 02-06의 오류 페이지(§6-9)가 `tone="error"`로 그대로 쓸 수 있다
- 「내 차례」 폰 두 줄 접힘의 실제 브라우저 렌더는 이 실행 환경에 시각 확인 도구가 없어 사람 확인 대기 항목이다(coverage D2, 02-04와 같은 제약)
- UX-01 요구사항은 이 플랜의 범위를 충족했지만 페이즈 내 다른 플랜(02-06·02-07)과 공유하는 ID라 `requirements.ready-ids`가 아직 「블록」으로 보고한다 — 이 페이즈의 마지막 플랜이 끝나면 자동으로 Complete로 바뀐다(shared-ID gate, 02-04 선례와 동일)

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: all 16 key files/paths (test/unit/ui/next-turn.test.ts, ui/next-turn/build-next-turn-view.ts, ui/status-tag/StatusTag.tsx+.module.css, ui/next-turn/NextTurn.tsx+.module.css, ui/list-empty/ListEmpty.tsx+.module.css, app/(app)/page.tsx, app/(app)/{projects,expenses,cards,approvals,pnl,settings}/page.tsx, this SUMMARY.md)
- FOUND: commits e40ecf8 (Task 1), 63d96f2 (Task 2), a13f55e (Task 3)
- Re-ran all task-level acceptance criteria: all PASS (test case count 10, React-import count 0, StatusTag usage count 3, .sort/.slice count 0 in NextTurn.tsx, color-literal count 0 across three CSS files, img/svg count 0, domain/repositories/db import count 0, ListEmpty action prop non-optional, EMPTY message duplicates 0 across 7 screens, 「할 일이 없습니다」 count 0, route↔menu contrast script `ok 7`)
- Re-ran plan-level `<verification>`: `pnpm build`(success, 12 routes incl. new 6) · `pnpm lint`(0 errors) · `pnpm typecheck`(0 errors) · `pnpm test:unit`(272 passed) · `pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts test/e2e/system-status.spec.ts`(6 passed, spec files unmodified)
