---
phase: 04-project-quote-ledger
plan: 19
subsystem: ui-table
status: complete
tags: [table, pagination, keyboard, grid, clipboard, copy-event, hint-row, react]
requires:
  - phase: 04-29
    provides: lib/paging(clampPage · QUOTE_TABLE_PAGE_SIZE) · ui/pagination(Pagination · pageRangeText)
  - phase: 04-24
    provides: quoteLineReadColumns(copyText) · quoteLineClipboardMeta — 견적 줄 복사 직렬화의 주인(W1)
  - phase: 04-28
    provides: 힌트 항목 배열 { key, label, keys } · conflictFocusTransition · isCtrlCombo 사용
  - phase: 04-30
    provides: visibleHintKeys · saveLocked(저장 중 잠금)
provides:
  - ui/table/paging.ts — splitPages(pinned 입력) · pageOfRow · pageEntryFocus · crossPageTarget(줄 id) · nextEditableCell · resolveFocus
  - Table pagination prop(30줄 쪽 · 그룹 머리글 반복 · 렌더마다 clampPage · 쪽 전환 포커스 DR-23 · 읽기 섹션 focusHeadingId)
  - Table copyMeta · TableColumn.copyText · 네이티브 copy 이벤트 복사(TSV + application/x-plant8-quote-lines+json)
  - Table hint 자리(페이지 줄 다음, 1024 미만 숨김) · 견적 표 힌트 일곱 항목
  - useGridKeyboard — 포커스·앵커 { rowId, colKey } · 줄 id 핸들러 · onEdgeExit · onTab · onSelectAll(Ctrl+A)
affects: [04-47, 04-18, 04-31]
actuals:
  tokens: 26600
  tasks: 2
  commits: 6
tech-stack:
  added: []
  patterns:
    - 격자 포커스는 id로 기억하고 좌표는 렌더마다 지금 쪽에서 다시 구한다(resolveFocus)
    - 쪽 경계 대상은 표시 순서 id 배열로 정한다 — 쪽 번호 산술 금지(C-18)
    - 복사는 클립보드 권한 API가 아니라 document copy 이벤트의 clipboardData(C-19)
key-files:
  created:
    - test/unit/ui/table-paging.test.ts
  modified:
    - ui/table/paging.ts
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - ui/table/types.ts
    - ui/table/use-grid-keyboard.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/previous-revision.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - domain/quotes/edit-scope.ts
    - test/e2e/quote-table.spec.ts
    - test/e2e/quote-revisions.spec.ts
    - test/e2e/quote-edit-scope.spec.ts
    - test/unit/ui/grid-keyboard-composing.test.ts
key-decisions:
  - "04-19: 격자 포커스·범위 앵커는 { rowId, colKey }로 기억하고 onMoveRow·onDeleteRow·onDuplicateRow는 줄 id를 넘긴다 — 2쪽 이후 Delete·Alt+↑↓가 1쪽 같은 인덱스 줄에 작용하던 경로를 없앤다"
  - "04-19: Ctrl+C는 키보드 훅이 가로채지 않고 Table이 document copy 이벤트에서 선택을 싣는다 — 접힌 선택(셀 포커스만)에서도 Chromium이 copy를 쏜다는 것을 E2E로 확인해 execCommand 대체는 두지 않았다"
  - "04-19: 편집 중 Tab은 칸 안에 다음 입력(단가의 통화·금액·환율)이 있으면 그리로, 없으면 확정 후 nextEditableCell — 편집 중이 아닐 때 Tab은 표를 떠난다(탭 정지 1개)"
requirements-completed: [UX-05, UX-04, PROJ-05]
coverage:
  - id: D1
    description: "견적 표·이전 차수 읽기 섹션이 30줄 쪽으로 나뉘고 그룹 머리글 반복 · 번호 연속 · 합계 전체 기준 · 두 쪽 편집 저장 · 쪽 보정 · 쪽 전환 포커스"
    requirement: UX-05
    verification:
      - kind: unit
        ref: "test/unit/ui/table-paging.test.ts"
        status: pass
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/quote-table.spec.ts test/e2e/ledger-save-flow.spec.ts (32/32)"
        status: pass
    human_judgment: false
  - id: D2
    description: "쪽 경계 ↑↓ · Alt+↑↓ 따라가기 · 2쪽 Delete 대상 · 편집 중 Tab 쪽 넘김 · Shift 범위 쪽 안 · 포커스 id 기억"
    requirement: UX-04
    verification:
      - kind: unit
        ref: "test/unit/ui/table-paging.test.ts#crossPageTarget · nextEditableCell · resolveFocus"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(공백 4) · (§3) · ↓가 1쪽 끝을 넘으면 · 편집 중 Tab"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ctrl+A → Ctrl+C가 45줄 전부를 04-24 직렬화 TSV와 앱 형식 JSON으로 싣는다(PROJ-05 복사 쪽)"
    requirement: PROJ-05
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#편집 중이 아닐 때 Control+a → Control+c는 45줄 전부를"
        status: pass
    human_judgment: false
  - id: D4
    description: "힌트 줄 일곱 항목이 페이지 줄 바로 다음 한 곳 · 매출 표 없음 · 1000 폭 없음"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#힌트 줄은 일곱 항목이고 페이지 줄 바로 다음 형제"
        status: pass
    human_judgment: false
  - id: D5
    description: "1280·1024·375 독립 DOM 감사(폰 페이지 번호 44×44 · 가로 스크롤 0 · 힌트 줄 자리 · 쪽 전환 activeElement)"
    verification: []
    human_judgment: true
    rationale: "이어가기 실행자는 서브에이전트를 띄울 수 없어 독립 DOM 감사를 돌리지 못했다 — 오케스트레이터가 별도 에이전트로 CI=true 감사 후 이 SUMMARY에 붙인다"
duration: 43min
completed: 2026-09-26
---

# Phase 4 Plan 19: 견적 표 30줄 쪽 · 쪽 경계 키보드 · 전체 선택 복사 · 힌트 줄 Summary

**`Table`이 견적 줄을 표시 순서 30줄 쪽으로 나누고(합계·저장은 전체 줄), 포커스를 `{ rowId, colKey }`로 기억해 ↑↓·Tab·Alt+↑↓·Delete가 쪽을 넘어도 그 줄에 작용하며, Ctrl+A → Ctrl+C가 네이티브 copy 이벤트로 04-24 직렬화 TSV + 앱 형식 JSON을 싣고, 힌트 줄이 페이지 줄 아래 일곱 항목으로 돌아왔다**

## Performance

- **Duration:** 43 min(컨테이너 재시작 공백 포함)
- **Started:** 2026-09-26T10:21:47Z
- **Completed:** 2026-09-26T11:04:10Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- 30줄 쪽 나눔(`splitPages` · 렌더마다 `clampPage`) — 그룹 머리글 반복, 번호 31부터 이어짐, 합계는 어느 쪽이든 전체, 두 쪽 편집이 다 저장됨, 이전 차수 읽기 섹션도 같은 `pagination`(제목 포커스)
- 키보드 훅 포커스·앵커를 줄 id로 — 쪽 끝 ↑↓/Enter는 `crossPageTarget`, Alt+↑↓는 쪽 따라가기, Shift 범위는 쪽 안, 편집 중 Tab/Shift+Tab 쪽 넘김, Ctrl+A 전체 선택(`isCtrlCombo`)
- 네이티브 copy 이벤트 복사 — 글자는 04-24 `quoteLineReadColumns` `copyText`, 앱 형식은 `quoteLineClipboardMeta`(새 직렬화 없음, W1), 격자 복사 실패 문구 0
- 힌트 줄을 `Table` `hint` 자리로(페이지 줄 다음, 1024 미만 숨김) 옮기고 `이동 Tab ↑↓←→ · 복사 Ctrl+C`를 되돌려 일곱 항목

## Task Commits

1. **Task 1: 30줄 쪽 나눔 트레이서** — `dfa6508` (test, RED) → `9d95a95` (feat, GREEN of dfa6508)
2. **Task 2: 쪽 경계 키보드 · Tab · 전체 선택 복사 · 힌트 줄** — `4a90b0d` (test, RED) → `e1e503c` (feat, GREEN of 4a90b0d)
3. **편차 수정:** `cc40569` (fix — 300줄 상한 E2E를 30줄 쪽 기준으로)

**Plan metadata:** 이 SUMMARY 커밋

## Files Created/Modified
- `ui/table/paging.ts` — 쪽 분할·줄의 쪽·쪽 경계 대상·편집 셀 순회·포커스 해석 순수 함수
- `ui/table/use-grid-keyboard.ts` — `{ rowId, colKey }` 포커스, 줄 id 핸들러, onEdgeExit·onTab·onSelectAll
- `ui/table/Table.tsx` · `Table.module.css` · `types.ts` — pagination · 쪽 전환 포커스 · copy 이벤트 · hint 자리
- `app/(app)/projects/[id]/quote-table.tsx` — pagination·copyMeta·copyText(04-24 열) 배선, 힌트 일곱 항목, 옛 힌트 `<p>` 삭제
- `app/(app)/projects/[id]/previous-revision.tsx` — 읽기 섹션 pagination(focusHeadingId)
- `domain/quotes/edit-scope.ts` — `QuoteHintKey`에 `copy`
- 테스트: `table-paging.test.ts`(신규) · `quote-table.spec.ts` · `quote-revisions.spec.ts` · `quote-edit-scope.spec.ts` · `grid-keyboard-composing.test.ts`

## Decisions Made
- **04-04 배선 여부(probe_fallback):** 04-04는 편집 중 Tab 이동과 Ctrl+C 범위 복사를 배선하지 않았다(`toTsv` 호출처 0, 04-28 힌트 주석이 「04-19가 배선」). 둘 다 이 플랜에서 더했다.
- **접힌 선택 copy 이벤트 확인:** 셀에 포커스만 있고 글자 선택이 없는 상태에서 Chromium이 `copy`를 쏜다 — `Control+a` → `Control+c` E2E가 CI=true 프로덕션 빌드에서 초록. `document.execCommand("copy")` 대체는 두지 않았다(ui/table에 0건).
- **copy 처리기 자리:** 격자 요소 `onCopy`가 아니라 `document`의 `copy` 리스너다 — 접힌 선택이면 이벤트 대상이 `<body>`라 표 요소에 오지 않는다. 처리기는 포커스가 표 안이고 입력 요소가 아니며 사용자가 끌어 고른 글자가 없을 때만 싣는다.
- **견적 표 어댑터:** 격자 편집 행(`DraftLine`)이 04-24의 `QuoteLineCopyRow` 모양을 그대로 만족해(typecheck 통과) 별도 `toCopyRow` 함수 없이 `quoteLineReadColumns<DraftLine>`을 직접 쓴다. `quote-table.tsx`의 `JSON.stringify` 1건은 04-04 금액 편집기 커밋 페이로드(기존, abbe610에도 있음)로 클립보드 직렬화가 아니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 04-24 31줄 E2E 단언이 쪽 나눔 전제와 어긋남**
- **Found during:** Task 1 GREEN
- **Issue:** `quote-revisions.spec.ts` 04-24 31줄 케이스가 번호 1~31이 한 화면에 보인다고 단언
- **Fix:** 1쪽 1~30, 2쪽 31로 옮김(단언 수 유지)
- **Files modified:** test/e2e/quote-revisions.spec.ts
- **Verification:** CI=true E2E 56/56
- **Committed in:** 9d95a95

**2. [Rule 1 - Bug] 04-26 300줄 상한 E2E(cap1~3)가 300줄 전부 렌더를 가정**
- **Found during:** Task 2 GREEN 뒤 Table 사용 스펙 CI=true 회귀 확인
- **Issue:** Task 1의 30줄 쪽 나눔 뒤 `capRows` 행 수 30 ≠ 300(9d95a95의 CI 실행은 이 스펙을 포함하지 않았다)
- **Fix:** 보이는 행 30 + 전체 줄 수는 합계 행 `합계 (공급가액 · N줄)`로 단언, cap3은 10쪽으로 가서 299번째 줄에 붙여 넣음 — 「줄이 생기지 않는다」 단언 강도 유지
- **Files modified:** test/e2e/quote-edit-scope.spec.ts
- **Verification:** CI=true quote-edit-scope 38/38
- **Committed in:** cc40569

**3. [Rule 3 - Blocking] 훅 파라미터 이름 변경에 따른 단위 테스트 적응**
- **Found during:** Task 2 GREEN
- **Issue:** `grid-keyboard-composing.test.ts`가 `rowCount/colCount`로 훅을 부름
- **Fix:** `rowIds: ["row-1"] / colKeys: ["col-1"]`로 — 단언 무변경
- **Committed in:** e1e503c

### 실행 중단·이어가기
- 첫 실행자가 Task 2 GREEN 도중 컨테이너 재시작으로 멈췄다(커밋 안 된 9파일 보존). 이어가기 실행자가 `git diff`를 읽고 이어받아 단위·lint·typecheck·CI=true E2E로 확인한 뒤 커밋했다. RED 증거는 첫 실행자의 10:44 `RED_EVIDENCE_OK` 기록을 따랐고, RED 테스트 파일(`table-paging.test.ts`·`quote-table.spec.ts`)은 4a90b0d 이후 바뀌지 않았다.

---

**Total deviations:** 3 auto-fixed (2 Rule 1 앞 플랜 테스트 전제, 1 Rule 3 시그니처 적응)
**Impact on plan:** 모두 쪽 나눔·훅 시그니처의 직접 결과. 범위 확장 없음.

## Issues Encountered
- 독립 DOM 감사(1280·1024·375)와 전체 게이트 `CI=true pnpm test`는 이 실행에서 돌리지 않았다 — 이어가기 실행자는 서브에이전트를 띄울 수 없고, 전체 게이트는 오케스트레이터가 한 번 돌린다(디스패치 지시). 감사 보고서는 오케스트레이터가 이 SUMMARY에 붙인다.

## Verification (this run)
- 단위 전체 `pnpm vitest run --project unit` 98 파일 1346/1346 · 플랜 verify 1(table-paging + shortcut-notation + composing) 32/32
- `pnpm lint` 0 error(기존 boundaries 경고만) · `pnpm typecheck` 0
- CI=true(프로덕션 빌드 포함) E2E: quote-table + ledger-save-flow 32/32 · quote-edit-scope 38/38 · quote-revisions·revenue-section·project-lifecycle·projects-list·permissions-grid(cap 3건 외) 98 통과 · archive·project-period·project-register 32/32 — 04-28 충돌 셀 키보드·저장 중 잠금 케이스 포함 초록
- 수용 grep: Tab·Ctrl+A 분기, `isCtrlCombo(event, "a")`, `onMoveRow/onDeleteRow(rowId: string)`, `navigator.clipboard` 0, `복사하지 못함` ui/table 0, 04-24 import, 매출 표 hint 0
- 공급망: `package.json`·`pnpm-lock.yaml`이 abbe610(페이즈 재개 기준 — d6b41cf는 이 저장소에서 해석되지 않음)과 diff 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 04-47(붙여넣기 쪽 넘김 · 새 줄 고정 배선 · DR-5 · DR-16)이 `pagination`·`paging.ts`·`{ rowId, colKey }` 위에 얹을 수 있다
- 남은 것: 독립 DOM 감사 · 전체 게이트(오케스트레이터)

## Self-Check: PASSED
(오케스트레이터 몫 2건 — 독립 DOM 감사 · `CI=true pnpm test` — 은 위 Issues에 남김)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-26*
