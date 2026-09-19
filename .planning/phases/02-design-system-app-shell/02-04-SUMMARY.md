---
phase: 02-design-system-app-shell
plan: 04
subsystem: ui
tags: [shell, navigation, accessibility, react, css-modules, dialog]

requires:
  - phase: 02-design-system-app-shell
    provides: "02-01(SYSTEM.md §6-0 보강 — 사용자 진입점 G①, 「설정」 라우트 H①, 관리자/직원 임시 탭 행, 소속 미표기) · 02-02(ui boundaries, stylelint) · 02-03(ui/<component>/<Name>.tsx + .module.css 패턴, tokens.css 참조 관례)"
provides:
  - "ui/shell/role-menu.ts — 역할 → (상단 바 메뉴, 폰 하단 탭 4개, 계정 그룹, 관리자 시스템 상태 진입점) 매핑 순수 함수 하나(D-23). 1차 메뉴 다섯의 URL 정본"
  - "ui/shell/TopBar.tsx — PC 상단 바. 사용자 이름 클릭 → 열리는 메뉴(체크포인트 G①), Tab만으로 도달·Esc로 닫힘·포커스 복귀"
  - "ui/shell/BottomTabs.tsx + ui/shell/MoreSheet.tsx — 폰 하단 탭 4개 + 「더보기」 시트(네이티브 <dialog>로 포커스 트랩·가림막·Esc-닫힘, 새 의존성 없음)"
  - "ui/shell/Shell.tsx — §10 랜드마크 넷 조립 + 스킵 링크"
  - "app/(app)/layout.tsx — 셸 삽입 지점. 루트 화면과 관리자 시스템 상태 화면이 (app) 그룹 안으로 이동(URL 불변, 접근 제어 세 줄 보존)"
affects: [02-05, 02-06, 02-07]

actuals:
  tokens: 9612
  tasks: 3
  commits: 3
plan_head_before: f9568765b2fc806a174e8f69e7e7bd8357bc8909

tech-stack:
  added: []
  patterns:
    - "역할→메뉴 매핑을 순수 함수 데이터 파일(role-menu.ts) 하나에 몰아 둔다 — 셸 컴포넌트에는 isAdmin 조건문을 두지 않는다. Phase 3이 계급 5종으로 바꿀 때 이 파일 하나만 교체한다"
    - "포커스 트랩이 필요한 시트는 네이티브 <dialog>.showModal()을 쓴다 — 브라우저가 포커스 트랩·가림막(::backdrop)·Esc-닫힘을 제공해 새 런타임 의존성이 없다(02-RESEARCH.md Don't Hand-Roll)"
    - "작은 열림 메뉴(PC 사용자 메뉴)는 트리거 버튼 ref를 저장했다가 Esc/선택 시 그 ref로 포커스를 되돌리는 패턴 — 향후 다른 열림 메뉴에도 재사용 가능"
    - "표시 여부가 뷰포트에 따라 갈리는 컴포넌트(BottomTabs)는 CSS 미디어 쿼리로만 결정하고 JS로 뷰포트 폭을 읽지 않는다 — 서버 렌더 결과가 요청마다 달라지지 않는다"

key-files:
  created:
    - ui/shell/role-menu.ts
    - test/unit/ui/role-menu.test.ts
    - ui/shell/TopBar.tsx
    - ui/shell/TopBar.module.css
    - ui/shell/BottomTabs.tsx
    - ui/shell/BottomTabs.module.css
    - ui/shell/MoreSheet.tsx
    - ui/shell/MoreSheet.module.css
    - ui/shell/Shell.tsx
    - ui/shell/Shell.module.css
    - app/(app)/layout.tsx
    - app/(app)/page.tsx (app/page.tsx에서 이동)
    - app/(app)/admin/system-status/page.tsx (app/admin/system-status/page.tsx에서 이동)
  modified:
    - app/(app)/account/page.tsx

key-decisions:
  - "TopBar.tsx 전체를 클라이언트 컴포넌트로 뒀다 — 체크포인트 G①(열리는 메뉴)이 Esc·포커스 복귀 상태를 요구하고, 02-04 files_modified가 사용자 메뉴만을 위한 별도 클라이언트 파일을 두지 않아 이 파일 하나가 그 상호작용을 감당한다"
  - "MoreSheet의 포커스 트랩은 네이티브 <dialog>.showModal()로 구현했다 — 02-RESEARCH.md의 '포커스 트랩에 새 런타임 의존성을 넣지 않는다' 지시를 문자 그대로 따른 것이고 package.json에 diff가 없다"
  - "PC 사용자 메뉴는 role-menu.ts의 accountGroup에서 href==='/settings' 항목만 걸러 렌더한다(라벨 문자열이 아니라 href로 판별) — SYSTEM.md §6-0 (a)는 PC 메뉴를 「내 정보·로그아웃(+관리자 시스템 상태)」로, §7-8은 폰 시트를 「내 정보·설정·로그아웃」으로 다르게 규정하기 때문. 두 표면이 같은 accountGroup 데이터를 공유하되(D-23) 표면별로 다른 부분집합을 보여준다"
  - "BottomTabs가 '하단 탭에 없는 1차 메뉴'를 topBarMenu와 bottomTabs의 차집합으로 즉석 계산한다 — 새 데이터 원천을 만들지 않고 role-menu.ts가 이미 준 두 목록만 쓴다"
  - "account/page.tsx·system-status/page.tsx의 기존 <main> 태그를 Fragment로 교체했다(Rule 1) — Shell.tsx가 이제 유일한 <main> 랜드마크를 그리므로 중첩 <main>은 접근성 계약(§10) 위반이다"

patterns-established:
  - "ui/shell/<Component>.tsx + <Component>.module.css 관례를 role-menu(데이터)·TopBar·BottomTabs·MoreSheet·Shell 다섯으로 확장 — 02-03의 ui/button·ui/input·ui/auth-frame과 같은 구조"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "role-menu.ts가 역할별 상단 바 메뉴 5개·시스템 상태 진입점·계정 그룹·폰 하단 탭 4개를 순수 함수로 계산하고, SYSTEM.md의 계정 그룹·탭 표 문장을 파싱해 비교하는 단위 테스트 17개가 모두 통과한다"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/ui/role-menu.test.ts (17 tests)"
        status: pass
      - kind: other
        ref: "grep 기반 acceptance criteria(isAdmin 조건문 0개, 1차 메뉴 5개, 소속 문자열 0개, TopBar.module.css 색 리터럴 0개, ui/** domain·repositories·db import 0개)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PC 상단 바 — 딥그린 면·흰 반전 워드마크·1차 메뉴 5개·⌘K 표기, 사용자 이름 클릭 시 열리는 메뉴(체크포인트 G①)로 내 정보·로그아웃(+관리자 시스템 상태)에 닿는다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "pnpm build/lint/typecheck 통과 + 정적 grep 검사(isAdmin·소속 문자열 부재, 색 리터럴 0개)"
        status: pass
    human_judgment: true
    rationale: "Tab만으로 트리거에 도달해 메뉴를 열고 Esc로 닫히며 포커스가 트리거로 돌아오는 실제 키보드 상호작용은 이 플랜에 대응하는 E2E/컴포넌트 렌더 테스트가 없다(환경이 DOM 렌더 도구를 D-20 승인 범위 밖 신규 의존성으로 본다) — 코드 경로(useRef·useEffect·Escape 분기)는 존재하지만 브라우저 실행 확인은 사람 확인으로 남는다"
  - id: D3
    description: "폰 하단 탭 4개(4번째 항상 「더보기」)와 「더보기」 시트 — 검색 자리(비활성+이유), 하단 탭에 없는 1차 메뉴, 계정 그룹을 네이티브 <dialog>로 렌더하고 포커스 트랩·가림막·Esc-닫힘·포커스 복귀를 제공한다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "Task 2 <verify> node 스크립트(use client·Escape·account 배선 존재 확인) + 정적 grep(포커스 복귀 코드·비활성 검색 이유 문자열·색 리터럴 0개·새 의존성 0개)"
        status: pass
    human_judgment: true
    rationale: "네이티브 <dialog>의 포커스 트랩·Esc-닫힘·::backdrop 렌더는 실제 브라우저 엔진 동작에 의존한다(jsdom/vitest node 환경은 <dialog>의 showModal()을 구현하지 않는다) — 375px 폰 뷰포트에서 시트가 실제로 열리고 닫히는지, 첫 행동 요소에 포커스가 가는지는 사람이 브라우저로 확인해야 한다"
  - id: D4
    description: "Shell이 §10 랜드마크 넷(헤더·주 메뉴·본문·폰 하단 탭)과 스킵 링크를 조립하고, app/(app)/layout.tsx가 세션을 읽어 roleMenu()를 Shell에 배선한다. 루트 화면과 관리자 시스템 상태 화면이 (app) 그룹 안으로 이동했고 URL과 접근 제어 세 줄이 이동 전과 동일하다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/login-logout.spec.ts (3) + test/e2e/change-password.spec.ts (1) + test/e2e/system-status.spec.ts (2) — 스펙 파일 무수정, 6 tests"
        status: pass
      - kind: other
        ref: "pnpm build(라우트 충돌 없음) + 접근 제어 세 줄 정규식 대조 스크립트(Task 3 <verify>) + git rename 감지(app/page.tsx→app/(app)/page.tsx, app/admin/system-status→app/(app)/admin/system-status)"
        status: pass
    human_judgment: false
  - id: D5
    description: "폰(375px)에서 가로 스크롤이 생기지 않고, 태블릿 700–1023에서 PC 셸이 그대로 쓰이며 하단 탭이 없다"
    verification: []
    human_judgment: true
    rationale: "must_haves의 backstop 항목 — 실제 375px/태블릿 폭 렌더는 브라우저 시각 확인이 필요하고 이 실행 환경에는 스크린샷 도구가 없다. CSS는 폰 전용 미디어 쿼리(<700px)로 BottomTabs만 노출하고 Shell.module.css의 .main이 태블릿에서 별도 레이아웃 없이 PC 셸 그대로 흐르도록 작성했지만 렌더 확인은 사람 몫이다"

duration: 28min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 4: 공통 셸 — PC 상단 바·폰 하단 탭·「더보기」 시트 Summary

**역할→메뉴 매핑을 순수 함수 하나(role-menu.ts)로 고정하고, 그 데이터만으로 PC 상단 바(열리는 사용자 메뉴)·폰 하단 탭·네이티브 `<dialog>` 「더보기」 시트를 조립해 로그인을 제외한 모든 인증 화면이 같은 셸 안으로 들어왔다 — PC에서도 처음으로 키보드만으로 내 계정·로그아웃에 닿는다**

## Performance

- **Duration:** 28 min
- **Started:** 2026-09-19T16:10:00Z (근사)
- **Completed:** 2026-09-19T16:38:32Z
- **Tasks:** 3
- **Files modified:** 14 (13 created/이동, 1 수정)

## Accomplishments

- `ui/shell/role-menu.ts` 신설 — 역할 → (1차 메뉴 5개, 관리자 시스템 상태 진입점, 계정 그룹, 폰 하단 탭 4개) 매핑을 순수 함수 `roleMenu()` 하나로 고정(D-23). 1차 메뉴 다섯의 URL(`/projects`·`/expenses`·`/cards`·`/approvals`·`/pnl`)이 이 파일 하나에서만 나온다 — 02-05가 그대로 참조한다
- `test/unit/ui/role-menu.test.ts` 신설(17 tests) — 계정 그룹·탭 표 기대값을 SYSTEM.md 본문에서 파싱해 비교한다. 항목 이름을 테스트에 하드코딩하지 않아 02-01 체크포인트 답이 나중에 바뀌어도 이 파일을 고칠 필요가 없다
- `ui/shell/TopBar.tsx` 신설 — PC 상단 바. 딥그린 면 + 흰 반전 워드마크(`var(--bg)`로 이관, 새 토큰 없음) + 1차 메뉴 + ⌘K 표기 + 사용자 이름. 사용자 이름 클릭 시 열리는 메뉴(체크포인트 G①)로 관리자는 시스템 상태·내 정보·로그아웃에, 직원은 내 정보·로그아웃에 Tab만으로 도달하고 Esc로 닫히며 포커스가 트리거로 돌아온다
- `ui/shell/BottomTabs.tsx` + `ui/shell/MoreSheet.tsx` 신설 — 폰(<700) 전용 하단 탭 4개(미디어 쿼리로만 표시, JS 뷰포트 판독 없음)와 네이티브 `<dialog>` 기반 「더보기」 시트. 포커스 트랩·가림막(`::backdrop`)·Esc-닫힘을 브라우저가 제공해 새 런타임 의존성이 없다(`package.json` diff 없음). 검색 항목은 비활성 + 이유 문자열 병기
- `ui/shell/Shell.tsx` 신설 — §10 랜드마크 넷(헤더·주 메뉴는 TopBar가, 폰 하단 탭은 BottomTabs가 각자 그리고, Shell은 본문 `<main>`을 그린다)을 조립하고 스킵 링크를 첫 자식으로 둔다. 본문 최대 폭 1280(`--container-max`), 좌측 정렬
- `app/(app)/layout.tsx` 신설 — 세션을 읽고 `roleMenu()` 결과를 Shell에 배선. 로그인 화면(`app/(auth)/login`)은 이 그룹 밖이라 셸에 감싸이지 않는다(§6-7)
- 루트 화면(`app/page.tsx` → `app/(app)/page.tsx`)과 관리자 시스템 상태 화면(`app/admin/system-status` → `app/(app)/admin/system-status`)을 라우트 그룹 안으로 이동 — URL 불변(라우트 그룹은 URL에 영향 없음), 접근 제어 세 줄(`force-dynamic`·미인증 리다이렉트·직원 404) 문자 그대로 보존
- Shell이 유일한 `<main>` 랜드마크를 갖도록 `account/page.tsx`·이동한 `system-status/page.tsx`의 기존 `<main>` 태그를 Fragment로 교체(Rule 1 — 중첩 랜드마크는 §10 접근성 계약 위반)
- 기존 E2E 세 스펙(login-logout·change-password·system-status, 총 6 tests)이 **스펙 파일 수정 없이** 모두 통과 — 특히 직원의 관리자 화면 404가 이동 후에도 그대로 동작

## Task Commits

Each task was committed atomically:

1. **Task 1: 역할→메뉴 매핑 데이터 + PC 상단 바** - `97e4adf` (feat)
2. **Task 2: 폰 하단 탭 + 「더보기」 시트** - `10939cd` (feat)
3. **Task 3: 셸 조립과 삽입 — 인증 화면 전체가 같은 셸 안으로** - `c525b54` (feat)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified

- `ui/shell/role-menu.ts` - 역할→메뉴 매핑 순수 함수, 1차 메뉴 URL 정본(신규)
- `test/unit/ui/role-menu.test.ts` - 매핑 계약 회귀 테스트 17개(신규)
- `ui/shell/TopBar.tsx` + `TopBar.module.css` - PC 상단 바 + 열리는 사용자 메뉴(신규)
- `ui/shell/BottomTabs.tsx` + `BottomTabs.module.css` - 폰 하단 탭 4개(신규)
- `ui/shell/MoreSheet.tsx` + `MoreSheet.module.css` - 「더보기」 네이티브 `<dialog>` 시트(신규)
- `ui/shell/Shell.tsx` + `Shell.module.css` - 셸 조립 + 랜드마크 + 스킵 링크(신규)
- `app/(app)/layout.tsx` - 셸 삽입 지점(신규)
- `app/(app)/page.tsx` - `app/page.tsx`에서 이동(URL 불변)
- `app/(app)/admin/system-status/page.tsx` - `app/admin/system-status/page.tsx`에서 이동, `<main>`→Fragment
- `app/(app)/account/page.tsx` - `<main>`→Fragment(중첩 랜드마크 제거)

## Decisions Made

- TopBar.tsx 전체를 클라이언트 컴포넌트로 뒀다 — G①(열리는 메뉴)이 상태·Esc·포커스 복귀를 요구하고 파일 범위가 별도 클라이언트 파일을 두지 않았다
- MoreSheet의 포커스 트랩은 네이티브 `<dialog>.showModal()`로 구현 — 새 런타임 의존성 없음(02-RESEARCH.md 지시)
- PC 사용자 메뉴는 accountGroup에서 href로 「설정」만 걸러 렌더 — SYSTEM.md가 PC 메뉴와 폰 시트의 계정 항목 구성을 다르게 규정하기 때문
- BottomTabs가 "하단 탭에 없는 1차 메뉴"를 즉석 차집합으로 계산 — role-menu.ts에 새 필드를 추가하지 않음
- account·system-status 페이지의 중첩 `<main>`을 Fragment로 교체(Rule 1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 접근성 버그] 중첩 `<main>` 랜드마크 제거**
- **Found during:** Task 3 (셸 조립)
- **Issue:** `Shell.tsx`가 유일한 `<main>` 랜드마크를 그리도록 설계됐는데, 기존 `app/(app)/account/page.tsx`와 이동 대상인 `app/admin/system-status/page.tsx`가 각각 자체 `<main>` 태그를 갖고 있어 Shell 삽입 후 `<main>`이 중첩된다 — §10 접근성 계약(랜드마크는 화면당 하나)을 위반한다
- **Fix:** 두 파일의 `<main>`/`</main>`을 React Fragment(`<>`/`</>`)로 교체. 텍스트·구조·접근 제어 로직은 그대로 유지
- **Files modified:** `app/(app)/account/page.tsx`, `app/(app)/admin/system-status/page.tsx`
- **Verification:** `grep -rn "<main" "app/(app)/"`가 빈 결과(Shell.tsx의 `<main>` 하나만 남음), 6개 E2E 전부 통과(텍스트 셀렉터는 태그 변경에 영향받지 않음)
- **Committed in:** `c525b54` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** 접근성 정확성을 위한 필수 수정. 시각적 변화·동작 변화 없음. 범위 확장 없음(files_modified 목록의 `app/(app)/account/page.tsx`는 이미 이동 완료된 파일로 이 플랜의 검사 대상이었다).

## Issues Encountered

- `pnpm build`가 처음 `.next/dev/types/validator.ts`에서 이전 세션(02-03)이 남긴 `app/admin/system-status/page.js`·`app/page.js` 참조로 타입 오류를 냈다 — `.next` 캐시가 라우트 이동 전 상태를 들고 있던 것으로, `rm -rf .next` 후 재빌드하니 사라졌다. 코드 문제가 아니라 빌드 캐시 문제였다

## User Setup Required

None - 외부 서비스 설정 없음.

## Known Stubs

두 항목은 플랜이 명시적으로 승인한 자리표시자다(구현 누락이 아니다):

- `ui/shell/MoreSheet.tsx`의 검색 행 — 비활성 + 이유 문자열(`연결할 대상 데이터 없음 — 이 페이즈는 자리만 둔다`) 렌더. 02-CONTEXT.md가 "이 페이즈에서 자리만 두고 비활성해도 된다"고 명시한 재량 항목
- `ui/shell/BottomTabs.tsx`의 `nextTurnCount?: number` prop — 「내 차례」 건수를 라벨에 붙일 자리는 있으나 데이터 출처가 없어 이 플랜에서는 항상 `undefined`(배지 미표시). 02-05가 실제 「내 차례」 데이터를 연결할 때 이 prop에 값을 넘긴다

그 외 한 가지는 승인된 자리표시자가 아니라 **미배선 상태로 남겨진 항목**이라 `.planning/WINDOWS.md`에 별도로 등록했다:

- PC 상단 바 「현재 메뉴」 밑줄(`[aria-current="page"]`) — CSS는 준비됐지만 `app/(app)/layout.tsx`가 현재 요청의 pathname을 얻을 방법이 없어(레이아웃은 App Router에서 pathname을 직접 받지 못하고, 미들웨어로 헤더에 심는 방법은 이 플랜의 `files_modified` 밖) 실제 배선은 다음 페이즈로 미뤘다. 어떤 truths·acceptance criteria도 이 하이라이트 동작을 요구하지 않아 완료 판정에는 영향 없다

## Next Phase Readiness

- `ui/shell/role-menu.ts`가 1차 메뉴 다섯의 URL 정본을 확정했다 — 02-05는 이 URL 그대로 `/projects`·`/expenses`·`/cards`·`/approvals`·`/pnl`·`/settings` 라우트를 만들고, 그 라우트 대조 검증이 이 파일을 훑는다
- `Shell`·`TopBar`·`BottomTabs`·`MoreSheet`가 서고 `(app)` 라우트 그룹이 열렸다 — 02-05·02-06·02-07이 만들 화면은 이 셸 안에 자동으로 들어온다(레이아웃 재작업 불필요)
- `role-menu.ts`의 `accountGroup` 필드가 「설정」 URL(`/settings`)을 이미 담고 있다(02-01 체크포인트 H① 반영) — 02-05가 그 라우트를 만들면 메뉴↔라우트 대조가 바로 통과한다
- PC 상단 바 사용자 메뉴·「더보기」 시트의 실제 브라우저 키보드 상호작용(Tab 도달·포커스 트랩·포커스 복귀)은 코드 경로는 있으나 이 실행 환경에 브라우저 렌더 도구가 없어 사람 확인 대기 항목이다(coverage D2·D3)
- 375px 가로 스크롤 없음·태블릿 700–1023 레이아웃 유지는 CSS로 작성됐으나 시각 확인 대기 항목이다(coverage D5)
- PC 상단 바 「현재 메뉴」 하이라이트 배선은 `.planning/WINDOWS.md`에 열린 항목으로 등록됨 — 다음 페이즈가 pathname 소스(예: 페이지별 prop 또는 얇은 미들웨어)를 정할 때 함께 해결

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: all 15 key files/paths (ui/shell/role-menu.ts, TopBar.tsx/.module.css, BottomTabs.tsx/.module.css, MoreSheet.tsx/.module.css, Shell.tsx/.module.css, app/(app)/layout.tsx, app/(app)/page.tsx, app/(app)/admin/system-status/page.tsx, app/(app)/account/page.tsx, this SUMMARY.md)
- FOUND: commits 97e4adf (Task 1), 10939cd (Task 2), c525b54 (Task 3)
- Re-ran all task-level acceptance criteria: all PASS (isAdmin/소속 grep counts 0, color-literal counts 0, no new package.json deps, gate-line regex intact, ui/** has zero domain/repositories/db imports)
- Re-ran plan-level `<verification>`: `pnpm build`(success, no route conflict) · `pnpm lint`(0 errors) · `pnpm typecheck`(0 errors) · `pnpm test:unit`(262 passed) · `pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts test/e2e/system-status.spec.ts`(6 passed, spec files unmodified)
