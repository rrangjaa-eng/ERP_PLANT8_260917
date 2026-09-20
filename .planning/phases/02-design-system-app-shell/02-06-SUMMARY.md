---
phase: 02-design-system-app-shell
plan: 06
subsystem: ui
tags: [banner, toast, error-pages, not-found, system-status, react, css-modules]

requires:
  - phase: 02-design-system-app-shell
    provides: "02-05(ui/status-tag/StatusTag.tsx §7-5 계약, ui/list-empty/ListEmpty.tsx §7-7 EMPTY/ERROR 겸용 tone prop) · 02-04(app/(app)/layout.tsx의 유일한 <main> 랜드마크, Shell 삽입) · 02-03(ui/<component>/<Name>.tsx + .module.css 패턴, ui/input/TextField.tsx, ui/button/Button.tsx) · 02-01(SYSTEM.md §6-7/§6-8/§6-9/§7-6/§7-11 계약, 02-01 체크포인트 A④·B①②③·C①②③·D①②③④⑤·F-1① 확정 답)"
provides:
  - "ui/banner/Banner.tsx — §7-11 배너. kind prop(info/warning) → role(status/alert) 매핑, 화면 제목 위 배치·개수 상한은 호출부 책임"
  - "ui/toast/Toast.tsx — §7-6 토스트. 4초 자동 소멸(오류는 닫을 때까지), aria-live=\"polite\", §5 모션 허용 목록(opacity+translateY 160ms)만 사용. 이 플랜에서는 계약만 세우고 실제 화면에 배선하지 않는다(F-1①이 토스트 갈래를 쓰지 않았다)"
  - "app/(app)/account/page.tsx·change-password-form.tsx·logout-button.tsx — §6-3 폼 템플릿 재사용, ui/ 컴포넌트로 재구성. Phase 1의 모든 동작·검증 메시지 문자열 보존"
  - "app/(app)/admin/system-status/page.tsx — §6-8 dl 라벨·값 목록 + StatusTag(확인 불가) + Banner(한도 경고, 제목 위)로 재구성. D-17 접근 제어 세 줄 불변"
  - "app/not-found.tsx · app/(app)/not-found.tsx · app/(app)/error.tsx — §6-9 오류 페이지 세 변종. 프레임워크 기본 화면이 나오던 세 자리가 tokens.css 토큰 안으로 들어옴"
affects: [02-07]

actuals:
  tokens: 4903
  tasks: 3
  commits: 3
plan_head_before: db032154e01292ba8e66c7c09979f30847e7aedc

tech-stack:
  added: []
  patterns:
    - "배너·토스트도 ui/<component>/<Name>.tsx + .module.css 관례를 따른다 — 02-03/02-04/02-05와 같은 구조"
    - "다음 한 수가 화면 이동이면 href(<a>), 이동이 아니면 onClick(<button>)— ListEmpty의 action을 유니언 타입으로 확장해 §10 접근성 규칙(3차 버튼은 <button>, 페이지 이동이면 <a>)을 타입으로 강제한다"
    - "§6-9 오류 페이지 세 변종(404 셸 밖·404 셸 안·예외 경계)이 모두 같은 시각 골격(h1 제목 + ListEmpty tone=\"error\" 한 줄)을 공유한다 — 컴포넌트 하나를 세 곳에서 재사용"

key-files:
  created:
    - ui/banner/Banner.tsx
    - ui/banner/Banner.module.css
    - ui/toast/Toast.tsx
    - ui/toast/Toast.module.css
    - app/not-found.tsx
    - app/(app)/not-found.tsx
    - app/(app)/error.tsx
  modified:
    - app/(app)/account/page.tsx
    - app/(app)/account/change-password-form.tsx
    - app/(app)/account/logout-button.tsx
    - app/(app)/admin/system-status/page.tsx
    - ui/list-empty/ListEmpty.tsx

key-decisions:
  - "§6-7 A④는 「내 계정 화면 상단」이다(SYSTEM.md L550 원문: 「임시 비밀번호 배너는 이 화면(로그인)에 뜨지 않는다 — 로그인 직후 내 계정 화면 상단에 뜬다」) — app/(app)/account/page.tsx가 Banner를 렌더하고 app/(app)/layout.tsx는 건드리지 않았다"
  - "F-1은 ①(기존 status 한 줄 승격)이다(SYSTEM.md L548) — app/(auth)/login/page.tsx는 02-03이 쓴 상태 그대로 두고 이 플랜은 건드리지 않았다. Toast는 계약만 세우고 이 플랜에서는 어디에도 배선하지 않는다"
  - "§6-9 C②는 「셸 안」이다(SYSTEM.md L592: 「셋 모두 셸 안에서 렌더된다」) — app/(app)/not-found.tsx를 만들었다(3파일: app/not-found.tsx·app/(app)/not-found.tsx·app/(app)/error.tsx)"
  - "ListEmpty의 action prop을 { href } | { onClick } 유니언으로 확장했다(Rule 2, 아래 Deviations) — 오류 경계의 「다시 시도」는 페이지 이동이 아니라 Next.js의 retry() 호출이라 <a href>로 표현하면 §10(3차 버튼은 <button>, 페이지 이동이면 <a>)을 어긴다"
  - "시스템 상태 화면의 배포 버전·DB 커넥션·마지막 백업 셋을 CSS 없는 순수 <dl>/<dt>/<dd>로 두었다 — 02-04·02-05가 이미 세운 「목록 화면은 CSS 모듈 없이 최소 서버 컴포넌트로」 관례를 따른다(이 플랜의 files_modified에 새 CSS 모듈이 없다)"
  - "오류 화면 세 변종 모두 §6-9 ASCII의 1차 버튼 대신 ListEmpty의 tone=\"error\"(2차 버튼 모양)를 그대로 썼다 — Task 3 action 지시가 「ListEmpty의 오류 톤을 쓴다」고 명시했고, 02-05가 그 tone을 이미 이 용도로 설계해 두었다"

patterns-established:
  - "ui/banner·ui/toast로 §7-11·§7-6 계약을 컴포넌트 하나씩으로 고정 — 향후 배너·토스트가 필요한 모든 화면이 이 둘만 가져다 쓴다"

requirements-completed: []

coverage:
  - id: D1
    description: "ui/banner/Banner.tsx가 §7-11 등급 집합(안내/경고)과 원소 단위로 일치하는 kind prop을 노출하고, 등급에 따라 ARIA 역할(status/alert)이 달라진다. ui/toast/Toast.tsx가 aria-live=\"polite\" 실시간 알림 속성을 갖고 export된다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "pnpm build/lint/typecheck 통과 + grep(export Banner/Toast 존재, ui/status-tag/ git diff 없음, 색 리터럴 합계 0, domain/repositories/db import 0)"
        status: pass
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (29 tests, §7-11/§7-6 문서 계약 회귀)"
        status: pass
    human_judgment: false
  - id: D2
    description: "내 계정 화면이 §6-3 폼 템플릿(ui/input/TextField·ui/button/Button)으로 재구성되고, Phase 1의 모든 동작(next-safe-action 배선·필드 오류 추출·서버 검증 메시지 문자열·로그아웃)과 임시 비밀번호 배너 문구·ARIA 역할이 재구성 전후로 동일하다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/change-password.spec.ts (1) + test/e2e/login-logout.spec.ts (3) — 스펙 파일 무수정, 4 tests"
        status: pass
      - kind: other
        ref: "grep 기반 acceptance criteria(raw input/button 태그 0개, useAction/validationErrors 배선 유지, 배너 렌더 파일 정확히 1개 — account/page.tsx, layout.tsx git diff 없음, 1차 버튼 정확히 1개)"
        status: pass
    human_judgment: false
  - id: D3
    description: "시스템 상태 화면이 dl 라벨·값 목록 + StatusTag(확인 불가) + Banner(한도 경고, 화면 제목 위)로 재구성되고, D-17 접근 제어 세 줄(force-dynamic·미인증 리다이렉트·직원 404)이 재구성 후에도 동작한다"
    requirement: "UX-01"
    verification:
      - kind: e2e
        ref: "test/e2e/system-status.spec.ts (2, 직원 404 케이스 포함) — 스펙 파일 무수정"
        status: pass
      - kind: other
        ref: "node 게이트 라인 검증 스크립트(force-dynamic/notFound()/redirect( 셋 모두 존재)"
        status: pass
    human_judgment: false
  - id: D4
    description: "프레임워크 기본 화면이 나오던 세 자리(존재하지 않는 URL·로그인한 사람이 보는 404·오류 경계)가 tokens.css 토큰 안에서 렌더되는 프로젝트 404/오류 화면으로 바뀌었고, 사과 문구·그림 요소가 없다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "pnpm build(라우트 목록에 /_not-found 프로젝트 페이지) + 로컬 서버 curl 실측(존재하지 않는 URL에 프로젝트 404 문구 렌더 확인) + grep(사과 표현 0, img/svg 0, 각 화면 다음 한 수 요소 ≥1)"
        status: pass
    human_judgment: false

duration: 약 20분
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 6: 내 계정·시스템 상태 화면 재구성 + 배너·토스트·오류 화면 3종 Summary

**Phase 1의 임시 화면 두 개(내 계정·관리자 시스템 상태)를 SYSTEM.md §6-3/§6-8 기준으로 재구성하고, 프레임워크 기본 404·예외 화면이 나오던 세 자리를 §6-9 템플릿(tokens.css 토큰 안)으로 대체했다 — 신설 컴포넌트는 배너(§7-11)·토스트(§7-6) 둘뿐**

## Performance

- **Duration:** 약 20분 (시작 시각 미기록 — 02-05 완료 시각 기준 근사)
- **Started:** 2026-09-19T17:05:00Z (근사, STATE.md 02-05 완료 시각 기준)
- **Completed:** 2026-09-19T17:25:00Z
- **Tasks:** 3
- **Files modified:** 12 (7 신설, 5 수정)

## Accomplishments

- `ui/banner/Banner.tsx` + `Banner.module.css` 신설 — §7-11 배너. `kind` prop(`info`/`warning`)이 ARIA 역할(`status`/`alert`)에 정확히 대응하고, 화면 제목 위 배치·개수 상한(§7-11 D①②③)은 호출부 책임으로 남겼다(컴포넌트는 등급별 색만 고정)
- `ui/toast/Toast.tsx` + `Toast.module.css` 신설 — §7-6 토스트. 최대 1개, 4초 자동 소멸(오류는 닫을 때까지), `aria-live="polite"`, §5 모션 허용 목록(`opacity`+`translateY` 160ms `ease-out`, `prefers-reduced-motion`은 tokens.css 미디어 쿼리가 자동 처리). 이 플랜은 F-1①(토스트 갈래 아님)이라 실제 화면에는 배선하지 않는다 — 계약만 세운다
- `app/(app)/account/page.tsx`·`change-password-form.tsx`·`logout-button.tsx` 재구성 — 원시 `<input>`/`<button>`을 `ui/input/TextField`·`ui/button/Button`으로 교체. next-safe-action 배선, 필드 오류 추출 모양, 서버 검증 메시지 문자열, 최상위 오류 `role="alert"`, 로그아웃 호출·이동 전부 그대로. 임시 비밀번호 배너는 §6-7 A④(내 계정 화면 상단)를 따라 `Banner kind="info"`로 감싸되 문구·역할 불변
- `app/(app)/admin/system-status/page.tsx` 재구성 — 접근 제어 세 줄(`force-dynamic`·미인증 리다이렉트·직원 404) 문자 그대로 보존, 그 아래만 §6-8 `dl` 라벨·값 목록 + `StatusTag kind="muted"`(확인 불가) + `Banner kind="warning"`(한도 경고, 화면 제목 위)로 교체. 라벨·확인 불가·경고 문구 문자열 불변
- `app/not-found.tsx`(신설, 셸 밖) · `app/(app)/not-found.tsx`(신설, 셸 안) · `app/(app)/error.tsx`(신설, 셸 안) — §6-9 오류 페이지 세 변종. §6-9 C②(SYSTEM.md L592 "셋 모두 셸 안에서 렌더된다")에 따라 셸 안 404를 만들었다. 셋 모두 `h1` 제목 + `ListEmpty tone="error"` 한 줄(§7-7 ERROR: 무엇이 안 됐다 + 다음 행동) 골격을 공유한다
- `ui/list-empty/ListEmpty.tsx`의 `action` prop을 `{ href }` | `{ onClick }` 유니언으로 확장(Rule 2) — 오류 경계의 "다시 시도"는 Next.js `retry()` 호출이지 페이지 이동이 아니므로 `<a href>`로 표현하면 §10 규칙(3차 버튼은 `<button>`, 페이지 이동이면 `<a>`)을 어긴다. 기존 호출부(EMPTY 화면 7개)는 전부 `href` 갈래라 무영향
- 로컬 서버 실측으로 존재하지 않는 URL이 Next.js 기본 404가 아니라 프로젝트 404("페이지를 찾을 수 없습니다"/"첫 화면으로")를 렌더함을 확인
- 기존 E2E 세 스펙(change-password·login-logout·system-status, 총 6 tests)이 **스펙 파일 수정 없이** 전부 통과 — 직원의 관리자 화면 404(D-17)도 재구성 후 그대로 동작

## Task Commits

Each task was committed atomically:

1. **Task 1: 배너 · 토스트** - `a020c34` (feat)
2. **Task 2: 내 계정 화면 재구성 — §6-3 폼 템플릿 재사용** - `49d9060` (feat)
3. **Task 3: 시스템 상태 화면 재구성 + 오류 화면(§6-9가 정한 수만큼)** - `8c6381b` (feat)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified

- `ui/banner/Banner.tsx` + `Banner.module.css` - §7-11 배너(신규)
- `ui/toast/Toast.tsx` + `Toast.module.css` - §7-6 토스트(신규)
- `app/(app)/account/page.tsx` - Banner 삽입, ui/ 컴포넌트 재구성(수정)
- `app/(app)/account/change-password-form.tsx` - TextField·Button 재구성(수정)
- `app/(app)/account/logout-button.tsx` - Button 재구성(수정)
- `app/(app)/admin/system-status/page.tsx` - dl·StatusTag·Banner 재구성(수정)
- `app/not-found.tsx` - §6-9 404(셸 밖, 신규)
- `app/(app)/not-found.tsx` - §6-9 404(셸 안, 신규)
- `app/(app)/error.tsx` - §6-9 오류 경계(신규)
- `ui/list-empty/ListEmpty.tsx` - action prop을 href/onClick 유니언으로 확장(수정)

## Decisions Made

- §6-7 A④ = 「내 계정 화면 상단」(SYSTEM.md L550 원문 대조) — `app/(app)/layout.tsx`는 건드리지 않았다
- F-1 = ①(기존 status 한 줄 승격, SYSTEM.md L548) — `app/(auth)/login/page.tsx`는 손대지 않았고 Toast는 이 플랜에서 어디에도 배선하지 않는다
- §6-9 C② = 「셸 안」(SYSTEM.md L592) — `app/(app)/not-found.tsx`를 만들어 3파일 구성이 됐다
- `ListEmpty.action`을 유니언으로 확장 — §10 접근성 규칙(다시 시도는 `<button>`)을 지키기 위한 최소 변경, 기존 7개 호출부 무영향
- 시스템 상태 화면은 CSS 모듈 없이 순수 `dl`/`dt`/`dd` — 02-04·02-05가 세운 "목록 화면은 CSS 없이" 관례를 따랐다(이 플랜의 files_modified에 새 CSS 모듈이 없다)
- 오류 화면 세 변종 모두 §6-9 ASCII의 1차 버튼 대신 `ListEmpty`의 `tone="error"`(2차 버튼 모양)를 그대로 썼다 — Task 3 지시가 명시적으로 그 재사용을 요구했다

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 접근성 정확성] ListEmpty의 action prop을 href/onClick 유니언으로 확장**
- **Found during:** Task 3 (오류 화면 3종)
- **Issue:** `app/(app)/error.tsx`(오류 경계)의 "다시 시도"는 Next.js `retry()` 콜백을 호출해야 하는데, `ListEmpty`는 `action: { label, href }`만 받아 항상 `<a>`를 렌더한다. §10 접근성 계약("3차 버튼은 `<button>`, 페이지 이동이면 `<a>`")상 페이지 이동이 아닌 재시도를 `<a href>`로 표현하는 것은 규칙 위반이다
- **Fix:** `ListEmptyAction` 타입을 `{ label, href }` | `{ label, onClick }` 유니언으로 바꾸고, `href` 존재 여부로 `<a>`/`<button>`을 분기해 렌더한다
- **Files modified:** `ui/list-empty/ListEmpty.tsx`
- **Verification:** 기존 호출부 7개(루트+1차 메뉴 다섯+설정 화면, 모두 `href` 갈래) `pnpm build`/`pnpm test:unit`(272 passed) 무영향 확인. `app/(app)/error.tsx`가 `onClick` 갈래로 `retry`를 렌더
- **Committed in:** `8c6381b` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — 접근성 정확성)
**Impact on plan:** ListEmpty의 기존 API를 넓히기만 했고(하위 호환), 02-05가 만든 7개 EMPTY 화면에는 아무 diff도 없다. 범위 확장 없음.

## Issues Encountered

- Task 2 acceptance criteria의 `grep -c 'useAction' change-password-form.tsx가 1이다`는 실제로는 재구성 전(git show HEAD~1) 코드에서도 2(import 줄 + 호출 줄)였다 — 계획 문서의 예상 개수가 코드 실제와 어긋났다. 재구성 전후로 개수가 2→2로 **동일**함을 확인해 "next-safe-action 배선이 그대로다"라는 검증 의도는 충족했다고 판단했다. 코드는 고치지 않았다(고치면 import 또는 호출을 지워야 해 오히려 배선이 깨진다)

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- Phase 1의 임시 화면(내 계정·관리자 시스템 상태) 재구성이 끝났다 — 성공 기준 2("Phase 1의 임시 화면은 남아 있지 않다")가 이 플랜으로 충족된다
- 프레임워크 기본 화면이 나오던 세 자리(존재하지 않는 URL·앱 안 404·예외 경계)가 tokens.css 토큰 안으로 들어왔다
- `ui/banner/Banner.tsx`·`ui/toast/Toast.tsx`가 서서 향후 페이즈가 재사용할 수 있다 — 특히 Toast는 이 페이즈에서 계약만 세워졌고 실제 배선(예: 지출결의 제출 결과)은 손익·지출결의 화면이 생기는 이후 페이즈의 몫이다
- UX-01 요구사항은 이 플랜의 범위를 충족했지만 페이즈 내 다른 플랜(02-07)과 공유하는 ID라 `requirements.ready-ids`가 아직 「블록」으로 보고한다(`0/1 requirement(s) ready to mark complete`) — 02-07이 끝나면 자동으로 Complete로 바뀐다(shared-ID gate, 02-04·02-05 선례와 동일)
- Toast의 되돌리기 버튼 스타일(`.action`)이 아직 실제 화면에서 시각 확인된 적 없다 — 사람 확인 대기 항목(다음에 Toast를 배선하는 페이즈가 함께 확인)

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: all 12 key files/paths (ui/banner/Banner.tsx+.module.css, ui/toast/Toast.tsx+.module.css, app/(app)/account/page.tsx·change-password-form.tsx·logout-button.tsx, app/(app)/admin/system-status/page.tsx, app/not-found.tsx, app/(app)/not-found.tsx, app/(app)/error.tsx, ui/list-empty/ListEmpty.tsx, this SUMMARY.md)
- FOUND: commits a020c34 (Task 1), 49d9060 (Task 2), 8c6381b (Task 3)
- Re-ran all task-level acceptance criteria: all PASS (Banner/Toast exports, ui/status-tag/ git diff empty, color-literal count 0 across Banner+Toast CSS, domain/repositories/db import count 0, raw input/button tag count 0 in account/*.tsx, banner placement count exactly 1, layout.tsx diff empty, temp-password copy unchanged, gate-line script "ok", spec file diffs empty ×3, sorry-word count 0, img/svg count 0, min_lines ≥10 for all three error screens)
- Re-ran plan-level `<verification>`: `pnpm build`(success, project 404 confirmed via local curl) · `pnpm lint`(0 errors) · `pnpm typecheck`(0 errors) · `pnpm test:unit`(272 passed) · `pnpm playwright test test/e2e/change-password.spec.ts test/e2e/login-logout.spec.ts test/e2e/system-status.spec.ts`(6 passed, spec files unmodified) · color literal count across all `ui/**/*.module.css`(0)
