---
phase: 04-project-quote-ledger
plan: 23
subsystem: quotes-ui
status: complete
tags: [quote-lines, line-kind, adjustment, out-of-quote, quote-table, confirm-dialog, paste, e2e]

requires:
  - phase: 04-13
    provides: "QuoteLineDto.lineKind · QuoteLineListCtx.canAdjust · QuoteLineWriteRow.lineKind(새 줄) · 조정/견적 외 비용 셀 단계·구조 판정 · 조정 줄 자리 변경 서버 거부"
  - phase: 04-25
    provides: "Select 옵션 description(편집 중 한 줄 · 오류가 이긴다) · references.subcategories[].description"
  - phase: 04-30
    provides: "newDraftLine(화면 uuid · isNew) · tableLockLine · quoteTableEmptyState · visibleHintKeys · useEditableWidth 게이트"
  - phase: 04-46
    provides: "ui/confirm-dialog(계약 2) · Button disabledReason(계약 1)"
  - phase: 04-26
    provides: "lineCap(상한 설정 값)"
provides:
  - "QuoteLedger 줄 순서 불변식: 견적 줄 → 견적 외 비용 → 조정(맨 아래 고정 그룹) — setLines 래퍼가 모든 경로에서 지킨다"
  - "그룹 줄 추가 처리 지점 하나 addLineToGroup(lineKind) — 04-47 revealRowId 자리"
  - "Table openCell prop(방금 만든 줄의 한 칸을 편집 상태로 연다)"
  - "quoteTableEmptyState canAdjust(우선순위 ② 「조정 줄 추가」, action kind addAdjustment)"
  - "상세 페이지: projects.adjustment 쓰기 → adjustmentStructural · adjustmentLineCells · outOfQuoteLineCells · listQuoteLines canAdjust · 참조 목록 canWrite || canAdjust"
affects: [04-47, 04-19, 04-14, 04-24, 04-07]

actuals:
  tokens: 17233
  tasks: 3
  commits: 6
plan_head_before: f27fa256836bf99b93dfe63255ddc8304cca2343
commits: 6

tech-stack:
  added: []
  patterns:
    - "화면 줄 상태는 늘 종류 순서로 정렬된 채 둔다(안정 정렬) — 표시 순서 = 상태 순서 = 저장 order 페이로드 순서라 새 견적 줄이 조정 줄 앞에 insertOnly order로 저장된다"
    - "권한 밖 줄(조정 권한 없는 사람의 조정 줄)은 동작으로만 잠긴다 — 이유 글자 없음 · Delete 무반응 · 붙여넣기 건너뜀 + muted 요약"
    - "Table의 외부 편집 요청은 렌더 중 상태 조정(요청 객체가 바뀐 렌더에서 한 번) — 효과 안 setState 금지 규칙 준수"

key-files:
  created:
    - test/e2e/quote-line-kinds.spec.ts
  modified:
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - domain/quotes/edit-scope.ts
    - test/unit/domain/quote-edit-scope.test.ts
    - ui/table/Table.tsx
    - test/e2e/quote-edit-scope.spec.ts

key-decisions:
  - "화면의 줄 상태를 종류 순서(견적 → 견적 외 비용 → 조정)로 늘 정렬해 둔다 — 새 견적 줄이 조정 줄 앞 자리로 insertOnly order와 함께 저장되어 04-13의 「order 없이 조정 줄 뒤에 붙은 새 줄」 한계가 화면 경로에서 생기지 않는다"
  - "상한에 닿으면 이유 글자는 첫 추가 버튼 옆 한 번만 — 뒤따르는 추가 버튼(견적 외 비용 줄 추가 · 줄 추가 권한이 함께 있을 때의 조정 줄 추가)은 그리지 않는다(같은 이유 두 번 방지)"
  - "조정 줄 삭제 확인 부제의 금액은 실행가(Copywriting `{항목} · {실행가}`), 견적 줄은 그대로 견적가"
  - "경영관리 E2E는 시드 계급을 바꾸지 않고 새 계급(workScope company)을 만들어 권한을 준다 — 같은 DB를 쓰는 다른 스펙에 번지지 않게"

patterns-established:
  - "그룹 버튼 → addLineToGroup(lineKind) → setOpenCell({ rowId, columnKey }) — 새 줄 id를 돌려받아 첫 편집 칸을 연다"

requirements-completed: [PROJ-02]

coverage:
  - id: D1
    description: "조정 권한만 있는 경영관리가 완료 프로젝트에서 「조정 줄 추가」로 거래처(B-23)를 고른 조정 줄을 저장 → 맨 아래 조정 그룹 · 합계 행 차익 −120,000 · 목록 실행가 +120,000"
    requirement: "PROJ-02"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-line-kinds.spec.ts#트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "PM 시점 권한 밖 줄 — 조정 행 렌더(숨김 없음) · Enter·클릭·Delete·Alt+↑↓ 무반응 · 이유 글자·오류 셀 없음 · 일괄 저장 N 불변 · 정산 붙여넣기의 조정 칸 건너뜀 + `조정 줄 2칸 건너뜀` · 정산 잠긴 칸은 오류 셀 + `정산 · 실행가와 새 줄만`(DR-35)"
    requirement: "PROJ-02"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-line-kinds.spec.ts#PM — 완료 · PM — 진행(권한 밖 줄) · PM — 정산 붙여넣기"
        status: pass
    human_judgment: false
  - id: D3
    description: "경영관리 조정 줄 삭제 = ui/confirm-dialog(제목 · 부제 · 결과 줄 · 1차 포커스 · Esc 뒤 트리거 셀 포커스) → 저장 → 보관함 「견적 줄」 · 상한 300 aria-disabled + aria-describedby · 0줄 EMPTY 1000 사실만/1280 「조정 줄 추가」 · 미저장 새 조정 줄 복원"
    requirement: "PROJ-02"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-line-kinds.spec.ts#경영관리 4건"
        status: pass
    human_judgment: false
  - id: D4
    description: "EMPTY 우선순위 ② 조정 결정표(완료·정산 조정 권한만 → 조정 줄 추가, 줄 추가 권한 있으면 첫 줄 만들기) · 표 위 한 줄 · 힌트 줄 확인"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "test/unit/domain/quote-edit-scope.test.ts#조정 권한 축 — 표 위 한 줄 · EMPTY · 힌트 줄(04-23)"
        status: pass
    human_judgment: false
  - id: D5
    description: "견적 외 비용 줄 — 진행 −50,000 · 정산 −30,000(수량·단가 「—」 · 견적가 0) 저장, 복제도 같은 종류, 완료에 버튼 없음 · 소분류 편집 중에만 코드표 설명 한 줄(D-93)"
    requirement: "PROJ-02"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-line-kinds.spec.ts#PM — 진행 견적 외 비용 · 정산 · 완료 · 소분류 설명"
        status: pass
    human_judgment: false
  - id: D6
    description: "backstop — 조정·견적 외 비용 그룹이 붙은 표의 1280 · 1024 · 375 가로 스크롤 0 · 폰 P1 세 열 · 1000 · 375에서 두 추가 버튼·EMPTY 「조정 줄 추가」 부재 · 조정 행 Enter·클릭 무편집"
    verification: []
    human_judgment: true
    rationale: "독립 DOM 감사(CI=true, 별도 에이전트)는 오케스트레이터가 이 플랜 뒤에 돌리고 판정을 뒤 커밋으로 적는다"

duration: 34min
completed: 2026-09-25
---

# Phase 4 Plan 23: 조정 · 견적 외 비용 줄의 화면 Summary

**경영관리는 `projects.adjustment` 쓰기만으로 어느 상태에서든 표 맨 아래 고정 그룹 `조정`에 줄을 넣고(`ui/confirm-dialog`로) 지우며, PM은 같은 표에서 그 줄을 보되 글자 없이 동작으로만 막히고(붙여넣기는 `조정 줄 N칸 건너뜀`), 견적 외 비용 줄은 「견적 외 비용 줄 추가」로 견적가 0 · 음수 실행가 줄이 되며, 소분류를 고르는 동안 코드표 설명이 한 줄로 보인다.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-09-25T17:56:54Z
- **Completed:** 2026-09-25T18:30:52Z
- **Tasks:** 3 (Task 1 tracer · Task 2 tdd · Task 3 tdd — ④ DOM 감사·전체 게이트는 오케스트레이터)
- **Files modified:** 8 (새로 만든 것 1)

## Accomplishments

- **상세 페이지**: `can(viewer, "projects.adjustment", "write")`를 서버가 계산해 조정 구조(`structuralEditability` 조정 종류) · 새 조정/견적 외 비용 줄 셀 단계(`lineCellEditability`)를 넘긴다. `listQuoteLines`에 `canAdjust`, 참조 목록은 `canWrite || canAdjust`(B-23), 1차 「일괄 저장」 렌더 조건에 조정 추가 가능을 더했다(완료에서 경영관리가 저장할 수 있다). 조정 권한도 금액 노출(`quote.amount`)이 있어야 편집 — 쓰기와 같은 규칙
- **줄 순서 불변식**: `setLines` 래퍼가 모든 경로(불러오기 · 저장 결과 · 추가 · 붙여넣기 · 복원)에서 견적 줄 → 견적 외 비용 → 조정으로 안정 정렬. 그룹 머리글은 `lineKind`를 먼저 본다
- **`addLineToGroup(lineKind)`** 한 처리 지점 — `newDraftLine`(화면 uuid · `isNew`)을 거쳐 종류만 덧씌우고 소분류는 빈 값. 「조정 줄 추가」는 실행가 칸, 「견적 외 비용 줄 추가」는 항목 칸을 연다(`Table.openCell`). 두 버튼과 EMPTY 「조정 줄 추가」는 `useEditableWidth()` 게이트(1024 이상)
- **행 모양**: 조정 = 소분류 `조정` · 수량·단가·상태 `—` · 견적가 0. 견적 외 비용 = 소분류 `견적 외 비용` · 수량·단가 `—`. 새 색·아이콘 없음
- **권한 밖 줄(DR-22 · B-31 · DR-35)**: 조정 행은 이유 글자를 만들지 않는다(`blockedReasonFor`), Delete는 조정 권한으로만 확인을 연다, 붙여넣기는 `handlePasteAtCell`에서 결과를 걸러 건너뛴 칸을 세고 합계 행에 muted `조정 줄 N칸 건너뜀`. 다른 잠긴 칸의 이유·오류 셀은 그대로. `ui/table`의 붙여넣기는 고치지 않았다
- **고정 그룹**: Alt+↑↓가 종류 경계를 넘지 않고 조정 줄은 움직이지 않는다 · 조정 줄 복제 없음 · Ctrl+Enter는 견적 줄의 소분류만 물려받는다
- **조정 줄 삭제**: 04-46 `ConfirmDialog` — 제목 `조정 줄 삭제` · 부제 `{항목} · {실행가}` · 결과 `보관함으로 옮겨짐 · 복원은 관리자` · 1차 `조정 줄 삭제` · 2차 `취소 Esc`, 1차가 기존 `archivedLineIds` 경로
- **EMPTY**: `quoteTableEmptyState`에 `canAdjust` — ① 첫 줄 만들기 → ② 조정 줄 추가 → ③ 기간 바꾸기 순서(새 판정 함수 없음)
- **미저장 보관본**: 새 줄에 종류를 실어 복원해도 조정/견적 외 비용 줄로 돌아온다(옛 보관본은 견적 줄)
- **소분류 설명 힌트(D-93)**: 편집기 옵션에 04-25 `description`을 싣는다 — `Select`가 편집 중에만 한 줄, 그 칸에 오류가 있으면 설명을 싣지 않는다(오류가 이긴다)

## Task Commits

1. **Task 1 RED** — `3b9f5ba` test(04-23): add failing tracer e2e for adjustment lines on completed projects
2. **Task 1 GREEN** — `5566600` feat(04-23): let finance add adjustment lines in a fixed bottom group
3. **Task 2 RED** — `4ab5752` test(04-23): add failing tests for adjustment rows outside the viewer's rights
4. **Task 2 GREEN** — `68b706b` feat(04-23): lock adjustment rows by behaviour for viewers without adjustment rights
5. **Task 3 RED** — `7dcd737` test(04-23): add failing e2e for out-of-quote lines and subcategory hints
6. **Task 3 GREEN** — `3f7127c` feat(04-23): add out-of-quote lines and subcategory description hints

### RED 확인(실패 줄 — `check tdd-red-evidence` 전부 RED_EVIDENCE_OK, Playwright·vitest 결과를 TAP 모양으로 옮겨 적어 검사)

- Task 1: 트레이서 `locator.click: Test timeout` — 「조정 줄 추가」 버튼 없음(준비·합계 단언은 통과)
- Task 2 단위 3건: `expected { message } to deeply equal { message, action: addAdjustment }`(완료 · 정산 조정 권한만 · 정산 팀장+조정). 나머지(표 위 한 줄 · 힌트 줄 · 줄 추가 권한 우선)는 처음부터 초록 — 플랜이 「04-30이 이미 그렇게 두었으면 확인만」이라 한 항목
- Task 2 E2E 5건: 권한 밖 줄 `일괄 저장 1` 등장(Alt+↓가 조정 줄과 자리를 바꿈) · 붙여넣기 조정 칸 `aria-invalid="true"` · `dialog "조정 줄 삭제"` 없음 · EMPTY 「조정 줄 추가」 없음 · 복원 뒤 그룹 `무대·시공`(견적 줄로 복원). 상한 aria-disabled와 PM 완료 화면은 Task 1 구현으로 이미 초록
- Task 3 E2E 3건: 「견적 외 비용 줄 추가」 없음 ×2 · 소분류 설명 줄 없음. 완료 부재 케이스는 처음부터 초록(부재 단언)

## 검증(실행 결과)

- Task 1: lint 0 · typecheck 0 · build 0 · Playwright quote-line-kinds + quote-table 17/17 · 트레이서 게이트 재실행 초록(end-of-phase · 자동 검증만)
- Task 2: 단위 quote-edit-scope 53/53 · lint 0 · typecheck 0 · build 0 · Playwright quote-line-kinds + quote-edit-scope + quote-table 59/59
- Task 3: lint 0 · typecheck 0 · build 0 · Playwright quote-line-kinds + quote-edit-scope + quote-table 63/63 · 단위 53/53
- 의존성: `package.json` · `pnpm-lock.yaml` diff 0줄(플랜 기준 커밋 d6b41cf는 이 저장소에서 찾을 수 없어 이 플랜 시작 커밋 f27fa25와 비교)
- `CI=true pnpm test` 전체 게이트는 검토 반영 뒤 한 번 돌렸다(아래 「화면 검증」)

## 화면 검증

- 싼 게이트(lint · typecheck · build)와 각 태스크 `<verify>`의 표적 Playwright 스펙은 위와 같이 통과
- **독립 DOM 감사(별도 에이전트, `CI=true` 프로덕션 빌드, HEAD e0ffe3c): 8/8 PASS** — 보고서 `/mnt/project-files/phase4-prep/04-23-dom-audit.md`. 1280 · 1024 · 375 문서·표 래퍼 가로 스크롤 0, 폰 P1 세 열(항목 · 실행가 · 상태, 조정 행 같음), 1000 · 375에서 「조정 줄 추가」·「견적 외 비용 줄 추가」·EMPTY 「조정 줄 추가」 DOM 부재(PM · 경영관리), 조정 행 Enter·클릭 무편집, 추가 버튼 줄 flex + gap `--s-3`, `조정 줄 N칸 건너뜀` 색 `--muted`, 소분류 설명은 편집 중에만(읽기 행 높이 불변)
- 수화 깜빡임: 1000 · 375에서 단발 count가 버튼을 잡은 것은 서버가 편집 폭 마크업으로 먼저 그리고 수화가 읽기 표로 바꾸는 사이의 깜빡임이다 — 04-26 감사 기록과 같은 항목(04-49 소관)이라 새 이슈가 아니고, 수화 뒤 폴링 단언으로 PASS
- **전체 게이트 `CI=true pnpm test`(검토 반영 뒤, 1e4e5c3): 통과** — 단위 93파일 1207/1207 · 통합 49파일 1263/1263 · E2E(프로덕션 빌드) 301/301. 그 전에 `pnpm lint && pnpm typecheck && pnpm lint:sql` 0

## 검토 반영

Codex 대체 Opus 교차 검토 — 한도 풀리면 Codex 재확인 필요 (`/mnt/project-files/phase4-prep/04-23-review-opus.md`, BLOCKING 0 · SHOULD-FIX 3 · NIT 6)

- **S-1 → 고침(55d34ce).** 확인: DB `[견적, 조정, 견적]`에서 화면 순서(`byKind`)를 보내면 조정 줄의 절대 위치가 바뀐 것으로 판정돼 누구에게나 거부됐다(통합 k14 RED로 재현). 검토안(조정 줄끼리의 상대 순서만 비교)을 그대로 쓰면 조정 줄 하나를 견적 줄 위로 올리는 순서가 통과해 04-13 k12가 깨지므로, "조정 줄끼리의 순서가 그대로이고, 절대 위치가 바뀌었다면 조정 줄이 전부 맨 아래에 모여 있어야 통과"로 좁혔다. k12(조정 줄을 맨 위로) 거부 유지, k14는 조정 줄을 견적 줄 사이로 올리는 순서·조정 줄끼리 뒤집는 순서 거부 + 막혔던 견적 줄 이동 통과를 고정
- **S-2 → 고침(ae350e1).** `cellLevel`에서 견적 외 비용 소분류를 `locked`로(서버·화면 같은 셀 단계). 단위 결정표 RED → GREEN. 잠긴 칸 Enter는 상태별 `lockReason`이라 새 문구 없음
- **S-3 → 고침(fcc771b).** 두 권한 보유자에게 상한에서 「줄 추가」·「조정 줄 추가」가 둘 다 `aria-disabled`, 이유 글자는 「조정 줄 추가」 옆 한 번, 두 버튼이 `aria-describedby`로 같은 글자를 가리킨다. `Button`에 선택 prop `reasonId`를 더하고 외부 이유를 가리키는 비활성 버튼은 개발 경고를 내지 않게 했다(단위 2건 RED → GREEN). E2E 두 권한 보유자 상한 1건 RED(「조정 줄 추가」 없음) → GREEN. 「견적 외 비용 줄 추가」는 상한에서 지금처럼 숨김(truth · UI-SPEC 513행 ①이 요구하는 비활성 버튼은 「줄 추가」·「조정 줄 추가」 둘). 04-26 cap E2E(PM) 3/3 그대로
- **NIT-5 → 고침(1e4e5c3).** 트레이서 주석을 "차익 150,000 → 30,000"으로
- **NIT-1 → 그대로 둠.** 지금은 쪽 나눔 · 접힌 그룹이 없어 `openCell`의 1회성이 문제되지 않는다. 04-47 Task 1 ④(`revealRowId`)가 이 prop을 쓸 때 "행이 보일 때까지 보류"로 바꿀 일(04-47 소관)
- **NIT-2 → 그대로 둠.** 조정 권한자의 잠긴 칸 붙여넣기는 오류 셀이 맞고, 문구 통일은 04-47 붙여넣기 요약 정리 때 확인(동작 결함 아님)
- **NIT-3 → 그대로 둠.** 드문 경로이고 값이 사라지지 않는다. 넘친 새 견적 줄이 견적 그룹에 서는 것은 그룹 규칙대로다
- **NIT-4 → 그대로 둠.** 확인만 요청된 항목이다. 조정 줄에 연결 문서가 붙는 경로는 이 플랜 범위에 없어 무해하고, 붙는 경로가 생기면 그 플랜이 조정 줄을 보관 경로로 보낸다
- **NIT-6 → 그대로 둠.** 검토도 수용(결과 같음, 방어용 분기)

## Files Created/Modified

- `test/e2e/quote-line-kinds.spec.ts` — 신규(12케이스)
- `app/(app)/projects/[id]/page.tsx` — 조정 권한 · 조정 구조 · 두 종류 새 줄 셀 단계 · 참조 로드 조건 · canSave · EMPTY canAdjust
- `app/(app)/projects/[id]/quote-table.tsx` — lineKind · 종류 정렬 · addLineToGroup · 버튼 셋 · 행 모양 · 권한 밖 줄 · 삭제 확인 · 붙여넣기 건너뜀 · 복원 종류 · 설명 힌트
- `app/(app)/projects/[id]/project-detail.module.css` — `.addLineButton` flex 간격 · `.pasteSkipped`(`--muted`)
- `domain/quotes/edit-scope.ts` — `quoteTableEmptyState` `canAdjust` · `addAdjustment`
- `ui/table/Table.tsx` — `openCell` prop
- `test/unit/domain/quote-edit-scope.test.ts` — 조정 권한 축 결정표 8건
- `test/e2e/quote-edit-scope.spec.ts` — 「줄 추가」 찾기를 이름 정확 일치로(4곳)

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ui/table/Table.tsx`에 `openCell` prop을 더했다**
- **Found during:** Task 1
- **Issue:** 플랜은 새 줄의 실행가(항목) 칸을 「편집 상태로 연다」고 하지만 Table의 편집 칸 상태는 내부에만 있어 호출부가 열 수 없었다
- **Fix:** 요청 객체가 바뀐 렌더에서 한 번, 그 칸이 `edit`이고 저장 잠금이 아닐 때만 여는 prop. 처음 효과 안 setState로 썼다가 `react-hooks/set-state-in-effect` lint 오류 → 렌더 중 상태 조정으로 고침
- **Files modified:** ui/table/Table.tsx · **Commit:** 5566600

**2. [Rule 1 - Bug] 조정 그룹 고정 · 종류 경계 동작**
- **Found during:** Task 2
- **Issue:** Alt+↑↓가 견적 줄을 조정 줄과 바꿔 dirty를 만들고(서버는 조정 줄 자리 변경을 거부), Ctrl+D가 조정 줄을 소분류 `adjustment`인 견적 줄로 복제하고, Ctrl+Enter가 조정/견적 외 비용 행의 소분류(종류 값)를 새 견적 줄에 물려주었다
- **Fix:** `moveLine`은 조정 줄이거나 이웃 종류가 다르면 무동작, `duplicateLine`은 조정 줄 무동작(견적 외 비용은 같은 종류로 복제 — Task 3), `addLine`은 견적 줄 소분류만 상속
- **Verification:** E2E 「PM — 진행 … Alt+↑↓」 · 「견적 외 비용 … 복제해도 같은 그룹」 · **Commit:** 68b706b, 3f7127c

**3. [Rule 2 - Missing critical] 미저장 보관본의 새 줄 종류**
- **Found during:** Task 2
- **Issue:** 새로 고친 뒤 「복원」하면 새 조정 줄이 소분류 빈 견적 줄로 되살아났다(저장하면 오류 또는 잘못된 종류)
- **Fix:** 보관본 새 줄에 `lineKind`를 싣고 복원이 종류별 셀 단계로 되살린다 · **Verification:** E2E 「복원」 · **Commit:** 68b706b

**4. [Rule 1 - Bug] 상한에서 같은 이유가 버튼마다 반복**
- **Found during:** Task 3(04-26 cap1 E2E strict 모드 위반 — `300줄 상한 …` 두 개)
- **Fix:** 상한이면 첫 추가 버튼만 비활성 + 이유, 뒤따르는 추가 버튼은 그리지 않는다. 조정 권한만 있는 경영관리에게는 「조정 줄 추가」가 그대로 aria-disabled + 이유(truth 그대로). **코디네이터 확인 필요:** `projects` 쓰기와 조정 권한을 함께 가진 사람은 상한에서 「조정 줄 추가」가 비활성이 아니라 사라진다 — UI-SPEC 513행 「「줄 추가」·「조정 줄 추가」 비활성 + 이유」를 이유 한 줄로 읽은 해석
- **Commit:** 3f7127c

**5. [테스트 수정] 기존 스펙의 「줄 추가」 찾기를 정확 일치로**
- `quote-edit-scope.spec.ts` 4곳의 `getByRole("button", { name: "줄 추가" })`가 새 「견적 외 비용 줄 추가」와 겹쳐 strict 모드 위반 — `exact: true`만 더했다(단언 불변) · **Commit:** 3f7127c

### 계획과 저장소의 차이

- **합계 행에 실행가 합계가 없다:** 트레이서의 「합계 행 실행가가 120,000만큼 늘었다」 — 상세 합계 행은 견적 · 차익 합계만 있다(차익은 1024~1279에서만 보인다). E2E는 1100 폭에서 합계 행 `차익`이 150,000 → 30,000(실행가 +120,000)인 것과 목록 합계 줄 `실행가 270,000`을 단언했다
- **경영관리 계정:** 플랜은 `role-ceo`에 권한을 켜라 했지만 시드 계급을 바꾸면 같은 `erp_test`를 쓰는 다른 스펙(대표 화면)에 번진다 — 04-13 통합 테스트처럼 새 계급(`workScope: company`)을 만들었다
- **보관함 확인:** 경영관리는 `/admin/archive` 권한이 없어 E2E가 `listArchive(SYSTEM_VIEWER)`로 그 줄이 `견적 줄` 항목인지 확인했다
- **`tableLockLine` · `visibleHintKeys`는 코드 변경 없음:** 표 위 한 줄은 `hasEditableCells`가 이미 조정 권한을 반영하고(조정 행이 편집 셀), 조정 구조는 새 줄·이동·복제를 켜지 않아 힌트 거르기가 이미 맞다 — 결정표로 확인만(플랜이 허용한 「확인만」). 인자를 더하면 쓰이지 않는 입력이 된다
- **d6b41cf:** 의존성 비교 기준 커밋이 저장소에 없다 — f27fa25(이 플랜 시작)와 비교했다

---

**Total deviations:** 5 auto-fixed(1 blocking, 2 bug, 1 missing critical, 1 test locator) + 계획-저장소 차이 5
**Impact on plan:** 범위 확장 없음. `ui/table/Table.tsx`(openCell)와 `quote-edit-scope.spec.ts`가 플랜 파일 목록 밖이다.

## Issues Encountered

- 셸 마지막 `ls .husky`(없는 디렉터리)의 종료 코드 2 — 코드 문제 아님(typecheck · eslint 0)
- 권한 밖 줄 E2E의 첫 RED가 넓은 `getByRole("textbox")`로 매출 섹션 「계약 금액」 칸을 잡음 → 견적 줄 격자로 범위를 좁혀 다시 RED 확인

## Deferred Items / 후속

- **04-13 한계(화면 쪽 해소 · 남는 경우):** 화면 경로는 새 견적 줄을 조정 줄 앞 자리로 insertOnly `order`와 함께 보내 서버 순서가 조정 줄 맨 아래로 유지된다. 다만 이 플랜 이전 저장·직접 넣은 데이터처럼 서버 순서에서 조정 줄이 가운데 있으면, 화면(정렬됨)이 보내는 다음 `order`는 거부될 수 있다(배포 전 묶음이라 운영 데이터 없음)
- **04-49 이월(그대로):** 폭이 1024 아래로 줄 때 매출 표에서 열린 입력 유실 가능 — 이 플랜 범위 밖
- **04-47:** 합계 행 요약 한 줄 결합(danger → warning → muted — `조정 줄 N칸 건너뜀`은 지금 별도 muted span) · `addLineToGroup`에서 `revealRowId`
- **04-13 이월 N7(게이트 단독 견적 외 비용 수량·단가):** 화면은 두 칸을 늘 잠김(`—`)으로 그리고 저장 페이로드는 서버가 정규화 — 게이트 변경은 하지 않았다

## Known Stubs

없음.

## Threat Flags

없음 — 새 입구 없음. T-04-63(편집 가능성은 서버 조정 구조·셀 단계에서만) · T-04-66(PM 화면 조정 행 렌더 E2E) · T-04-66c(건너뛴 칸은 페이로드에 실리지 않고 요약으로 셈) 반영.

## User Setup Required

None.

## Next Phase Readiness

- 묶음 ②의 마지막 플랜 — 오케스트레이터의 독립 DOM 감사 · `CI=true pnpm test` 뒤 Post-build(/review → /qa + /design-review → /cso → /ship)
- 04-47은 `addLineToGroup` 한 곳에 `revealRowId`를, 04-14·04-24는 `lineKind` 그룹을 쓴다

## Self-Check: PASSED

- FOUND: test/e2e/quote-line-kinds.spec.ts
- FOUND: 3b9f5ba · 5566600 · 4ab5752 · 68b706b · 7dcd737 · 3f7127c

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
