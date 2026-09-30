---
phase: quick-260929-npq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - test/e2e/mobile-touch-targets.spec.ts
  - app/(app)/projects/[id]/project-detail.module.css
  - app/(app)/projects/[id]/quote-table.tsx
  - app/(app)/projects/[id]/status-change.tsx
  - ui/table/Table.module.css
  - docs/design/checks/2026-09-29-04-폰-터치-44.md
autonomous: true
requirements: [QUICK-260929-npq]
# risk 태그 없음 — 돈·권한·DB 잠금·마이그레이션을 건드리지 않는다(폰 CSS 치수 + className 두 줄 + E2E). 실행자 = Sonnet 기본.
# 위험 경로 없음(db/·domain/auth·domain/permissions·lib/crypto·배포·.claude/ 변경 0).

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "폰 375·320 프로젝트 상세 머리 줄의 「상태 바꾸기」와 「더보기」 버튼 bounding box가 둘 다 높이 ≥ 44 · 폭 ≥ 44다(SYSTEM §3 터치 목표 · 04-UI-SPEC Spacing `--touch-min` 「폰 「필터」·「더보기」」 · 04-UI-REVIEW 지적 1). 미수주에서 같은 자리에 뜨는 「진행으로 되돌리기」는 같은 <button>이라 같은 치수를 받는다"
    - "폰 375·320 프로젝트 목록 정렬 머리글 「프로젝트명」·「견적」 링크 bounding box가 높이 ≥ 44 · 폭 ≥ 44이고 머리글 셀 높이를 채운다(셀 높이 − 링크 높이 ≤ 2.5, 아래 선 두께만 남음 — 04-UI-REVIEW 지적 3). 정렬을 필터 시트로 옮기지 않는다"
    - "PC 1280과 경계 700에서 「상태 바꾸기」 높이는 32(`--control-h` PC) 그대로, 「더보기」는 보이지 않음 그대로, 정렬 머리글 링크 높이는 수정 전 실측값 그대로다 — 바뀐 규칙은 전부 `@media (max-width: 699.98px)` 안에 있다"
    - "폰 320·375에서 상세·목록 두 화면 모두 문서 가로 넘침이 없다(scrollWidth ≤ clientWidth)"
    - "새 색·서체·radius·토큰·문구 0 — 추가된 CSS 값은 `var(--touch-min)` · `var(--cell-pad-y)` 참조뿐이고 TSX 변경은 className 두 줄 + CSS 모듈 import 한 줄뿐이다"
    - "새 E2E 스펙이 수정 전 실패(RED, 폰 두 테스트만 실패 · PC 테스트 통과)를 커밋으로 남긴 뒤 수정 후 전부 통과(GREEN)한다 — `CI=true` 프로덕션 빌드로 확인"
  artifacts:
    - path: "test/e2e/mobile-touch-targets.spec.ts"
      provides: "mobile-375 프로젝트에서 도는 폰 터치 목표 E2E 3개(폰 상세 · 폰 목록 · PC 1280/700 불변)"
      contains: "toBeGreaterThanOrEqual"
    - path: "app/(app)/projects/[id]/project-detail.module.css"
      provides: "폰 미디어 쿼리 안 `.headerActions .headerTouchButton` — min-width·min-height `--touch-min`(목록 「필터」와 같은 규칙)"
      contains: ".headerActions .headerTouchButton"
    - path: "ui/table/Table.module.css"
      provides: "폰 미디어 쿼리 안 `.sortLink` 확장(flex · min-width·min-height `--touch-min` · 위아래 음수 margin `--cell-pad-y`) + `.alignRight > .sortLink` 오른쪽 정렬 유지"
      contains: ".alignRight > .sortLink"
    - path: "docs/design/checks/2026-09-29-04-폰-터치-44.md"
      provides: "빈칸 없는 design-gate 점검표 — 「화면:」 줄에 ui/table/Table.module.css 추가"
      contains: "ui/table/Table.module.css"
  key_links:
    - from: "app/(app)/projects/[id]/quote-table.tsx HeaderCopyActions의 「더보기」 <Button>"
      to: "project-detail.module.css `.headerTouchButton`"
      via: "className={styles.headerTouchButton} (Button이 className을 <button>에 넘긴다 — ui/button/Button.tsx 82행)"
      pattern: "className=\\{styles\\.headerTouchButton\\}"
    - from: "app/(app)/projects/[id]/status-change.tsx 트리거 <Button>(「상태 바꾸기」/「진행으로 되돌리기」)"
      to: "project-detail.module.css `.headerTouchButton`"
      via: "import styles from \"./project-detail.module.css\" + className={styles.headerTouchButton}"
      pattern: "import styles from \"\\./project-detail\\.module\\.css\""
    - from: "ui/table/Table.tsx 머리글 <Link className={styles.sortLink}> (Table.tsx는 바꾸지 않는다)"
      to: "Table.module.css 폰 미디어 쿼리 `.sortLink` 규칙"
      via: "같은 CSS 모듈 클래스 — 정렬 머리글을 쓰는 표는 현재 /projects 목록 하나뿐(grep `sort:` → projects-table.tsx)"
      pattern: "\\.alignRight > \\.sortLink"
---

<objective>
PR #104 사용자 [지시] 「위반 2건 고쳐」 — 04-UI-REVIEW.md 지적 1·3의 폰(<700) 터치 목표 위반 두 건을 폰 미디어 쿼리 안에서만 고친다.

**고칠 자리(실측 코드 기준 — 오케스트레이터 메모의 후보와 다르다):**
- 「더보기」 = `app/(app)/projects/[id]/quote-table.tsx`의 `HeaderCopyActions` 안 `<Button variant="secondary">`(약 849~858행). 「상태 바꾸기」 = `app/(app)/projects/[id]/status-change.tsx`의 트리거 `<Button variant="secondary">`(약 191~200행). 둘 다 공유 `ui/button/Button.module.css`의 `.btn { height: var(--control-h) }`(폰 40)로 40이 된다. `project-detail.module.css` 101행(`.cellSelect/.cellInput` 견적 셀 입력)과 331행(`.periodInput` 기간 칸)은 이 두 버튼과 무관하다 — 건드리지 않는다. `page.tsx`도 바꿀 것이 없다.
- 정렬 머리글 = 공유 `ui/table/Table.tsx` 816~821행의 `<Link className={styles.sortLink}>`(버튼이 아니라 링크). 모양은 `ui/table/Table.module.css`의 `.sortLink`(inline-flex, 글자 줄 높이 19). `projects-table.tsx`·`projects.module.css`는 sortLink에 클래스를 넘길 길이 없다(CSS 모듈 범위) — 공유 Table의 폰 미디어 쿼리가 유일한 자리이고, 「화면 하나만 예외 금지」(frontend.md)와도 맞는다. 정렬 머리글을 쓰는 표는 현재 프로젝트 목록 하나라 영향 범위 = /projects 폰.

**택한 방법(명시):**
- 위반 1(상세 머리 줄): 목록 「필터」 규칙(`projects.module.css` 66~69행 `.filterFields .filterToggleButton { min-width/min-height: var(--touch-min) }`)을 그대로 옮긴다 — `project-detail.module.css`의 기존 DR-26 폰 블록(`@media (max-width: 699.98px)`, 53~94행) 안에 `.headerActions .headerTouchButton { min-width: var(--touch-min); min-height: var(--touch-min); }`를 두고 두 Button에 `className={styles.headerTouchButton}`. 결과: 두 버튼이 폰에서 **보이는 높이도 44**(04-UI-REVIEW 권고 · 목록 「필터」 선례와 같음). 가상 요소로 누름 영역만 넓히는 방식(holidays 225~233행 `::before`)은 쓰지 않는다 — bounding box가 40으로 남아 UI-REVIEW 실측 기준을 못 넘고, 같은 줄의 「더보기」(UI-SPEC이 `--touch-min`을 명시)와 높이가 갈라진다.
- 위반 3(목록 정렬 머리글): `ui/table/Table.module.css`의 기존 폰 블록(`@media (max-width: 699.98px)`, 270행~) 안에서 `.sortLink`를 머리글 셀 높이만큼 늘린다 — `display: flex; min-width: var(--touch-min); min-height: var(--touch-min); margin-block: calc(-1 * var(--cell-pad-y));` + `.alignRight > .sortLink { justify-content: flex-end; }`. 음수 margin이 셀 위아래 패딩(폰 `--cell-pad-y` 10)을 상쇄해 링크가 셀 위 끝부터 아래 선까지를 채우고, 머리글 행은 약 41 → 46으로만 커진다. flex(블록 수준)라 링크가 셀 폭을 채우고, min-width가 금액 칸이 `0`뿐일 때도 폭 44를 보장한다. 정렬을 필터 시트로 옮기는 안은 택하지 않는다(사용자가 정하지 않은 더 큰 UX 변경).

Purpose: 폰 터치 목표 계약(SYSTEM §3 · UI-SPEC `--touch-min`)을 두 화면에서 지키고, frontend.md 「반복되는 지적(폰 44px)은 E2E로 만든다」에 따라 E2E로 고정한다.
Output: RED 커밋(새 E2E 스펙 하나) → GREEN 커밋(CSS 두 파일 + className 두 줄 + import 한 줄 + 채운 점검표).
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/frontend.md
@docs/design/checks/2026-09-29-04-폰-터치-44.md

범위 Read만(통째로 읽지 않는다):
- `.planning/phases/04-project-quote-ledger/04-UI-REVIEW.md` 30~80행(지적 1·3 근거)
- `docs/design/SYSTEM.md` 180~200행(§3 터치 목표) · 678~697행(§7-1 버튼 높이 PC 32 · 폰 40 — 시각 높이 규칙)
- `.planning/phases/04-project-quote-ledger/04-UI-SPEC.md` 180~200행(Spacing 표 `--touch-min` 행)
- `app/(app)/projects/projects.module.css` 60~70행(목록 「필터」 규칙 — 복제 대상)
- `app/(app)/projects/[id]/project-detail.module.css` 34~94행(`.headerActions` · DR-26 폰 블록)
- `app/(app)/projects/[id]/quote-table.tsx` — `HeaderCopyActions`를 Grep으로 찾아 그 함수(약 840~865행)만
- `app/(app)/projects/[id]/status-change.tsx` 1~12행(import) · 189~201행(트리거 Button)
- `ui/table/Table.module.css` 1~45행(`.headerCell` · `.sortLink`) · 67~71행(`.alignRight`) · 270~313행(폰 블록)
- `ui/button/Button.module.css` 1~24행 · 67~83행(`.btn` 높이 · 폰 `.tertiary` 선례)
- `test/e2e/project-lifecycle.spec.ts` 1~50행(makeTeam · makeAccount · login 도우미 패턴) · 52~82행(createProject 시드 패턴)
- `test/e2e/mobile-projects-error.spec.ts` 1~20행(mobile-375 프로젝트 파일 관례)
- `playwright.config.ts`(`mobile-*.spec.ts` → mobile-375 프로젝트 · `dependencies: ["desktop"]` → 단독 실행은 `--no-deps`)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — 폰 터치 목표 E2E(상세 두 버튼 · 목록 정렬 머리글 · PC 불변) 작성, 수정 전 실패 확인 후 커밋</name>
  <files>test/e2e/mobile-touch-targets.spec.ts</files>
  <precondition>로컬 Postgres가 떠 있다(`pnpm db:dev`, playwright.config.ts 기본 `DATABASE_URL` erp_test) · 포트 3100이 비어 있다</precondition>
  <behavior>
    - 폰 상세(375·320): 팀장(TEAM_LEAD_ROLE_ID)으로 자기 팀 수주중 프로젝트 상세를 열면 「상태 바꾸기」 · 「더보기」 버튼 bounding box 높이 ≥ 44 · 폭 ≥ 44, 문서 가로 넘침 없음 — 수정 전에는 높이 40이라 실패
    - 폰 목록(375·320): `/projects?q=<시드 이름>`의 thead 「프로젝트명」·「견적」 정렬 링크 높이 ≥ 44 · 폭 ≥ 44 · (머리글 셀 높이 − 링크 높이) ≤ 2.5, 문서 가로 넘침 없음 — 수정 전에는 높이 19라 실패
    - PC(1280 · 경계 700): 「상태 바꾸기」 높이 32(±0.5), 「더보기」 보이지 않음, 두 정렬 링크 높이 = 수정 전 실측값(±0.5) — 수정 전후 모두 통과(가드)
  </behavior>
  <action>
    시작 전에 Skill `test-driven-development`를 호출한다(CLAUDE.md §4 Build · §5). 예상 밖 실패(빌드·로그인·시드·로케이터)가 나오면 고치기 전에 Skill `systematic-debugging`을 호출한다. 이 태스크에서 app/·ui/·docs/design/ 파일은 건드리지 않는다.

    ① 새 파일 `test/e2e/mobile-touch-targets.spec.ts`를 만든다. 파일 이름을 `mobile-` 접두로 두는 이유: playwright.config.ts의 `MOBILE_SPEC_PATTERN`이 mobile-375 프로젝트(폰 폭 기본)로 보낸다 — `phone-…` 이름이면 desktop 프로젝트에서 돈다. 기존 폰 스펙(mobile-320-no-overflow)은 PM 흐름·넘침 측정 전용이라 「상태 바꾸기」(팀장 이상)를 볼 수 없어 확장하지 않고 새 파일로 한다.
    - 맨 위 한국어 주석 2~3줄: quick 260929-npq · 04-UI-REVIEW 지적 1·3 · SYSTEM §3 터치 목표 44×44 · UI-SPEC `--touch-min`.
    - 시드는 `project-lifecycle.spec.ts`의 도우미 패턴을 이 파일 안에 최소로 옮긴다(다른 스펙에서 import하지 않는다): `createOrgUnit`/`createTeam`(팀 이름 `E2E팀-` + uuid 앞 8자 — 375 넘침 방지, fixtures.ts 주석) → `createAccount`로 팀장(`TEAM_LEAD_ROLE_ID`, `@/domain/permissions/roles`)과 PM(`DEFAULT_ROLE_ID`) → `assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: kstToday(new Date()) })` → `insertVendor` → `createProject(SYSTEM_VIEWER, { clientId, teamId, pmUserId: PM, name: "E2E터치-" + uuid 앞 8자, startDate: null, endDate: null })`(기본 상태 = 수주중). `test.beforeAll`에서 한 번 만들고 세 테스트가 공유한다. 로그인은 lifecycle의 `login`과 같은 폼 입력(이메일 · 비밀번호 · 「로그인」 → `/account`).
    - 측정 도우미: 로케이터의 `boundingBox()`(null이면 실패)와 `page.evaluate`로 `document.documentElement`의 scrollWidth·clientWidth. 단언은 전부 `expect.soft`이고 메시지에 라벨과 폭을 넣는다(예: 「더보기 @320 높이」) — RED 출력 한 번에 실패 값이 전부 보이게.
    - 로케이터: 「상태 바꾸기」 = `page.getByRole("button", { name: "상태 바꾸기", exact: true })`(닫힌 dialog 안 제목과 겹치지 않는다), 「더보기」 = `page.getByRole("button", { name: "더보기", exact: true })`. 정렬 링크 = `page.locator("thead").getByRole("columnheader", { name: "프로젝트명", exact: true })` 안의 `getByRole("link")`(「견적」도 같은 방식) — 행 안의 프로젝트명 링크와 섞이지 않게 thead로 좁힌다.
    - 테스트 셋(제목 접두 「폰」/「PC」를 지킨다 — verify가 제목으로 판정한다):
      (A) 「폰 상세 머리 줄 「상태 바꾸기」·「더보기」 — 375·320에서 44×44 이상, 가로 넘침 없음」: 폭 375와 320 각각 `setViewportSize` → 상세 goto → 두 버튼 visible 확인 → 높이·폭 ≥ 44 soft 단언 → 넘침 soft 단언.
      (B) 「폰 목록 정렬 머리글 「프로젝트명」·「견적」 — 375·320에서 44×44 이상 · 머리글 셀 높이를 채움, 가로 넘침 없음」: 폭 375·320 각각 `/projects?q=<시드 이름 URL 인코딩>` → 두 링크 높이·폭 ≥ 44, (columnheader 높이 − 링크 높이) ≤ 2.5 → 넘침 soft 단언.
      (C) 「PC 1280·경계 700 — 「상태 바꾸기」 높이 32 · 「더보기」 없음 · 정렬 머리글 높이 그대로」: 폭 1280·700 각각 상세에서 「상태 바꾸기」 높이 `toBeCloseTo(32, 0)` · 「더보기」 `toBeHidden()`, 목록에서 두 정렬 링크 높이 `toBeCloseTo(상수, 0)`.
    - `any` 타입 쓰지 않는다. 시드 정리(보관)는 하지 않아도 된다 — global-setup이 매 실행 테스트 스키마를 리셋한다.

    ② PC 상수 잡기 — (C)의 정렬 링크 상수(1280용 · 700용, 파일 상단 const)를 처음엔 0으로 두고 스펙을 한 번 돌린다: `CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps --reporter=list`. soft 단언 실패 메시지의 Received 값이 현재 PC 실측값이다 — 소수 둘째 자리까지 상수에 옮긴다. 같은 실행에서 「상태 바꾸기」 PC 높이가 32로 통과하는지, 팀장에게 「더보기」가 폰에서 보이는지 확인한다. 팀장에게 「더보기」가 없으면(HeaderCopyActions 자식 0 — canWrite 없음) 그 버튼만 담당 PM으로 로그인해 재도록 (A)를 나누고 SUMMARY에 적는다(추측으로 역할을 바꾸지 말고 실행 출력으로 확인).
    ③ RED 확인 — 같은 명령을 다시 돌린다. 기대: (A)·(B) 실패, (C) 통과. 실패 원인이 높이 40(버튼) · 19(링크)의 `toBeGreaterThanOrEqual` 미달인지 출력으로 확인한다(빌드·로그인·로케이터 오류면 RED가 아니다 → systematic-debugging). 폭 단언이나 채움 단언이 추가로 실패하는 것은 정상. 넘침 단언은 수정 전에도 통과해야 한다. 포트 3100이 남아 있으면 PID를 찾아 `kill <PID>`로만 끈다(`pkill -f` 금지). 출력은 요약만, 실패는 실패 줄만 인용.
    ④ `pnpm lint`와 `pnpm typecheck` 통과.
    ⑤ 커밋 직전 Skill `verification-before-completion`을 호출하고(훅이 강제) 스펙 파일 하나만 커밋한다. 제목 `test: pin phone 44px touch targets for project detail and list sort headers`, 본문 한국어 한두 줄(RED — 04-UI-REVIEW 지적 1·3 · 수정 전 실측: 버튼 40 · 정렬 링크 19, PC 1280·700 불변 가드). 커밋 끝에 system-reminder의 attribution 줄.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && S="$(mktemp -d)" && { PLAYWRIGHT_JSON_OUTPUT_NAME="$S/r.json" CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps --reporter=json >/dev/null 2>&1; true; } && node -e 'const r=require(process.argv[1]);const out=[];const walk=s=>{for(const sp of s.specs||[])out.push(sp);for(const c of s.suites||[])walk(c)};for(const s of r.suites||[])walk(s);const msg=sp=>sp.tests.flatMap(t=>t.results).flatMap(x=>x.errors||[]).map(e=>e.message||"").join("\n");for(const sp of out)console.log(sp.ok?"PASS":"FAIL",sp.title);const phone=out.filter(sp=>sp.title.startsWith("폰"));const pc=out.filter(sp=>sp.title.startsWith("PC"));const ok=out.length===3&&phone.length===2&&phone.every(sp=>!sp.ok&&msg(sp).includes("toBeGreaterThanOrEqual"))&&pc.length===1&&pc[0].ok;process.exit(ok?0:1)' "$S/r.json" && pnpm lint && pnpm typecheck && git diff --quiet -- app ui && L="$(git log --format='%H %s' -10)" && C="$(printf '%s\n' "$L" | grep ' test: pin phone 44px touch targets for project detail and list sort headers$' | head -1 | cut -d' ' -f1)" && test -n "$C" && test "$(git show --name-only --format= "$C")" = "test/e2e/mobile-touch-targets.spec.ts"</automated>
  </verify>
  <done>새 스펙이 CI=true 프로덕션 빌드에서 폰 두 테스트는 `toBeGreaterThanOrEqual` 미달(버튼 40 · 링크 19)로 실패하고 PC 테스트는 통과한다 · lint·typecheck 통과 · RED 커밋은 스펙 파일 하나만 담는다 · app/·ui/ 변경 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — 폰 미디어 쿼리에서 상세 두 버튼 · 정렬 머리글을 --touch-min으로, 점검표 채워 커밋</name>
  <files>app/(app)/projects/[id]/project-detail.module.css, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/status-change.tsx, ui/table/Table.module.css, docs/design/checks/2026-09-29-04-폰-터치-44.md</files>
  <behavior>
    - Task 1 스펙 세 개가 전부 통과한다(폰 44×44 · 셀 채움 · 넘침 0 · PC 1280/700 불변)
    - 추가 CSS 값은 `var(--touch-min)` · `var(--cell-pad-y)` 참조뿐 — 새 토큰·색·서체·radius·문구 0
  </behavior>
  <action>
    화면 파일을 고치기 전에 Skill `design-gate`를 호출한다(훅이 강제 — 브리프 · 사용성 원칙 · CHECKLIST.md §1을 읽힌다). 점검표는 오케스트레이터가 이미 만들었으니 새로 만들지 않고 그 파일을 채운다. 구현 전 Task 1 스펙이 RED인 상태에서 시작한다(test-driven-development 규율). 게이트가 실패하면 고치기 전에 Skill `systematic-debugging`.

    ① 상세 머리 줄(위반 1 — UI-REVIEW 권고 · 목록 「필터」와 같은 규칙):
    - `app/(app)/projects/[id]/project-detail.module.css`의 DR-26 폰 블록(53행 `@media (max-width: 699.98px) {` ~ 94행 닫는 괄호) 안, `.copyActionsOpen` 규칙 뒤에 `.headerActions .headerTouchButton` 규칙 하나를 더한다: `min-width: var(--touch-min);` · `min-height: var(--touch-min);`. 그 위에 한국어 주석 한 줄(§3 폰 터치 목표 44×44 — 머리 줄 2차 「상태 바꾸기」·「더보기」, 목록 「필터」와 같은 규칙 · 공유 Button보다 한 단계 높은 선택자). 블록 밖(PC)에는 아무 규칙도 더하지 않는다. 101행 `.cellSelect…`·331행 `.periodInput`의 `height: var(--control-h)`는 이 두 버튼과 무관하니 건드리지 않는다.
    - `app/(app)/projects/[id]/quote-table.tsx`: `HeaderCopyActions` 안 「더보기」 `<Button>`에 `className={styles.headerTouchButton}` 한 줄만 더한다(이 파일은 이미 `styles`로 project-detail.module.css를 import한다). 다른 줄·주석은 바꾸지 않는다.
    - `app/(app)/projects/[id]/status-change.tsx`: import 묶음에 `import styles from "./project-detail.module.css";` 한 줄(같은 폴더 7개 파일이 쓰는 것과 같은 형태), 트리거 `<Button type="button" variant="secondary" onClick={handleTrigger} …>`에 `className={styles.headerTouchButton}` 한 줄. ConfirmDialog·3차 「기간 바꾸기」·「기간 적기」 Button에는 붙이지 않는다. 라벨·variant·동작은 그대로(「진행으로 되돌리기」 라벨도 같은 버튼이라 자동으로 같은 치수).
    ② 목록 정렬 머리글(위반 3 — 셀 높이만큼 늘림):
    - `ui/table/Table.module.css`의 폰 블록(270행 `@media (max-width: 699.98px) {`) 안, 마지막 `.cell, .headerCell` 규칙 뒤에 두 규칙을 더한다: `.sortLink { display: flex; min-width: var(--touch-min); min-height: var(--touch-min); margin-block: calc(-1 * var(--cell-pad-y)); }`(기존 `align-items: center`·`gap`은 기본 규칙에서 상속) · `.alignRight > .sortLink { justify-content: flex-end; }`(금액 열 「견적」 글자가 숫자와 같은 오른쪽 끝에 남게). 그 위에 한국어 주석 1~2줄(§3 폰 터치 목표 44×44 — 정렬 머리글 링크가 머리글 셀 높이를 채운다 · 음수 margin이 셀 위아래 패딩을 상쇄). `ui/table/Table.tsx` · 기본(PC) `.sortLink`·`.headerCell` 규칙 · `projects-table.tsx` · `projects.module.css`는 바꾸지 않는다. 주석에 치수를 쓸 때는 `44×44` 표기만 쓴다.
    ③ 게이트를 순서대로(CLAUDE.md §6 싼 게이트 → 건드린 스펙): `pnpm lint`(stylelint가 토큰 밖 리터럴을 막는다) → `pnpm typecheck` → `pnpm build` → `CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps --reporter=list`. 세 테스트 전부 통과해야 한다. (C) PC 가드가 실패하면 규칙이 폰 블록 밖으로 샌 것이다 — 위치부터 확인. 전체 E2E는 CI가 돈다. 포트 3100 잔존 프로세스는 PID로만 끈다.
    ④ 점검표 `docs/design/checks/2026-09-29-04-폰-터치-44.md`를 채운다(design-gate §4 · 훅이 빈칸 `- [ ]`과 빈 「근거:」를 막는다):
    - 「화면:」 줄 끝에 ` · ui/table/Table.module.css`를 더한다(엄격 모드 — 커밋하는 화면 파일마다 「화면:」 줄에 있어야 한다. `app/(app)/projects/`는 [id] 폴더까지 덮는다).
    - 모든 항목을 `- [x]`로 바꾸고 근거 한 줄씩. 근거 방향: 안내 문구·같은 말 두 번 = 문구 변경 0(diff는 CSS 규칙 + className 두 줄 + import 한 줄) · 결정 최소·할 수 없는 선택지 = 렌더 조건(StatusChange 권한 · HeaderCopyActions 자식 없으면 null) 그대로 · 주 버튼 하나 = 1차 「일괄 저장」 그대로, 두 버튼은 2차 variant 그대로 · 위험한 동작 = 상태 전환 확인 모달 그대로 · 빈 화면 = ListEmpty 그대로(머리글만 바뀜) · 키보드 = 요소·DOM 순서·포커스 외곽선 변경 없음 · 같은 종류 같은 모양 = 폰 머리 줄 2차가 목록 「필터」와 같은 44(SYSTEM §7-1 「폰 40」은 시각 기본값, §3·UI-SPEC `--touch-min` 「필터」·「더보기」가 이 자리를 44로 정함) · §1 결정 = 색·모양·배치 변경 없음 · 새 색 = 추가 값은 `var(--touch-min)`·`var(--cell-pad-y)`뿐, stylelint 통과 · 폰 320 넘침·터치 44 = 새 스펙 GREEN(값 인용) · 실제 앱 화면 = 스크린샷 육안 판정 금지(CLAUDE.md §6) — DOM 실측 E2E(`CI=true`, 1280·700·375·320)로 대신(04.4-merge-main-85 점검표 선례).
    ⑤ 커밋 직전 Skill `verification-before-completion` 호출 후 다섯 파일(CSS 둘 · TSX 둘 · 점검표)만 한 커밋으로 커밋한다. 제목 `fix: phone 44px touch targets for detail header buttons and list sort headers`, 본문 한국어 2~3줄(폰<700만: 상세 「상태 바꾸기」·「더보기」 min 44 — 목록 「필터」 규칙, 목록 정렬 머리글 링크가 셀 높이를 채움 44 · PC 1280·700 치수 불변 · 04-UI-REVIEW 지적 1·3, PR #104 [지시]). 커밋 끝에 attribution 줄. PLAN·SUMMARY·STATE는 커밋하지 않는다(오케스트레이터 몫). SUMMARY는 `.planning/quick/260929-npq-phone-44px-touch-targets-detail-more-sta/260929-npq-SUMMARY.md`에 쓰되 커밋하지 않는다 — RED 실측값(버튼 40 · 링크 19 · PC 상수)과 GREEN 실측값, 그리고 아래 「범위 밖 관찰」을 적는다.
    범위 밖 관찰(고치지 말고 SUMMARY에만): 폰 상세에서 편집 뒤 뜨는 1차 「일괄 저장」과 「더보기」로 펼친 「복사해 새 차수」·「프로젝트 복사」는 여전히 `--control-h` 40이다(UI-REVIEW가 재지 않은 같은 부류 — 사용자 판단 필요).
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && pnpm lint && pnpm typecheck && pnpm build && S="$(mktemp -d)" && { PLAYWRIGHT_JSON_OUTPUT_NAME="$S/g.json" CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps --reporter=json >/dev/null 2>&1; true; } && node -e 'const r=require(process.argv[1]);const out=[];const walk=s=>{for(const sp of s.specs||[])out.push(sp);for(const c of s.suites||[])walk(c)};for(const s of r.suites||[])walk(s);for(const sp of out)console.log(sp.ok?"PASS":"FAIL",sp.title);process.exit(out.length===3&&out.every(sp=>sp.ok)?0:1)' "$S/g.json" && D="app/(app)/projects/[id]/project-detail.module.css" && T="ui/table/Table.module.css" && test "$(awk '/^@media/{m=$0} /headerTouchButton/{print d"|"m} {o=gsub(/\{/,"{");c=gsub(/\}/,"}");d+=o-c}' "$D" | sort -u)" = "1|@media (max-width: 699.98px) {" && test "$(awk '/^@media/{m=$0} /^  \.sortLink \{|\.alignRight > \.sortLink/{print d"|"m} {o=gsub(/\{/,"{");c=gsub(/\}/,"}");d+=o-c}' "$T" | sort -u)" = "1|@media (max-width: 699.98px) {" && test "$(grep -cE '^  \.sortLink \{' "$T")" = "1" && test "$(grep -c '\.alignRight > \.sortLink' "$T")" = "1" && F="docs/design/checks/2026-09-29-04-폰-터치-44.md" && ! grep -Eq '^[[:space:]]*([-*+]|[0-9]+\.) \[ \]' "$F" && ! grep -Eq '근거:[[:space:]]*$' "$F" && grep -Eq '^화면:.*ui/table/Table\.module\.css' "$F" && L="$(git log --format='%H %s' -20)" && R="$(printf '%s\n' "$L" | grep ' test: pin phone 44px touch targets for project detail and list sort headers$' | head -1 | cut -d' ' -f1)" && test -n "$R" && M="$(git log --format='%s' "$R"..HEAD)" && printf '%s\n' "$M" | grep -qx 'fix: phone 44px touch targets for detail header buttons and list sort headers' && N="$(git -c core.quotePath=false diff --name-only "$R" HEAD -- app ui docs/design test)" && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\n' ' ')" = "app/(app)/projects/[id]/project-detail.module.css app/(app)/projects/[id]/quote-table.tsx app/(app)/projects/[id]/status-change.tsx docs/design/checks/2026-09-29-04-폰-터치-44.md ui/table/Table.module.css " && X="app/(app)/projects/[id]/quote-table.tsx" && Y="app/(app)/projects/[id]/status-change.tsx" && G="$(git diff "$R" HEAD -- "$X" "$Y")" && test -n "$G" && test "$(printf '%s\n' "$G" | grep -cE '^-[^-]')" = "0" && test "$(printf '%s\n' "$G" | grep -E '^\+[^+]' | sed -E 's/^\+[[:space:]]*//' | LC_ALL=C sort | tr '\n' '|')" = 'className={styles.headerTouchButton}|className={styles.headerTouchButton}|import styles from "./project-detail.module.css";|' && W="$(git status --porcelain -- app ui docs/design test)" && test -z "$W"</automated>
  </verify>
  <done>lint·typecheck·build 통과 · 새 스펙 세 테스트 전부 통과(CI=true) · 새 규칙 셋은 전부 폰 미디어 쿼리(깊이 1) 안 · TSX 변경은 className 두 줄 + import 한 줄뿐(지운 줄 0) · RED 이후 바뀐 파일은 정확히 다섯 · 점검표 빈칸·빈 근거 0이고 「화면:」에 ui/table/Table.module.css 포함 · 작업 트리 깨끗 · SUMMARY 작성(미커밋).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 없음(새 경계 0) | 폰 미디어 쿼리 CSS 치수 + 기존 버튼에 className 추가 + 테스트 전용 시드. 서버 액션·권한 판정·입력 처리·데이터 경로 변경 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q-npq-01 | Elevation of Privilege | status-change.tsx 트리거 Button | low | accept | className만 더한다 — 렌더 조건(서버가 보낸 destinations · 미저장 편집 막힘 DR-6)은 그대로. Task 2 verify가 TSX 추가 줄을 className·import로만 제한하고 지운 줄 0을 판정 |
| T-q-npq-02 | Tampering | test/e2e/mobile-touch-targets.spec.ts 시드 | low | accept | 테스트 스키마(erp_test)만 쓴다 — global-setup이 매 실행 리셋. 프로덕션 DB 명령 없음 |
</threat_model>

<verification>
- RED: Task 1 verify — CI=true에서 폰 두 테스트가 `toBeGreaterThanOrEqual` 미달로 실패, PC 가드 통과, RED 커밋 = 스펙 하나.
- GREEN: Task 2 verify — lint · typecheck · build · 새 스펙 CI=true 통과 · 규칙 위치(폰 블록) · TSX 추가 줄 제한 · 바뀐 파일 다섯 · 점검표 빈칸 0.
- 이 플랜 밖(오케스트레이터 몫, 실행자가 하지 않는다): 독립 DOM 감사(별도 에이전트, `CI=true`, 375·320 상세·목록 + 1280·700) → PR 묶음의 `/review` → `/design-review` → `/qa`. 전체 E2E는 CI.
</verification>

<success_criteria>
- 폰 375·320: 상세 「상태 바꾸기」·「더보기」 ≥ 44×44, 목록 「프로젝트명」·「견적」 정렬 링크 ≥ 44×44이고 머리글 셀 높이를 채운다.
- PC 1280·700: 「상태 바꾸기」 32 · 「더보기」 없음 · 정렬 링크 높이 수정 전과 같다.
- 두 화면 320·375 가로 넘침 0.
- 새 토큰·색·서체·radius·문구 0, 정렬을 필터 시트로 옮기지 않았다, 요청 밖 리팩터·주석 변경 0.
- RED 커밋(test:) → GREEN 커밋(fix:) 두 개, 점검표 채워 GREEN 커밋에 포함.
</success_criteria>

<output>
Create `.planning/quick/260929-npq-phone-44px-touch-targets-detail-more-sta/260929-npq-SUMMARY.md` when done (커밋하지 않는다 — 오케스트레이터가 문서 커밋을 맡는다)
</output>
