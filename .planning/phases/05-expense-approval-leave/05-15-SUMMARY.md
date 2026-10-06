---
phase: 05-expense-approval-leave
plan: 15
subsystem: quotes-ui
tags: [quote-table, d-66, line-status, row-action, ctrl-e, hint-line, lineage]

requires:
  - phase: 05-05
    provides: listLineDoors (door.state · tableGateReason) · 행 행동 열 · requestLineExpense 전신 · 폰 행 시트 action 자리
  - phase: 04
    provides: resolveLinkedDocumentsByLineage · hasLinkedDocuments 막힘 · quote-table 격자 · status-map StatusWord
provides:
  - linkedDocumentsByLine (D-66 — 번호 있는 지출결의만 금액 셀 잠금, 계보 따라옴) + 줄 파생 상태 linkedStatus
  - lineStatusWord (취소 > 반려 > 지출결의 중 > 미착수) · 상태 열 · 폰 시트 값을 StatusTag text로
  - 행 행동 셀 나머지 갈래(거래처 없음 + 거래처 고르기 · 게이트 중 이유 한 줄 · 미저장 합계 행 한 줄) · Ctrl+E · 힌트 줄 확장
affects: [05-08, 05-13, 06-S14]

actuals:
  tokens: 52000
  tasks: 2
  commits: 8
plan_head_before: 8df5e714e0616e16be95c8ecfeed1f71ebaadbb7
visual_baseline_expected: [project-detail]

tech-stack:
  added: []
  patterns:
    - "domain/quotes는 domain/expenses를 import하지 않는다 — repositories/expenses.listNumberedByProject 쿼리 결과로만 읽는다(import-cycles 가드)"
    - "격자 셀 3차는 tabIndex -1(로빙 밖) + aria-describedby = 그 줄 항목 칸 id, 키보드 경로는 Ctrl+E(useGridKeyboard.onOpenRow)"

key-files:
  created: [test/integration/linked-documents-by-line.test.ts, test/unit/app/line-status-word.test.ts, test/unit/ui/grid-keyboard-open-row.test.ts, docs/design/checks/2026-10-04-05-15-quote-line-status.md, docs/design/checks/2026-10-04-05-15-quote-line-doors.md]
  modified: [repositories/expenses.ts, domain/quotes/lines.ts, "app/(app)/projects/status-display.ts", "app/(app)/projects/[id]/quote-table.tsx", "app/(app)/projects/[id]/project-detail.module.css", ui/row-actions/RowActions.tsx, ui/table/Table.tsx, ui/table/use-grid-keyboard.ts, test/e2e/expense-submit-mobile-approval.spec.ts, test/e2e/quote-table.spec.ts, test/unit/app/restore-edits.test.ts]

key-decisions:
  - "D-66 연결은 번호 있는(제출된 적 있는) 지출결의만 — 작성 중 문서는 연결이 아니다. 회수 문서는 번호가 있어 연결은 남지만 파생 상태는 없음"
  - "줄 상태는 서버가 계산한 linkedStatus(rejected | active)를 lineStatusWord 한 곳에서 낱말로 바꾼다 — 색은 status-map.ts만"
  - "domain/expenses/index.ts:514-518 줄 남은 실행 확인은 그대로(사용자 결정 2026-10-04, 고정 상한 없음)"

requirements-completed: [EXP-01, UX-06]

coverage:
  - id: D1
    description: "D-66 — 번호 있는 지출결의가 붙은 줄의 금액 셀 읽기 전용 + 이유 문구, 작성 중 문서는 연결 아님, 2차에서 같은 계보 줄에 따라옴, 고객 승인 끄기 막힘이 실데이터로 동작"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/linked-documents-by-line.test.ts (6)"
        status: pass
      - kind: e2e
        ref: "test/e2e/expense-submit-mobile-approval.spec.ts › D-66 잠금"
        status: pass
    human_judgment: false
  - id: D2
    description: "상태 열 · 폰 시트 값 파생(지출결의 중 · 반려), 한 값 규칙, 작성 중 · 회수는 줄 상태를 바꾸지 않음"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "test/unit/app/line-status-word.test.ts (3)"
        status: pass
      - kind: integration
        ref: "test/integration/linked-documents-by-line.test.ts › 줄 파생 상태 linkedStatus (3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "행 행동 셀 갈래(올리기 · 열기 · 거래처 없음/고르기 · 빈 셀 · 게이트 이유 한 줄), 누르는 동안 aria-disabled, 미저장 편집 한 줄, Ctrl+E, 힌트 줄"
    requirement: UX-06
    verification:
      - kind: e2e
        ref: "test/e2e/expense-submit-mobile-approval.spec.ts › 행 행동 갈래 (7) · 12/12"
        status: pass
      - kind: unit
        ref: "test/unit/ui/grid-keyboard-open-row.test.ts (4)"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts › 힌트 줄 (갱신) · mobile-expense-form · mobile-320-no-overflow (55 pass)"
        status: pass
    human_judgment: true
    rationale: "독립 DOM 감사 · /design-review는 오케스트레이터 몫(CLAUDE.md §6) — 이 플랜은 점검표 2건 + CI=true DOM 단언까지"

duration: ~3h
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 15: 견적 줄 D-66 연결 · 상태 열 파생값 · 행 행동 셀 나머지 갈래 Summary

**번호 있는 지출결의만 견적 줄 금액 셀을 잠그고(계보 따라옴) 줄 상태 열이 `지출결의 중` · `반려`를 말하며, 견적 표 행 행동 셀이 거래처 없음 · 게이트 이유 · 미저장 편집 · `Ctrl+E`까지 갈래를 갖춘다.**

## Accomplishments
- `repositories/expenses.listNumberedByProject` + `domain/quotes/lines.linkedDocumentsByLine`(비동기 위임, `export function` 시그니처 유지) — 차수 → 번호 있는 문서 → 차수별 줄 계보로 줄별 연결 문서. 폰 시트 · 표 · 막힘(`hasLinkedDocuments`)이 같은 쿼리 결과를 쓴다
- `linkedStatus`를 줄 DTO · 편집 사실 · 투영 스펙에 더하고 `lineStatusWord`로 표 상태 칸 · 폰 시트 `상태` 값을 `StatusTag variant="text"`로
- 행 행동 셀: `거래처 없음`(+ ≥1024 · 거래처 열 있는 계급만 `거래처 고르기`), 표 전체 게이트 중 버튼 없이 이유 한 줄, 누르는 동안 나머지 `aria-disabled`, 셀 3차 `tabIndex -1`, 저장 안 한 편집이면 이동 대신 합계 행 오른쪽 `저장 안 한 편집 N칸 · 먼저 일괄 저장`
- `useGridKeyboard.onOpenRow` — 편집 중이 아닐 때 `Ctrl+E` = 활성 줄 셀 동작(행동 열이 서는 사람에게만). 힌트 줄은 7개를 넘으면 복사 · 붙여넣기를 `범위 복사 Ctrl+C / 붙여넣기 Ctrl+V` 하나로 합치고 끝에 `지출결의 올리기 Ctrl+E`
- `RowAction`에 선택 prop `tabIndex` · `busy`만 추가(기존 호출부 불변)

## Task Commits
1. Task 1 D-66 연결 + 상태 파생 — `2fc8c670` (test, RED) · `2ddbb643` (feat, 쿼리 · DTO) · `7f055722` (feat, StatusTag 상태 열)
2. Task 2 행 행동 갈래 · Ctrl+E · 힌트 — `171cf87e` (test, RED 7) · `38855979` (feat, GREEN)

`commits: 8`은 `git rev-list --count 8df5e714..HEAD`를 SUMMARY 쓰기 직전에 잰 값이다. 05-15 커밋은 5개이고 나머지 3개(`05971a81` · `3b901805` · `4b03fcc9`)는 같은 브랜치에 끼어든 05-12 커밋이다. SUMMARY 커밋은 이 수에 들지 않는다.

## Deviations from Plan

1. **[Rule 1 — 기대값 갱신] Phase 4 힌트 줄 E2E 두 건** — `quote-table.spec.ts`의 힌트 줄 단언(`(c)` · `HINT_TEXT`)은 행동 열이 없던 때의 일곱 항목이었다. UI-SPEC 「힌트 줄 항목(S1)」(05-UI-SPEC.md:271)이 행동 열이 서는 사람에게 `지출결의 올리기 Ctrl+E`를 더하고 복사 · 붙여넣기를 합치라 하므로 글자 · kbd 배열을 그 원문으로 바꿨다. 항목 수 7은 그대로. `38855979`
2. **[Rule 3] 테스트 도움** — `행 행동 갈래` 스펙의 800 폭 단언은 `gridcell`이 아니라 `cell`(1024 미만은 읽기 전용 표 — DR-36), 미저장 한 줄은 격자 안으로 좁혀 단언(같은 글자가 확인 창 · 버튼 이유에도 있음). 코드 결함 아님.
3. **[실행 규칙] `domain/expenses/index.ts`는 건드리지 않음** — 계획 files_modified에 있었으나 사용자 결정(2026-10-04)으로 줄 남은 실행 확인(514-518)이 그대로라 바꿀 곳이 없었다.

**Total deviations:** 3 (Rule 1: 1 · Rule 3: 1 · 실행 규칙: 1). **Impact:** 새 의존성 0 · 새 색 · 서체 · radius 0 · tokens.css · 스냅샷 · package.json · lockfile diff 0.

## Deferred Issues
- **`test/e2e/quote-revisions.spec.ts:675`**(「차수 열기」 …) — 이전 차수 읽기 표 머리글이 현재 표 머리글과 같아야 한다고 단언하는데 현재 표에는 05-05가 더한 맨 끝 `행동` 머리글(스크린리더용)이 있고 읽기 표(`quoteLineReadColumns`)에는 없다. 이 플랜이 만진 코드가 아니다(머리글 · `showColumn` 판정 불변 — 05-05 `6a486369`부터의 불일치로 읽힌다). 8df5e714에서 실제로 돌려 확인하지는 않았다. 읽기 표는 이전 차수라 행동 열이 없는 게 맞으므로 단언을 `행동` 제외로 바꾸는 한 줄 수정 후보. `deferred-items.md`에 적음. 오케스트레이터 판단 필요.

## Verification
- `pnpm test:unit` 전체: 248 files · 3794 tests 통과(SUMMARY 직전, 커밋 `38855979` 이후)
- 통합: `linked-documents-by-line` 6 통과(Task 1) · E2E(`CI=true`): `expense-submit-mobile-approval` 12/12 · 넓은 데스크톱 묶음(`quote-table` · `ledger-save-flow` · `quote-revisions` · `quote-edit-scope` · `hidden-references` · `excel-paste-final`) 168 통과 18 skip 3 실패 → 실패 둘은 힌트 기대값 갱신 뒤 `-g "힌트 줄"` 16 통과, 나머지 하나는 위 Deferred. 폰: `E2E_SKIP_DESKTOP=1 … mobile-expense-form · mobile-320-no-overflow` 55 통과 2 skip
- lint · typecheck · `lint:sql` 0 · 인수 grep(`unsavedEditsReason` 3 · `행 행동 갈래` 1 · `vendor.value` 3 · `footerNotices=` 1) 충족

## Known Stubs
없음.

## Threat Flags
없음(새 네트워크 · 인증 · 파일 접근 경로 없음 — 거래처 정보 가림은 서버 판정 그대로).

## Next Phase Readiness
- 05-08(여러 줄 `Ctrl+E`)은 `onOpenRow`가 활성 줄 하나만 넘기므로 같은 자리에 여러 줄 갈래를 붙이면 된다.
- 연결 · 상태는 계보를 따라 다음 차수 줄에도 온다(1차에서 반려된 문서는 같은 계보 2차 줄 상태도 `반려`, 새로 더한 줄은 `미착수`).
- 화면 검증은 `visual_baseline_expected: [project-detail]`(PC 견적 표 · 합계 행 · 힌트 줄 · 폰 행 시트 상태 값) — 독립 DOM 감사 · `/design-review` → `/qa`는 묶음마다 한 번.

## Self-Check: PASSED
- 파일: repositories/expenses.ts · domain/quotes/lines.ts · test/integration/linked-documents-by-line.test.ts · test/unit/ui/grid-keyboard-open-row.test.ts · docs/design/checks/2026-10-04-05-15-quote-line-{status,doors}.md 존재
- 커밋: 2fc8c670 · 2ddbb643 · 7f055722 · 171cf87e · 38855979 존재
