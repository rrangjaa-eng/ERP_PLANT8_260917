---
phase: quick-260922-o2b
plan: 01
subsystem: ui
tags: [nextjs, react, css, design-system, playwright, vitest]

# Dependency graph
requires:
  - phase: 02-design-system-app-shell
    provides: "SYSTEM.md 디자인 시스템(--form-max·--modal-w 등 폭 토큰), globals.css 전역 유틸리티 선례(.sr-only)"
  - phase: 03-permissions-settings-masters
    provides: "관리자 마스터 화면 10개(거래처·법인카드·코드표·사람·계급·조직·설정·시스템 상태), HistoryList 컴포넌트"
provides:
  - "SYSTEM.md §3 「단일 기둥 최대 폭」 절 신설(적용·제외 목록 전문) + 전역 .single-column 유틸리티, 관리자 한 열 화면 5개·등록/수정 폼 6종에 적용"
  - "코드표·계급 정렬 칸, HistoryList 숫자형 값 칸 우측 정렬·tabular-nums·nowrap(.table .num)"
  - "거래처·법인카드·코드표·사람·계급의 빈 상태/시드 칸이 빈칸 대신 — 렌더"
  - "「더보기」 시트 하단 고정(inset-block-start: auto), 폰 사용자 메뉴 트리거·설정 체크박스 라벨 44px 터치 목표"
  - "--auth-max(360px) 신설 — 로그인 틀이 --modal-w(480) 재사용 대신 SYSTEM.md §6-7 확정값을 쓴다"
  - "/account 「비밀번호 변경」 섹션 제목이 --fs-lg 타입 스케일(18px/700)"
affects: [04-project-quote-ledger]

# Actuals (#2632) — pairs with the plan's estimate (130000 estimateTokens) to calibrate future estimates.
actuals:
  tokens: 13885
  tasks: 3
  commits: 8
  plan_head_before: f67750e11994f1a3e0d3dfe7fd0f9e0abcaf9e6d

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ".single-column 전역 유틸리티(app/globals.css) — .sr-only와 같은 자리, 폭 하나짜리 규칙이라 새 컴포넌트 없이 className 부착만으로 건다"
    - ".table .num 선택자(명시도 0,2,0)로 .table th{text-align:left}(0,1,1)을 이긴다 — 모듈 CSS 세 곳(code-tables·people·HistoryList)이 같은 패턴"

key-files:
  created:
    - "test/unit/ui/single-column.test.ts"
    - "test/e2e/single-column.spec.ts"
    - "app/(app)/account/account.module.css"
  modified:
    - "docs/design/SYSTEM.md"
    - "docs/design/DECISIONS.md"
    - "docs/design/tokens.css"
    - "app/globals.css"
    - "app/(app)/account/page.tsx"
    - "app/(app)/account/change-password-form.tsx"
    - "app/(app)/admin/page.tsx"
    - "app/(app)/admin/settings/page.tsx"
    - "app/(app)/admin/settings/settings.module.css"
    - "app/(app)/admin/people/[id]/page.tsx"
    - "app/(app)/admin/people/org/page.tsx"
    - "app/(app)/admin/system-status/page.tsx"
    - "app/(app)/admin/vendors/vendor-form.tsx"
    - "app/(app)/admin/vendors/page.tsx"
    - "app/(app)/admin/corp-cards/card-form.tsx"
    - "app/(app)/admin/corp-cards/page.tsx"
    - "app/(app)/admin/code-tables/code-item-form.tsx"
    - "app/(app)/admin/code-tables/page.tsx"
    - "app/(app)/admin/code-tables/code-tables.module.css"
    - "app/(app)/admin/people/person-form.tsx"
    - "app/(app)/admin/people/page.tsx"
    - "app/(app)/admin/people/people.module.css"
    - "app/(app)/admin/people/roles/roles-client.tsx"
    - "ui/history-list/HistoryList.tsx"
    - "ui/history-list/HistoryList.module.css"
    - "ui/shell/MoreSheet.module.css"
    - "ui/shell/TopBar.module.css"
    - "ui/auth-frame/AuthFrame.module.css"
    - "test/unit/ui/system-md-compliance.test.ts"
    - "test/e2e/code-tables.spec.ts"
    - "test/e2e/master-edit.spec.ts"
    - "test/e2e/mobile-shell.spec.ts"
    - "test/e2e/mobile-page-chrome.spec.ts"
    - "test/e2e/page-chrome.spec.ts"

key-decisions:
  - "F-02: 기존 --form-max(720)를 폼 밖 한 열 콘텐츠까지 넓혀 쓴다 — 새 폭 토큰을 만들지 않는다. §2-3 「표·폼은 컨테이너 폭」과 §6-3 「한 열, max 720」의 모순을 §3 「단일 기둥 최대 폭」 절 하나로 해소(적용/제외 목록을 다른 절에 위임하지 않고 그 자리에 전문 기재)"
  - "F-09: AuthFrame의 --modal-w(480) 재사용을 철회하고 --auth-max(360) 신설 — SYSTEM.md §6-7이 이미 확정한 값에 토큰 이름만 붙인다(--on-accent-weak 선례). DECISIONS.md에 버린 대안 3개 기록"
  - "F-08: 빈 상태 칸은 새 상태 낱말(활성·사용 중)이 아니라 SYSTEM.md §2-4가 이미 정한 — 하나로 채운다 — 카피 결정은 범위 밖"
  - "F-07 행동 로그 날짜는 제외 — 셀이 toISOString()으로 UTC를 찍고 프로젝트에 KST 표시 정책이 없다. 형식만 바꾸면 UTC가 굳는다. 별도 결함으로 보고(아래 Deviations 참고)"

patterns-established:
  - "SYSTEM.md의 폭·터치 목표 규칙을 한 자리에 전문으로 적고 다른 절은 그 자리를 참조만 한다(§3 「단일 기둥 최대 폭」이 §2-3·§6-1·§6-3에서 참조됨) — 위임 문장이 여러 절에 흩어지면 다음 화면이 빠뜨린다는 교훈(투두 2026-09-22-single-column-max-width.md)"

requirements-completed: [QUICK-260922-o2b, F-02, F-04, F-05, F-07, F-08, F-09, F-10]

coverage:
  - id: D1
    description: "1280px에서 /account·/admin·/admin/settings·/admin/people/[id]·/admin/people/org·/admin/system-status의 한 열 콘텐츠와 관리자 마스터 등록·수정 폼 6종이 720px 이하로 main h1과 같은 x에서 시작하고, 코드표 목록 표는 여전히 720px보다 넓다(F-02)"
    requirement: "F-02"
    verification:
      - kind: unit
        ref: "test/unit/ui/single-column.test.ts (18 tests)"
        status: pass
      - kind: e2e
        ref: "test/e2e/single-column.spec.ts (12 tests, desktop)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SYSTEM.md §2-3·§3이 단일 기둥 최대 폭 규칙(적용/제외 목록·폰 동작·구현 클래스)을 그 자리에 전문으로 적고, DECISIONS.md에 이유·버린 대안이 있으며, tokens.css는 --form-max 주석만 확장한다(새 토큰 없음)"
    requirement: "F-02"
    verification:
      - kind: unit
        ref: "test/unit/ui/single-column.test.ts — SYSTEM.md/DECISIONS.md/tokens.css 소스 단언 4건"
        status: pass
    human_judgment: false
  - id: D3
    description: "375px에서 「더보기」 시트 아래 끝이 뷰포트 아래 끝(800)에 붙고 위 끝은 0보다 아래다(F-04)"
    requirement: "F-04"
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-shell.spec.ts#「더보기」 시트가 뷰포트 아래 끝에 붙는다(F-04), mobile-375"
        status: pass
    human_judgment: false
  - id: D4
    description: "375px에서 상단 바 사용자 메뉴 트리거가 44×44 이상이고 상단 바를 넘치지 않으며, /admin/settings 체크박스 라벨은 높이 44 이상·glyph는 20×20 그대로다(F-05 부분)"
    requirement: "F-05"
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-shell.spec.ts#사용자 메뉴 트리거가 44×44 이상이고 상단 바를 넘치지 않는다(F-05), mobile-375"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-page-chrome.spec.ts#체크박스를 가진 라벨이 높이 44 이상이고 체크박스 glyph는 20×20이다, mobile-375"
        status: pass
    human_judgment: false
  - id: D5
    description: "코드표·계급의 정렬 칸(머리글 포함)과 HistoryList 숫자형 이력 값 칸이 우측 정렬·tabular-nums·nowrap이다(F-07 부분)"
    requirement: "F-07"
    verification:
      - kind: unit
        ref: "test/unit/ui/system-md-compliance.test.ts — 관리자 표 숫자 칸 정렬 (F-07), 6 tests"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#「정렬」 칸이 우측 정렬·tabular-nums·nowrap이고 「상태」 칸에 —가 있다, desktop"
        status: pass
    human_judgment: false
  - id: D6
    description: "거래처·법인카드·코드표·사람 목록의 정상 상태 칸과 계급의 비시드 칸이 빈칸 대신 —를 보인다(F-08), master-edit.spec.ts는 소유 열로 좁혀 결함 3 회귀를 계속 감시한다"
    requirement: "F-08"
    verification:
      - kind: unit
        ref: "test/unit/ui/system-md-compliance.test.ts — 관리자 표 빈 상태 칸 em dash (F-08), 5 tests"
        status: pass
      - kind: e2e
        ref: "test/e2e/master-edit.spec.ts#등록한 카드의 「수정」을 눌러 개인 → 팀으로 바꾸면 종류와 소유가 함께 바뀐다, desktop"
        status: pass
    human_judgment: false
  - id: D7
    description: "/login 폼 틀이 360px 이하로 가운데 정렬되고 그 폭이 --auth-max 토큰에서 온다(F-09)"
    requirement: "F-09"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts — SYSTEM.md가 참조하는 커스텀 속성이 전부 실재한다"
        status: pass
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#/login form 폭이 360 이하 · 300 초과이고 가로 중심이 640이다, desktop"
        status: pass
    human_judgment: false
  - id: D8
    description: "/account 「비밀번호 변경」 h2가 font-size 18px·font-weight 700으로 계산된다(F-10)"
    requirement: "F-10"
    verification:
      - kind: e2e
        ref: "test/e2e/page-chrome.spec.ts#「비밀번호 변경」 h2가 18px·700이다, desktop"
        status: pass
    human_judgment: false
  - id: D9
    description: "CI=true 전체 게이트(pnpm test:e2e:ci)와 독립 DOM 감사는 실행자가 아니라 오케스트레이터가 수행한다 — 실행자는 싼 게이트(lint·typecheck·test:unit·build)와 좁은 E2E만 확인했다"
    verification: []
    human_judgment: true
    rationale: "프롬프트 지시대로 CI=true 전체 e2e 스위트와 독립 DOM 감사는 이 실행 범위 밖이다 — 오케스트레이터가 별도 에이전트로 수행해야 must_haves.truths 8개를 실측 판정한다."

duration: ~55min
completed: 2026-09-22
status: complete
---

# Quick Task 260922-o2b Summary

**SYSTEM.md §3에 「단일 기둥 최대 폭」 절 신설 + 전역 .single-column 유틸리티를 관리자 화면 5개·폼 6종에 적용, 숫자 칸 우측 정렬(.table .num)과 빈 상태 칸 em dash, 「더보기」 시트 하단 고정·폰 터치 목표 44px, --auth-max(360) 신설로 로그인 틀 좁힘, /account 섹션 제목 타입 스케일 — Codex 전체 디자인 리뷰의 사용자 결정 불필요 항목 7건(F-02·F-04·F-05·F-07·F-08·F-09·F-10) 반영**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 완료
- **Commits:** 8 (태스크별 계획대로: Task 1 = 2개, Task 2 = 2개, Task 3 = 4개)
- **Files modified:** 33 (신설 3 포함)

## Accomplishments

- `docs/design/SYSTEM.md` §3에 「단일 기둥 최대 폭」 절 신설 — 적용 목록(폼·설정 필드 묶음·`dl`·계층 목록·한 칸짜리 링크 목록) · 제외 목록(표·매트릭스·대시보드·EMPTY·배너·제목 줄) · 목록 머리글 행동 줄 규칙 · 구현 지시(`.single-column`)를 그 자리에 전문으로 적었다. §2-3 「줄 길이」 줄도 함께 정정 — 「표·폼은 컨테이너 폭」(틀린 규정)을 「데이터 표만 컨테이너 폭, 한 열 콘텐츠는 --form-max」로 교체
- 전역 유틸리티 `app/globals.css`의 `.single-column`을 관리자 한 열 화면 5개(관리 인덱스·설정·사람 상세·조직·시스템 상태)와 등록·수정 폼 6종(거래처·법인카드 등록/소유자 변경·코드표·사람·계급)에 적용 — 코드표 목록 표는 그대로 컨테이너 폭
- 코드표·계급의 「정렬」 칸, `HistoryList`의 숫자형 값 칸에 `.table .num`(우측 정렬·tabular-nums·nowrap·letter-spacing:0)을 걸었다. 거래처·법인카드·코드표·사람의 정상 상태 칸과 계급의 비시드 「시드 여부」 칸이 빈칸 대신 `—`를 렌더한다
- 「더보기」 시트 `.sheet`에 `inset-block-start: auto`를 추가해 네이티브 `dialog:modal` 기본값(위아래 inset 0)을 풀고 하단에만 고정. 폰 상단 바 사용자 메뉴 트리거와 설정 체크박스 라벨에 44px 최소 터치 목표를 줬다(glyph·전역 `--control-h`는 그대로)
- `--auth-max: 360px` 토큰을 신설해 로그인 틀이 `--modal-w`(480) 재사용을 철회 — SYSTEM.md §6-7이 이미 확정한 값에 이름을 붙였다(DECISIONS.md 기록). `/account`의 「비밀번호 변경」 h2에 `--fs-lg` 타입 스케일(18px/1.4/700)을 적용하는 `account.module.css`를 신설

## Task Commits

1. **Task 1a: SYSTEM.md·DECISIONS.md·tokens.css 개정** — `6decee6` (docs)
2. **Task 1b: .single-column 유틸리티 + /account 적용** — `35421a3` (feat)
3. **Task 2a: 관리자 화면·폼 전면 적용(F-02)** — `d8913f5` (feat)
4. **Task 2b: 숫자 칸 정렬 + 빈 상태 칸 em dash(F-07·F-08)** — `79ed70c` (fix)
5. **Task 3a: 더보기 시트 하단 고정(F-04)** — `67f6d17` (fix)
6. **Task 3b: 폰 터치 목표 44px(F-05)** — `c8da850` (fix)
7. **Task 3c: 로그인 틀 --auth-max(F-09)** — `472c461` (fix)
8. **Task 3d: /account 섹션 제목 타입 스케일(F-10)** — `c8b42b9` (fix)

## Files Created/Modified

- `test/unit/ui/single-column.test.ts` — 신설, SYSTEM.md/DECISIONS.md/tokens.css/globals.css 소스 단언 + TARGETS 배열 11개 파일 대조
- `test/e2e/single-column.spec.ts` — 신설, `expectSingleColumn`/`expectAllSingleColumn` 도우미 + 1280px 폭·x 정렬 대조 12케이스
- `app/(app)/account/account.module.css` — 신설, `.sectionTitle`(--fs-lg/700/--s-6·--s-3 margin)
- `docs/design/SYSTEM.md` — §2-3 줄 길이 정정, §3 「단일 기둥 최대 폭」 신설, §6-7 틀 폭 줄 추가
- `docs/design/DECISIONS.md` — 2026-09-22 항목 2건(단일 기둥 최대 폭, 로그인 틀 폭 360)
- `docs/design/tokens.css` — `--form-max` 주석 확장, `--auth-max: 360px` 신설
- `app/globals.css` — `.single-column` 전역 유틸리티
- 관리자 화면·폼 20개 — `className="single-column"` 부착, 숫자 칸 `.table .num`, 빈 상태 칸 `"—"` (파일 목록은 frontmatter `key-files.modified` 참고)
- `ui/shell/MoreSheet.module.css` — `.sheet`에 `inset-block-start: auto`
- `ui/shell/TopBar.module.css` — 폰 미디어 쿼리에 `.userTrigger` 44px
- `app/(app)/admin/settings/settings.module.css` — 폰 미디어 쿼리에 `.checkboxLabel` 44px
- `ui/auth-frame/AuthFrame.module.css` — `.frame` max-width를 `--modal-w` → `--auth-max`로 교체
- `test/unit/ui/system-md-compliance.test.ts` — F-07·F-08 소스 단언 11건 추가
- `test/e2e/code-tables.spec.ts` — F-07·F-08 DOM 계산값 대조 1케이스 추가
- `test/e2e/master-edit.spec.ts` — 소유 칸 단언을 행 전체에서 소유 열(nth(4))로 좁힘
- `test/e2e/mobile-shell.spec.ts` / `mobile-page-chrome.spec.ts` / `page-chrome.spec.ts` — F-04·F-05·F-09·F-10 대조 5케이스 추가

## TDD Evidence — RED 출력 인용

### Task 1 RED (single-column.test.ts, 구현 전)

```
Test Files  1 failed (1)
     Tests  8 failed (8)
```

대표 실패:

```
FAIL  test/unit/ui/single-column.test.ts > app/globals.css — .single-column 전역 유틸리티
      > .single-column 블록에 max-width: var(--form-max)가 있다
AssertionError: expected null not to be null
```

### Task 1 RED (single-column.spec.ts, E2E, 구현 전 — 회귀 확인용, PLAN 요구대로 실제로 실행해 폭 약 1240을 확인)

구현 전 상태로는 별도 재현하지 않고 PLAN이 요구한 "약 1240" 실패를 태스크 2의 관리자 화면 RED에서 동일 패턴으로 반복 확인했다(아래).

### Task 2 RED (single-column.test.ts TARGETS 확장 10개, 구현 전)

```
Test Files  1 failed (1)
     Tests  10 failed | 8 passed (18)
```

### Task 2 RED (single-column.spec.ts, 관리자 화면·폼 10케이스, 구현 전)

```
10 failed
2 passed (1.2m)
```

대표 실패(폭 720 기대, 실측 1240):

```
1) [desktop] › single-column.spec.ts › /admin의 main ul 전부가 720px 이하로 main h1과 같은 x에서 시작한다
   Expected: <= 720
   Received:    1240
```

### Task 2 RED (system-md-compliance.test.ts F-07·F-08, 구현 전)

```
Test Files  1 failed (1)
     Tests  11 failed | 5 passed (16)
```

### Task 2 RED (code-tables.spec.ts F-07 DOM, 구현 전)

```
1) code-tables.spec.ts › 「정렬」 칸이 우측 정렬·tabular-nums·nowrap이고 「상태」 칸에 —가 있다
   Locator:  locator('main table').first().locator('thead th').nth(2)
   Expected: "right"
   Received: "left"
```

### Task 3 RED (mobile-shell.spec.ts F-04·F-05, page-chrome.spec.ts F-09·F-10, mobile-page-chrome.spec.ts F-05, 구현 전)

```
3 failed  (mobile-shell.spec.ts: F-04 시트 y>0 기대·실측 0, F-05 트리거 44 기대·실측 19.1875)
1 failed  (mobile-page-chrome.spec.ts: F-05 라벨 44 기대·실측 26)
2 failed  (page-chrome.spec.ts: F-09 폭 360 기대·실측 480, F-10 18px 기대·실측 21px)
```

각 수정 뒤 해당 케이스를 GREEN으로 확인한 뒤 커밋했다(Task Commits 표 참고).

## 실행한 좁은 E2E (dev 서버, 완료 신호 아님)

CLAUDE.md 화면 검증 순서대로 태스크 안 E2E는 dev 서버로 도는 좁은 확인이다. 최종 판정은 오케스트레이터의 독립 DOM 감사와 `CI=true` 전체 게이트가 한다.

| 스펙 | 결과 |
|---|---|
| `test/unit/ui/single-column.test.ts` | 18/18 통과 |
| `test/unit/ui/system-md-compliance.test.ts` | 통과(신규 F-07·F-08 11건 포함) |
| `test/unit/design-system-docs.test.ts` | 42/42 통과(`--auth-max` 실재 확인 포함) |
| `test/e2e/single-column.spec.ts` (desktop) | 12/12 통과 |
| `test/e2e/code-tables.spec.ts` (desktop) | 4/4 통과 |
| `test/e2e/master-edit.spec.ts` (desktop) | 4/4 통과 |
| `test/e2e/mobile-shell.spec.ts` (mobile-375) | 12/12 통과 |
| `test/e2e/mobile-page-chrome.spec.ts` (mobile-375) | 6/6 통과 |
| `test/e2e/page-chrome.spec.ts` (desktop) | 14/14 통과 |

## 싼 게이트 (실행자, 전체)

| 명령 | 결과 |
|---|---|
| `pnpm lint` | 통과(사전에 존재하던 boundaries 플러그인 deprecation 경고만, 이번 변경과 무관) |
| `pnpm typecheck` | 통과 |
| `pnpm test:unit` | 통과 — 69 files, 675 tests |
| `pnpm build` | 통과 — 프로덕션 빌드 성공, `/admin` 등 전 라우트 생성 확인 |

**CI=true 전체 게이트(`pnpm test:e2e:ci`)와 독립 DOM 감사는 오케스트레이터 대기.**

## Decisions Made

- F-02: 새 폭 토큰을 만들지 않고 기존 `--form-max`(720)를 폼 밖 한 열 콘텐츠까지 넓혀 쓴다. §3에 적용·제외 목록을 전문으로 적어 다른 절이 위임 문장으로 새는 것을 막는다(투두 해소 조건 1·2·3)
- F-09: `--auth-max`(360) 신설 — 480(`--modal-w`) 재사용이 SYSTEM.md §6-7과 기록 없이 어긋나 있었다. 값 자체는 새 디자인 결정이 아니라 이미 확정된 값에 토큰 이름을 붙이는 것
- F-08: 빈 상태 칸은 `—`로만 채운다 — `활성`·`사용 중` 같은 새 상태 낱말은 카피 결정이라 범위 밖(UI-SPEC의 상태 낱말에도 없다)
- F-07 행동 로그 날짜는 제외 — 셀이 `toISOString()`으로 UTC를 찍고 프로젝트에 KST 표시 정책이 없다. 형식만 바꾸면 UTC가 굳는다. 아래 「제외 항목」에 별도 결함으로 보고

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E 테스트 설계 오류 — 조직 화면 중첩 `<ul>`을 최상위 목록과 같은 기준으로 대조**

- **Found during:** Task 2, `/admin/people/org의 main ul 전부` E2E 케이스 GREEN 확인 중
- **Issue:** 팀 목록 `<ul>`이 본부 `<li>` 안에 중첩되는 계층 목록(SYSTEM.md §3 「계층 목록(조직의 본부·팀)」 대상)인데, 테스트가 `main ul`로 중첩 `<ul>`까지 잡아 대조했다. 브라우저 기본 list padding(40px)으로 의도적으로 들여쓰기된 하위 목록이 최상위와 같은 x 정렬 기준에 걸려 40px 오차로 실패했다
- **Fix:** 프로덕션 코드가 아니라 테스트 선택자를 `main ul` → `main .single-column > ul`(직계 자식만)로 좁혔다 — 계층 목록의 들여쓰기는 규칙이 이미 허용하는 동작이다
- **Files modified:** `test/e2e/single-column.spec.ts`
- **Verification:** 수정 뒤 해당 케이스 통과, 전체 12케이스 재실행 통과
- **Committed in:** `d8913f5` (Task 2 Part A 커밋)

---

**Total deviations:** 1 auto-fixed (Rule 1 — 테스트 설계 오류, 프로덕션 코드 변경 없음)
**Impact on plan:** 계획이 의도한 대로 계층 목록은 들여쓰기를 유지한다. 스코프 크리프 없음.

## 제외 항목 (planning_findings)

- **F-07 행동 로그 날짜(UTC 표시 결함, 별도 보고)**: SYSTEM.md §2-4는 같은 해 날짜를 `09-18`, 시각을 `14:00`으로 규정하지만 이 계획에서는 손대지 않았다. 셀이 `toISOString()`으로 **UTC**를 찍고 있고, 프로젝트 어디에도 `Asia/Seoul`/KST 표시 정책이 없다. 형식만 이 계획에서 바꾸면 UTC가 그대로 굳어버린다 — KST로 바꾸는 것과 감사 로그에서 초를 버리는 것은 둘 다 사용자 결정이 필요하다. **다음 조치가 필요한 결함으로 남긴다** — 담당: 사용자 결정 후 후속 태스크.
- **F-01·F-03·F-06·폰 `--control-h`**: 사용자 결정 대기, 지시대로 건드리지 않았다.

## 관찰만 하고 고치지 않은 것 (보고)

1. §6-3 칸 폭 규칙(select 200 · 짧은 칸 280 · 긴 칸 480)이 어디에도 적용되지 않았다. F-02 뒤 입력칸은 1136px에서 720px 안쪽으로 줄지만 칸 폭 규칙 자체는 여전히 어긴다. 공용 `TextField`를 건드리는 별도 작업이 필요하다.
2. 비율 이력 값이 `0.1`로 보인다(§2-4 비율 형식은 `10.0%`). 표시 형식 결정이 필요하다.
3. 이력 목록의 과거 행 상태 칸이 여전히 비어 있다. §7-14는 `적용 중`·`예정`만 정의하고 `past` 상태의 표시를 정하지 않았다.
4. 투두 곁가지 FINDING-003(`/admin` `.link`의 죽은 `gap`)은 그대로 둔다.

## 투두 해소

`.planning/todos/pending/2026-09-22-single-column-max-width.md`의 해결 조건 1·2·3(SYSTEM.md에 규칙 신설, 관리자 화면 적용, DECISIONS.md 기록)을 모두 충족했다 — **닫을 수 있다.** 투두 이동은 오케스트레이터가 GSD 도구로 한다(`.planning/` 수동 편집 금지, 이 SUMMARY는 편집하지 않았다).

## Issues Encountered

None beyond the deviation above.

## Next Phase Readiness

- Phase 4(project-quote-ledger)가 새 화면을 만들기 전에 전역 규칙의 공백(단일 기둥 최대 폭)이 닫혔다 — 새 화면이 이 습관을 물려받지 않는다.
- 관찰 항목 4건(칸 폭·비율 형식·과거 행 상태 표시·`/admin .link` gap)은 이번 범위 밖으로 남아 있다 — 사용자 결정 또는 별도 계획이 필요하다.
- Post-build 넷(`/review` → `/qa` → `/design-review` → `/cso`(해당 없음, 인증·권한·암호화·외부 입력 로직 변경 없음))은 오케스트레이터가 이어서 진행한다.

---
*Phase: quick-260922-o2b*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created files (`test/unit/ui/single-column.test.ts`, `test/e2e/single-column.spec.ts`,
`app/(app)/account/account.module.css`) and all eight commit hashes
(`6decee6`, `35421a3`, `d8913f5`, `79ed70c`, `67f6d17`, `c8da850`, `472c461`, `c8b42b9`)
verified present on disk / in git log.
