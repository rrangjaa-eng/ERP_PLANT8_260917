---
phase: 04-project-quote-ledger
plan: 28
subsystem: ui
tags: [keyboard, shortcut, grid, next-safe-action, conflict, playwright, vitest]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-04 격자(use-grid-keyboard·Table 충돌 셀 렌더·SaveRejectedError) · 04-08 isCtrlCombo(lib/shortcut.ts) · 04-46 삭제 확인"
provides:
  - "견적 표 단축키 Ctrl 전용(isCtrlCombo) + 브라우저 기본 동작 차단 + 저장 진행 중·동기 래치 가드"
  - "힌트 줄 { label, keys } 배열 하나 — 라벨 kbd 여섯 항목(저장·Tab·Ctrl+C 없음)"
  - "앱 글리프·메타 키 스캔 단위 테스트(shortcut-notation)"
  - "거부 봉투 { rejected: { summary, cells } } — SaveRejectedError → 고정 오류 셀·충돌 셀"
  - "충돌 셀 「덮어쓰기」/「그 값으로」 + conflictFocusTransition(DR-25) + 버튼 tabindex=-1"
  - "격자 방향키가 DOM 포커스를 옮김 · 편집 중 Esc 뒤 포커스가 셀로 돌아옴(04-04 결함 수정)"
affects: [04-19, 04-30, 04-47, 04-40, 04-12, 04-22, 04-16]

actuals:
  tokens: 15560
  tasks: 3
  commits: 7
plan_head_before: c4648e8e8ee9f177ed33a9e9d69e6d9107136ef9

tech-stack:
  added: []
  patterns:
    - "거부 봉투: 액션이 SaveRejectedError만 잡아 칸 좌표를 돌려주고, 화면이 필드→열 대응 한 표로 셀에 붙인다"
    - "충돌 셀 키보드는 순수 전이 함수(conflictFocusTransition) + Table의 td keydown 한 자리"
    - "저장 이중 방지: isExecuting + 동기 래치(savingRef, 성공·실패 콜백에서 내림)"

key-files:
  created:
    - test/unit/ui/shortcut-notation.test.ts
    - test/unit/ui/conflict-focus.test.ts
  modified:
    - ui/table/use-grid-keyboard.ts
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - ui/table/parse-tsv.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/actions.ts
    - domain/quotes/lines.ts
    - test/e2e/quote-table.spec.ts
    - test/integration/quote-lines-conflict.test.ts

key-decisions:
  - "04-28: 힌트 줄은 여섯 항목 — 04-04 SUMMARY에 Tab 편집 이동·Ctrl+C 범위 복사 배선 기록이 없고 toTsv 호출처도 0이라 둘을 뺐다(04-19가 되돌린다)"
  - "04-28: 거부 봉투는 SaveRejectedError만 — 그 밖의 오류는 serverError 문자열 그대로. revalidatePath는 try 밖(성공 뒤)이라 커밋 뒤 봉투가 생기지 않는다"
  - "04-28: 충돌 이유 문자열 끝 ' · 덮어쓰기 / 그 값으로'는 셀에서 떼고 Table이 ' · 버튼 / 버튼'으로 그린다(텍스트는 Copywriting 원문과 같다)"
  - "04-28: 격자 DOM 포커스 따라가기는 좌표가 실제로 바뀔 때만 — 첫 렌더에서 옮기면 하이드레이션 전 포커스를 빼앗는다"

patterns-established:
  - "뒤 플랜의 셀 오류: 도메인에서 SaveRejectedError의 conflicts/formatErrors에 항목을 더하면 봉투로 화면 셀까지 온다(열 대응은 quote-table.tsx FIELD_TO_COLUMN)"

requirements-completed: [UX-05, UX-04]

coverage:
  - id: D1
    description: "저장·새 줄·줄 복제가 Ctrl 조합에서만 동작하고 Meta+s는 무동작, Ctrl+S 연타에도 요청 1번·+1줄"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(a)(b) Meta+s는 저장하지 않고 Control+s는 저장한다"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(d) 새 줄 + Control+s 두 번 빠르게 → 새로 고친 뒤 줄 수가 정확히 +1"
        status: pass
    human_judgment: false
  - id: D2
    description: "힌트 줄 여섯 항목 라벨 kbd 묶음 · 저장 없음 · 1차 kbd Ctrl+S · EMPTY 3차 kbd Ctrl+Enter, 적힌 조합 전부 동작"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(c) 힌트 줄은 지금 되는 키 여섯 항목의 라벨 kbd 묶음이고 저장 항목이 없다"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#힌트 줄 여섯 조합과 1차 kbd Ctrl+S를 차례로 눌러 적힌 결과를 단언한다"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#0줄 EMPTY의 3차 「첫 줄 만들기」 kbd Ctrl+Enter로 첫 줄이 정확히 하나 생긴다"
        status: pass
    human_judgment: false
  - id: D3
    description: "app/·ui/·SYSTEM.md에 Mac 글리프 넷·메타 키 참조 0개(스캔 테스트)"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/shortcut-notation.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "저장 거부가 칸마다 고정 오류 셀·충돌 셀이 되고, 충돌을 키보드만으로 「그 값으로」·「덮어쓰기」로 해소"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/quote-lines-conflict.test.ts#(b)(c) · (d)"
        status: pass
      - kind: unit
        ref: "test/unit/ui/conflict-focus.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#두 창 충돌 → 충돌 셀 → 키보드만으로 「그 값으로」·「덮어쓰기」 해소"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#수량 0을 저장하면 서버 형식 오류가 그 셀에 고정되고, 고치면 풀린다"
        status: pass
    human_judgment: false
  - id: D5
    description: "1280·1024·375 DOM 실측(힌트 줄 kbd·자리, 충돌 버튼 tabindex, 이유 줄 줄바꿈·가로 스크롤 0)"
    verification: []
    human_judgment: true
    rationale: "독립 DOM 감사는 실행자가 아닌 별도 에이전트가 CI=true로 한다(CLAUDE.md §6) — 오케스트레이터가 결과를 이 SUMMARY에 붙인다"

duration: 44min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 28: 견적 표 단축키 + 저장 거부 셀 표시 Summary

**견적 표 단축키를 `isCtrlCombo` Ctrl 전용 + 저장 래치로 바꾸고, 힌트 줄을 지금 되는 키 여섯 항목의 `라벨 kbd` 배열로 만들었으며, `SaveRejectedError`를 칸 좌표 거부 봉투로 돌려 충돌 셀(「덮어쓰기」/「그 값으로」, DR-25 키보드)·서버 형식 오류 셀로 그린다**

## Performance

- **Duration:** 44 min
- **Started:** 2026-09-24T15:33:40Z
- **Completed:** 2026-09-24T16:17:22Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Ctrl 전용 판정(`isCtrlCombo`) — 자동 반복·한글 조합 중 Ctrl+S/D/Enter 무시, 무시할 때도 브라우저 기본 동작 차단. Meta+s 무동작
- `handleSave` 진행 중(`isExecuting`)·동기 래치(`savingRef`) 가드 — Ctrl+S 연타에도 요청 1번(E2E d)
- 힌트 줄 `QUOTE_HINT_ITEMS` 배열 하나 → `이동 ↑↓←→ · 붙여넣기 Ctrl+V · 취소 Esc · 새 줄 Ctrl+Enter · 줄 이동 Alt+↑↓ · 줄 복제 Ctrl+D`, 1차 kbd `Ctrl+S`, EMPTY 3차 `첫 줄 만들기` + kbd `Ctrl+Enter`(실제로 동작하게 배선)
- 앱 스캔 단위 테스트 — 글리프 넷·메타 키 참조 0
- 거부 봉투 → 칸 단위 고정 오류 셀·충돌 셀, 충돌 셀 키보드(DR-25)

## Task Commits

1. **Task 1: 트레이서 — Ctrl 전용·저장 래치·표기·힌트 줄** — RED `3fc2c53` (test) → GREEN `9b18055` (feat)
2. **Task 2: 앱 스캔 테스트 + 적힌 조합 E2E** — `39448b6` (test) → 앞 플랜 결함 수정 `0f427af` (fix)
3. **Task 3: 거부 봉투 → 충돌 셀·오류 셀 + DR-25** — RED `3e577af` (test) → `6e15300` (fix, 포커스 가로채기 회귀) → GREEN `a70ae3e` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

## RED 증거

- Task 1 E2E(`04-28 Task 1` describe) 3건 모두 의도한 단언에서 실패: (a)(b) `actionRequests` 기대 0 · 실제 1(Meta+s가 저장), (c) 힌트 줄 옛 문자열(`⌘` 포함), (d) 요청 기대 1 · 실제 2
- Task 2 E2E: ArrowDown 뒤 `toBeFocused` 실패(방향키가 DOM 포커스를 옮기지 않음) — 스캔 단위 테스트는 플랜대로 처음부터 초록이며, 글리프·`metaKey`를 임시로 넣어 두 단언이 실패함을 확인
- Task 3 통합: `theirRaw` 기대 9800000 · 실제 undefined, `summary` 기대 `오류 1칸 · 전부 거부` · 실제 undefined. 단위: `conflictFocusTransition is not a function`(export 없음 — 단언 단계가 아닌 TypeError라 엄밀한 의미의 「단언 실패 RED」는 아니다). E2E: 충돌·수량 0 셀에 `aria-invalid` 없음
- 이 플랜은 `type: execute`라 `check tdd-red-evidence` 기록은 만들지 않았다

## 거부 봉투(뒤 플랜 계약)

- **모양:** `saveProjectLedgerAction` → `{ rejected: { summary, cells: { rowId?, rowIndex?, field, kind: "conflict" | "error", reason, theirRaw?, theirVersion? }[] } }`. `summary` = `SaveRejectedError.summary`(`충돌 N줄 · 전부 거부` / `오류 N칸 · 전부 거부` / 둘 다면 ` · `로 이음). 충돌은 `conflicts`(rowId·field=CompareField·theirRaw·theirVersion), 형식 오류는 `formatErrors`(rowIndex·rowId?·field=입력 필드 이름)에서 온다
- **잡는 범위:** `instanceof SaveRejectedError` 하나 — 그 밖의 오류는 던져 `serverError`. 도메인이 쓰기 전에(트랜잭션 안) 던지므로 봉투는 커밋 뒤에 생기지 않는다. `revalidatePath`는 try 밖, 성공 경로에서만
- **화면 연결:** `quote-table.tsx` — 저장 직전 `sentLineKeysRef`(보낸 줄 clientKey 순서) 스냅숏, 칸의 줄 = `rowId`가 있으면 그 id, 없으면 스냅숏의 `rowIndex`. 열 = `FIELD_TO_COLUMN` 한 표. 형식 오류 → `cellErrors[열]`, 충돌 → `cellConflicts[열]`
- **뒤 플랜이 항목을 더하는 법:** 도메인에서 `SaveRejectedError`의 `conflicts`/`formatErrors`에 항목을 더하기만 하면 된다. 새 필드 이름이면 `FIELD_TO_COLUMN`에 한 줄(04-40 계산값 상한 · 04-12 · 04-22)
- **04-47 DR-5와의 이음:** 해소 안 된 충돌 칸은 `errorCellCount`에 들어가 1차 버튼이 비활성·`handleSave`가 서버를 부르지 않는다. 「누르면 첫 오류 칸으로 이동」은 04-47 Task 2 ②가 만든다. 제 오류 0칸인 표의 `전부 거부 · 다른 칸 오류 N칸`은 04-16 Task 3 ⑤-b

## Files Created/Modified
- `ui/table/use-grid-keyboard.ts` — `isCtrlCombo` 판정 + preventDefault, `conflictFocusTransition` export, 주석 글리프 교체
- `ui/table/Table.tsx` — EMPTY 3차 kbd·Ctrl+Enter, 방향키 DOM 포커스 따라가기·Esc 뒤 셀 복귀, 충돌 셀 버튼 tabindex=-1·` · `/` / ` 구분·키 처리
- `ui/table/Table.module.css` — `.emptyActionKbd`(Button `.kbd`와 같은 토큰)
- `ui/table/parse-tsv.ts` — 주석 한 줄(`⌘C` → `Ctrl+C`)만
- `app/(app)/projects/[id]/quote-table.tsx` — 저장 래치, 힌트 배열, kbd 표기, 봉투 → 셀, 「덮어쓰기」/「그 값으로」, `rejectionSummary`(이름 유지)
- `app/(app)/projects/actions.ts` — 거부 봉투
- `domain/quotes/lines.ts` — `CellConflict.theirRaw`·`theirVersion`, `SaveRejectedError.summary`
- 테스트: `test/unit/ui/shortcut-notation.test.ts`(신규), `test/unit/ui/conflict-focus.test.ts`(신규), `test/integration/quote-lines-conflict.test.ts`, `test/e2e/quote-table.spec.ts`

## Decisions Made
- 힌트 줄 **여섯 항목**: `04-04-SUMMARY.md`에 Tab 편집 이동·Ctrl+C 범위 복사 배선 기록 없음(grep) + `toTsv` 호출처 0 + E2E에서 Ctrl+C 동작 없음 → probe_fallback의 여섯 항목 경로
- 충돌 이유 표시: 도메인 `reason`(Copywriting 원문 전체)은 그대로 두고, 셀에서는 끝의 ` · 덮어쓰기 / 그 값으로`를 떼어 Table이 ` · [덮어쓰기] / [그 값으로]`로 그린다 — 셀 텍스트가 원문과 같다
- 충돌 셀 버튼 위 ↑/↓는 그 버튼에 머문다(격자 이동 없음 — plan ④ 「버튼에 포커스가 있는 동안 격자 방향키 이동은 일어나지 않고」)
- 「그 값으로」 뒤 dirty는 줄 값이 baseline과 다를 때(또는 오류 칸이 남을 때)만 유지

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug · ENG-D11 앞 플랜 결함] 방향키가 DOM 포커스를 옮기지 않음(04-04)**
- **Found during:** Task 2(적힌 조합 E2E)
- **Issue:** `useGridKeyboard.moveFocus`가 로빙 좌표(tabIndex)만 바꾸고 `.focus()`를 부르는 곳이 없어 힌트 줄 「이동 ↑↓←→」가 실제로 동작하지 않았다(두 번째 키부터 옛 셀이 이벤트를 받음). 편집 중 Esc 뒤에도 입력 요소가 사라져 포커스가 `<body>`로 빠졌다
- **Fix:** Table에 좌표가 바뀌면 표 안 포커스를 그 셀로 옮기는 효과 + Esc로 편집을 닫은 뒤 셀로 돌려주는 효과(blur 커밋이 취소를 덮지 않게 입력이 내려간 뒤)
- **Files modified:** `ui/table/Table.tsx`
- **Verification:** E2E 「힌트 줄 여섯 조합…」(ArrowDown/Right/Left/Up · Esc 뒤 toBeFocused)
- **Committed in:** `0f427af`

**2. [Rule 1 - Bug] 1번 수정이 하이드레이션 전 포커스를 (0,0)으로 빼앗음**
- **Found during:** Task 3(전체 quote-table E2E)
- **Issue:** 포커스 따라가기 효과가 첫 렌더에도 돌아, 하이드레이션 전에 둔 셀 포커스를 (0,0)으로 옮겼다 — `(h)` 삭제 확인 E2E가 간헐 실패(Esc 뒤 포커스가 번호 셀, 실측: 실패 시 `document.activeElement`가 `data-grid-focus` 번호 셀). 원래 Table.tsx로 되돌리면 10/10 통과
- **Fix:** 이전 좌표 ref와 비교해 실제로 바뀔 때만 옮긴다
- **Files modified:** `ui/table/Table.tsx`
- **Verification:** quote-table 전체 `--repeat-each 2` 30/30, `(h)` 반복 22/22
- **Committed in:** `6e15300`

**3. [Rule 3 - Blocking · 테스트 안정화] E2E `editTextCell`이 편집 입력이 열렸는지 확인**
- **Found during:** Task 3
- **Issue:** 하이드레이션 전 Enter가 사라져 수량 0 테스트가 1회 실패(셀 값 `1` 그대로 — 편집이 안 됐고 빈 저장이 성공)
- **Fix:** 헬퍼가 `expect(...).toPass()`로 편집 입력 포커스를 확인하고 그 전엔 Enter를 다시 누른다 — 단언을 느슨하게 한 것이 아니라 전제(편집 진입)를 확인하는 단언을 더했다
- **Files modified:** `test/e2e/quote-table.spec.ts`
- **Committed in:** `6e15300`

**4. [Rule 2 - Missing] EMPTY 3차 kbd `Ctrl+Enter`가 실제로 동작하게 배선 + kbd 스타일**
- **Found during:** Task 1
- **Issue:** 0줄에서는 gridcell이 없어 Ctrl+Enter를 받을 곳이 없다 — 적어 두면 「적혀 있는데 안 되는」 키가 된다(prohibition)
- **Fix:** `Table` `emptyAction`에 `shortcut` 선택 필드, 버튼 keydown에서 `isCtrlCombo(Enter)` → onClick. `Table.module.css`에 `.emptyActionKbd`(Button `.kbd`와 같은 토큰) — `files_modified` 목록 밖 파일 1개
- **Committed in:** `9b18055`

**5. [Rule 1 - Bug] 경합 경로 `SaveRejectedError`(쓰기 시점 버전 불일치)에도 새 필드 필요**
- **Found during:** Task 3(typecheck)
- **Fix:** 서버 현재 값을 모르므로 `theirRaw: input.itemName`, `theirVersion: input.version`(기준을 올리지 않음) — 해소 뒤 다음 저장이 사전 판정에서 실제 칸 충돌로 다시 거부된다. 드문 경합에서 「그 값으로」가 내 값을 보여 줄 수 있다(아래 Issues)
- **Committed in:** `a70ae3e`

---

**Total deviations:** 5 auto-fixed (Rule 1 ×3, Rule 2 ×1, Rule 3 ×1)
**Impact on plan:** 1·2는 힌트 줄 「이동 ↑↓←→」를 실제로 되게 만드는 데 필요했다(§7-9 「실제로 되는 것만」). 범위 확장 없음.

## Issues Encountered
- 쓰기 시점 경합(사전 판정 뒤 다른 트랜잭션이 커밋) 경로의 충돌은 서버 현재 값을 싣지 못한다 — 「그 값으로」를 누르면 셀이 내 값 그대로이고 그 칸의 dirty가 풀릴 수 있다. 사전 판정 경로(보통의 두 창 충돌)는 정확하다. 매우 드문 경로라 이 플랜에서는 두었다
- `.issueAction`의 `margin-left: var(--s-2)`가 새 ` · `/` / ` 구분 글자와 겹쳐 간격이 약간 넓다(CSS는 건드리지 않았다) — DOM 감사가 볼 항목
- CLAUDE.md §7 충돌 없음

## 독립 DOM 감사가 실측할 항목(오케스트레이터용)

`CI=true` 프로덕션 빌드, 기획 PM 계정, 폭 1280·1024·375. 준비는 E2E 헬퍼 `openProjectWithSavedLines`와 같다(두 창 충돌은 같은 PM의 브라우저 컨텍스트 둘 — B가 첫 줄 실행가 저장 → A가 같은 칸 고쳐 Ctrl+S).
- (a) 1280·1024: 견적 표(`table:has(caption:text-is("견적 줄"))`) 바로 아래 `p` 힌트 줄이 정확히 1개, `kbd` 자식 6개 텍스트 `["↑↓←→","Ctrl+V","Esc","Ctrl+Enter","Alt+↑↓","Ctrl+D"]`, textContent `이동 ↑↓←→ · 붙여넣기 Ctrl+V · 취소 Esc · 새 줄 Ctrl+Enter · 줄 이동 Alt+↑↓ · 줄 복제 Ctrl+D`, `저장` 없음. 매출 표(발행·입금) 아래 힌트 줄 0개. 1차 버튼 `일괄 저장` 안 `kbd` = `Ctrl+S`. 0줄 프로젝트의 `button:has-text("첫 줄 만들기") kbd` = `Ctrl+Enter`
- (b) 충돌 상태: 충돌 셀 `td[aria-invalid="true"]` 안 `button[data-issue-action]` 2개(`덮어쓰기`, `그 값으로`) 둘 다 `tabindex="-1"`, 견적 표 안 `td[role="gridcell"][tabindex="0"]` 정확히 1개. 합계 행 `tfoot` 텍스트에 `충돌 1줄 · 전부 거부`
- (c) 충돌 셀 이유 줄 `td p[id$="-issue"]`가 셀 폭 안에서 줄바꿈(`p.scrollWidth <= td.clientWidth`), `document.documentElement.scrollWidth <= innerWidth`(문서 가로 스크롤 0), 구분 간격(`.issueAction` margin + ` · `) 확인
- (d) 375: 힌트 줄 `getComputedStyle(p).display === "none"`

## 검증 결과(실행자 — 전체 게이트·DOM 감사 제외)
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0 (`lint:sql` 해당 없음 — SQL 변경 없음)
- 단위: `conflict-focus` + `shortcut-notation` + `design-system-docs` 94/94
- 통합: `quote-lines-conflict` + `leak-scan` 828/828
- E2E(dev): `quote-table.spec.ts` `--repeat-each 2` 30/30 · `quote-table` + `project-register` 22/22(Task 2)
- E2E(`CI=true`): `quote-table.spec.ts` + `project-register.spec.ts` 24/24
- 의존성: `package.json`·`pnpm-lock.yaml` diff 없음(c4648e8..HEAD)
- 전체 게이트 `CI=true pnpm test`와 독립 DOM 감사는 오케스트레이터 몫 — 결과가 여기에 붙는다

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 04-19: 힌트 배열에 `이동 Tab ↑↓←→ · 복사 Ctrl+C`를 되돌리고, 포커스를 `{ rowId, colKey }`로 바꿀 때 `conflictFocusTransition`·포커스 따라가기(첫 렌더 제외)를 옮긴다
- 04-47: `errorCellCount`(충돌 포함) 위에 DR-5 첫 오류 칸 이동
- 04-40·04-12·04-22: `SaveRejectedError`에 항목을 더하면 봉투로 셀까지 온다

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*

## Self-Check: PASSED
