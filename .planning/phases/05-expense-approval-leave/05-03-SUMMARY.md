---
phase: 05-expense-approval-leave
plan: 03
subsystem: database
tags: [expenses, approvals, drizzle, postgres, tax, document-numbering, tracer]

requires:
  - phase: 05-01
    provides: "결재 엔진 확장(registerDocumentKind resubmitFrom · DocumentSummary · isRouteStepSettingKey · document_submit/approve 로그)"
  - phase: 04
    provides: "견적 줄 · 차수 · 고객 승인 게이트(quote.customer-approval) · applyTaxRule · document_counters.allocateNumber · lockProjectForWrite"
provides:
  - "expenses 표(0025_aromatic_hawkeye) · repositories/expenses.ts"
  - "domain/expenses: createExpenseFromLines · saveExpenseDraft · submitExpense(already_submitted 갈래) · getExpense · canSeeExpense · EXPENSE_DOCUMENT_KIND"
  - "expenseLineDoor · evaluateExpenseSubmit(③④⑥⑦) · computeExpenseTax · resolveAppliedRate · remainingForInstallments · sumKrw · diffKrw"
  - "설정: approval_route.expense.* 17키 · document_number.expense.* 3키 · getSettingEntry"
  - "expenseNumberFormat · loadExpenseNumberFormat · allocateExpenseNumber(period = 프로젝트 번호)"
  - "시드 seedExpenses(3단 경영관리본부 · expenses 메뉴 · expense.value/amount · payment_method 코드표)"
affects: [05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-13, 05-14, 06-02, 06-03]

actuals:
  tokens: 70700
  tasks: 2
  commits: 6

plan_head_before: d5033b17c69b569045c7f98c3d109827ff91452b
commits: 6

migration_manifest:
  - tag: 0025_aromatic_hawkeye
    sql: db/migrations/0025_aromatic_hawkeye.sql
    snapshot: db/migrations/meta/0025_snapshot.json
    journal: db/migrations/meta/_journal.json
    hand_inserted_lines: "1-5 (주석 2줄 + SET LOCAL lock_timeout '1s' · statement_timeout '5s' + statement-breakpoint)"

tech-stack:
  added: []
  patterns:
    - "지출결의 제출 tx: 프로젝트 행 잠금 → 문서 행 FOR UPDATE → 이미 제출됨 판정 → version → 재판정 → 스냅숏 → submitDocument → 마지막 쓰기 번호"
    - "세율 스냅숏은 이력 행 id · 적용일 값 복사(FK 없음)"

key-files:
  created:
    - db/schema/expenses.ts
    - db/migrations/0025_aromatic_hawkeye.sql
    - repositories/expenses.ts
    - domain/expenses/index.ts
    - domain/expenses/dto.ts
    - domain/expenses/gate.ts
    - domain/expenses/line-door.ts
    - domain/expenses/tax.ts
    - domain/seed/expenses.ts
    - docs/EXPENSES.md
    - test/integration/fixtures/expenses.ts
    - test/integration/expense-approval-lifecycle.test.ts
  modified:
    - domain/settings/keys.ts
    - domain/settings/registry.ts
    - domain/money/index.ts
    - domain/document-numbering/index.ts
    - domain/permissions/info-items.ts
    - domain/code-tables/index.ts
    - domain/seed/index.ts
    - app/(app)/document-kinds.ts
    - docs/ARCHITECTURE.md
    - test/e2e/settings-approval-route.spec.ts
    - test/e2e/code-tables.spec.ts
    - test/integration/code-tables.test.ts
    - test/integration/leak-scan.test.ts

key-decisions:
  - "canSeeExpense는 domain/expenses/index.ts 안에 둔다 — 상수 EXPENSE_DOCUMENT_KIND가 index.ts에 있어야 하고(acceptance grep) access.ts로 떼면 런타임 순환이 생긴다"
  - "expenses_submitted_amount_check는 number IS NULL OR (supply_amount_krw IS NOT NULL AND supply_amount_krw > 0) — 계획 원문은 NULL 금액을 통과시킨다"
  - "computeExpenseTax(viewer, doc, deps) — 증빙 코드 항목 조회에 viewer가 필요해 첫 인자로 받는다"
  - "세금 계산 불가(⑨)는 게이트 통과 뒤 GateBlockedError(세금 계산 불가 · 세율은 경영관리) — 05-06이 evaluateExpenseSubmit 순서로 옮긴다"

patterns-established:
  - "새 결재 종류 = 설정 17키 + routeSettings + document-kinds.ts 부수효과 import 한 줄"

requirements-completed: [EXP-01, EXP-14, EVID-01, OPS-08]

coverage:
  - id: D1
    description: "견적 줄 하나 → 작성 중 자동 채움 → 임시 저장 → 제출(26001-0001 · 세금 스냅숏 · 결재선 4단) → 팀장 · 대표 승인 → approved · 행동 로그"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-approval-lifecycle.test.ts#트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "작성 중 문서는 기안자만 본다(무관한 PM null)"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-approval-lifecycle.test.ts#무관한 기획 PM"
        status: pass
    human_judgment: false
  - id: D3
    description: "번호 서식 · 세금 기준일 · sumKrw/diffKrw 순수 함수"
    requirement: EXP-14
    verification:
      - kind: unit
        ref: "test/unit/domain/expenses · test/unit/domain/money.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "지출결의 결재선 단계 16키가 단계 저장 키 · 연차 결재선 설정 E2E 회귀 녹색"
    verification:
      - kind: integration
        ref: "test/integration/expense-approval-lifecycle.test.ts#결재선 단계 칸 16키"
        status: pass
      - kind: e2e
        ref: "CI=true playwright test/e2e/settings-approval-route.spec.ts --project=desktop-settings (21 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "설정 화면 지출결의 결재선 섹션의 복원 줄 중복(연차 보관본이 두 섹션에 보임)"
    verification: []
    human_judgment: true
    rationale: "화면 동작 결정(섹션별 복원 · 글자에 종류 표시)이 필요해 이 플랜에서 고치지 않았다 — Deferred Issues 참조"

duration: 38min
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 03: 지출결의 도메인 트레이서 Summary

**견적 줄 하나에서 만든 지출결의가 자동 채움 → version 조건 저장 → 잠금 순서를 지킨 제출(프로젝트별 번호 `26001-0001` · 부가세 스냅숏 · 결재선 4단 고정) → 팀장 · 대표 승인까지 도메인 한 줄로 간다.**

## Performance
- **Started:** 2026-10-04T08:28:48Z · **Completed:** 2026-10-04T09:07Z (38 min)
- **Tasks:** 2/2 · **Files:** 32 changed

## Task Commits
| 단위 | 커밋 | 내용 |
|---|---|---|
| A (스키마) | `bd3e6541` | feat — `git show --name-only`: db/schema/expenses.ts · db/schema/index.ts · 0025 SQL · 0025_snapshot.json · _journal.json(db/* 만) |
| B RED | `f7cfc71a` | test — 번호 서식 · 세금 날짜 · krw 합(RED_EVIDENCE_OK) |
| B GREEN | `db940950` | feat — expenseNumberFormat · pickTaxDates · incomeTypeFor · sumKrw · diffKrw |
| C RED | `500b5d2f` | test — 트레이서 통합 · docs 가드 · E2E 로케이터(RED_EVIDENCE_OK) |
| C GREEN | `6e38369e` | feat — 리포지토리 · 도메인 · 설정 · 번호 · 시드 · 문서 |
| Task 2 | `ba924f1f` | chore — 0025 SET LOCAL 블록 |

## submitExpense `withTransaction` 콜백 안 호출
| 순서 | 호출 | 종류 |
|---|---|---|
| 1 | `lockProjectForWrite(viewer, projectId, tx)` | repo, FOR UPDATE |
| 2 | `lockExpenseForUpdate(viewer, id, tx)` | repo, FOR UPDATE |
| 3 | `findExpenseApprovalStatus(…, tx)` (번호 있을 때만 — already_submitted) | repo |
| 4 | `findQuoteLineById(…, tx)` · `findLatestQuoteRevision(…, tx)` · `listNumberedByLine(…, tx)` | repo |
| 5 | `expenseLineDoor` · `evaluateExpenseSubmit` · `remainingForInstallments` | 순수 |
| 6 | `saveSubmissionSnapshot(…, tx)` | repo |
| 7 | `submitDocument(viewer, prepared, {documentId}, tx)` | 엔진 tx 쓰기(인스턴스 · 단계 · document_submit 로그) |
| 8 | `allocateExpenseNumber(…, tx)` → `setExpenseNumber(…, tx)` | 마지막 쓰기 |

`getSettingValue` · `applyTaxRule` · `prepareSubmission` · `can(` · `teamAtDate` 없음(전부 트랜잭션 전).

## Deviations from Plan

1. **[Rule 1 - Bug] 번호 문서 금액 CHECK 강화** — 계획 원문 `number IS NULL OR supply_amount_krw > 0`은 NULL 금액을 통과시킨다 → `supply_amount_krw IS NOT NULL AND > 0`. (`bd3e6541`)
2. **[전제 변경] 세율 이력 행 id · 적용일은 null이 아니다** — 04.5 뒤 시드가 이력형 키 기본 행(2000-01-01)을 넣는다. 트레이서는 시드 행의 id · effectiveFrom 복사를 단언한다.
3. **[TDD] 단위 C RED는 커밋하지 않은 인터페이스 stub으로 테스트 발견** — 모듈이 없으면 "no tests"(INVALID_RED)라서.
4. **[Rule 3] `domain/expenses/access.ts` 없음** — `EXPENSE_DOCUMENT_KIND = "expense"`가 index.ts에 있어야 하고(acceptance), access.ts가 그것을 import하면 런타임 순환(import-cycles 테스트)이라 `canSeeExpense`를 index.ts에 둠.
5. **[Rule 3] 코드표 개수를 고정한 단언 갱신** — `payment_method`가 CODE_TABLES 네 번째가 되어 `test/integration/code-tables.test.ts`(목록 3→4) · `test/e2e/code-tables.spec.ts`(링크 3→4 · 형제 2→3)를 고침. 화면 파일은 그대로.
6. **[Rule 3] 설정 E2E 복원 줄 로케이터도 연차 섹션으로 좁힘** — 계획은 복원 줄을 섹션 밖으로 가정했지만 실제로는 단계 칸이 있는 섹션마다 그려진다(strict mode 8건). `getByText("저장 안 한 편집 …")` 보임 · 숨김 · `복원`/`버림` 버튼만 `leaveRoute(page)`로, `toHaveCount(0)`은 페이지 범위 그대로. 기대값 집합 불변 · 사례 수 불변.
7. **MAST-05 REQUIREMENTS 비고**: main 반영 전 — 05-13 전에 남김(실행 규칙이 main 머지 · .planning Bash 편집을 금지).

## Deferred Issues
- **설정 화면 복원 줄 중복** — `app/(app)/admin/settings/settings-form-client.tsx:711` 복원 줄이 단계 칸 있는 섹션마다 그려지고 글자가 종류 없이 `2단`이라, 연차 보관본이 `지출결의 결재선` 섹션에도 같은 줄 · 같은 `복원`으로 보인다(누르면 연차 칸을 되살림). 섹션(종류)별 복원으로 고치는 것은 화면 동작 결정이라 이 플랜(화면 코드 고치지 않음)에서 하지 않았다 — WINDOWS 원장 `deviation`으로 기록. 05-05 또는 별도 화면 quick이 design-gate와 함께 고친다.

## TDD Gate Compliance
- 단위 B: RED `f7cfc71a`(TypeError: not a function) → GREEN `db940950`.
- 단위 C: RED `500b5d2f`(미구현 stub · isRouteStepSettingKey 거짓) → GREEN `6e38369e`.

## Verification
- unit: `test/unit/domain/expenses · money · settings · import-cycles · docs-limits` 11 files 207 passed; 관련 unit(settings · approvals · leave · certs · custom-fields) 18 files 323 passed.
- integration: lifecycle · leak-scan · seed-permissions 3 files 2296 passed(트레이서 3/3); 공용 회귀(approvals-* · quote-lines · project-status · settings-* · code-tables · visibility · action-log 등) 16 files 279 passed(code-tables 고친 뒤).
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0.
- E2E `CI=true`: settings-approval-route(desktop-settings) 21 passed · code-tables(desktop) 23 passed. 포트 3100 정리함.
- Task 2: `db:generate` "No schema changes" · 빈 DB 적용 · squawk 0/26 files · test/unit/db 12 passed · dev DB migrate OK · journal diff 끝 항목 하나 · SQL에 settings_historized 0.
- acceptance grep 전부 통과(readBy 5→4 · document-numbering `-`줄 0 · ARCHITECTURE 295줄 불변 · B1 0/0/2 등).

## Next Phase Readiness
- 05-04: `submitReadyDraft`(fixtures/expenses.ts)에 증빙 첨부를 더하고, `evaluateExpenseSubmit`에 ⑧을 끼운다.
- 05-06: ①②⑤⑨를 `evaluateExpenseSubmit` 순서대로 끼운다 — 지금 ⑨는 게이트 뒤 GateBlockedError 한 줄.
- 05-05: `listLineDoors`는 `expenseLineDoor` · `loadProjectFacts`(index.ts 비공개) 재사용. 설정 화면 복원 줄 중복(Deferred) 처리 필요.
- 05-09: 번호 있는 rejected/withdrawn 문서 제출은 지금 ExpenseConflictError — resubmit 갈래를 더한다.

## Self-Check: PASSED
- 파일: db/schema/expenses.ts · repositories/expenses.ts · domain/expenses/{index,dto,gate,line-door,tax}.ts · domain/seed/expenses.ts · docs/EXPENSES.md 존재.
- 커밋: bd3e6541 · f7cfc71a · db940950 · 500b5d2f · 6e38369e · ba924f1f 존재(`git rev-list --count d5033b17..HEAD` = 6).
