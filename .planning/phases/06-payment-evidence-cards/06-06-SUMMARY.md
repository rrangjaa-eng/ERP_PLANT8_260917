---
phase: 06-payment-evidence-cards
plan: 06
status: complete
subsystem: payments
tags: [evidence-review, o-2, payment-gate, evidence-amount, q-f, ea-1, evidence-stamp, s4, money]
requires: [06-03, 06-04, 06-27, 06-28]
provides:
  - "증빙 확인(confirmEvidence · confirmEvidenceAction) — 금액 고쳐 확인 · F2 · 증빙 지문 · EA-1"
  - "O-2 상수 EVIDENCE_CONFIRMATION_GATES_PAYMENT(action-row.ts 한 곳) · confirmationBlocksPayment · 확인 전 지급 막힘"
  - "resolveExpenseActionRow P2 · P5"
  - "evidenceGateInputs(viewer, lockedDoc, pre, tx?) — 지급 완료 · 지급 보기의 증빙 게이트 입력 한 함수"
  - "resolveEvidenceStatus 다섯 값 · prepaidDueInfo(선결제 기한) · evidenceStampOf · evidenceOverrunLine · isTaxInclusiveEvidenceAmount"
  - "repositories/expense-evidence-reviews.ts(findReviewByExpense · upsertReview · updateEvidenceAmount · listReviewStatusByExpenses · listAliveCardUsageSuppliesByProject)"
  - "지급 보기 DTO evidenceStatus · evidenceRequired · evidenceAmountKrw · evidenceAmountDisplay · reviewLine · reviewAmounts · prepaidDue · evidenceStamp · evidenceTaxLine · evidenceOverrun"
  - "행동 종류 evidence_amount_change(끌 수 없음)"
  - "문서 화면 S4 확인부(EvidenceReviewBlock) · 1차 증빙 확인"
affects: [06-10, 06-11, 06-13, 06-15, 06-17, 06-19, 06-20, 06-23, 6.1-01, 6.1-06, 6.1-12]
tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약 유지 — 권한 · 설정 · 세율 · EA-1 부가세는 트랜잭션 전, 트랜잭션 안은 tx 리포지토리 · 순수 함수 · recordAction(…, { tx })"
    - "트랜잭션 안 신호(EvidenceStampChangedSignal) → 밖에서 이름을 붙인 동시성 거부(06-04 AlreadyPaidSignal 꼴)"
    - "evidence-reviews → payments 값은 동적 import(정적 상호 import = 런타임 순환, record.ts 선례)"
key-files:
  created:
    - domain/evidence-reviews/index.ts
    - domain/evidence-reviews/prepaid.ts
    - domain/evidence-reviews/tax-inclusive.ts
    - repositories/expense-evidence-reviews.ts
    - app/(app)/expenses/[id]/evidence-review-section.tsx
    - test/unit/domain/evidence-reviews.test.ts
    - test/unit/domain/evidence-prepaid.test.ts
    - test/integration/evidence-reviews.test.ts
    - docs/design/checks/2026-10-06-06-06-evidence-review.md
  modified:
    - domain/payments/action-row.ts
    - domain/payments/index.ts
    - domain/action-log/record.ts
    - domain/settings/keys.ts
    - repositories/files.ts
    - app/(app)/expenses/[id]/expense-document.tsx
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - app/(app)/expenses/[id]/actions.ts
    - app/(app)/expenses/[id]/actions.registry.ts
    - test/e2e/payment-single.spec.ts
    - test/unit/domain/payments.test.ts
    - test/unit/settings/phase6-keys.test.ts
decisions:
  - "06-06: O-2는 action-row.ts의 상수 EVIDENCE_CONFIRMATION_GATES_PAYMENT 한 곳 — evidenceGateDecision(서버 게이트)과 P2 갈래가 읽는다. 답이 바뀌면 이 상수와 P2 갈래만 고친다"
  - "06-06: 확인 기록 시각은 06-27 reviewed_at 하나(confirmed_at 없음, CF-1) — EvidenceConfirmation = { reviewedAt: Date } 그대로"
  - "06-06: 빈 증빙 금액을 경영관리가 채워 확인하면(F2) 06-27 CHECK(전 · 후 둘 다 null이거나 둘 다 값) 때문에 확인 기록 전 · 후는 null, 전 null · 후 값은 끌 수 없는 evidence_amount_change 로그에만 남긴다"
  - "06-06: Q-F 계보 카드 사용은 repositories/quote-lines listLineageLinesByProjects(LineageLine 한 쿼리)로 사슬을 짓는다 — summarizeRevisions + listQuoteLinesByRevision보다 단순, 같은 resolveLinkedDocumentsByLineage"
metrics:
  duration: "첫 커밋 13:59Z → 마지막 14:38Z(앞선 조사 · 트레이서 구현은 문맥 압축 전 — 시작 시각 기록 유실)"
  completed: 2026-10-06
estimate:
  tokens: 95000
actuals:
  tokens: 37600
  tasks: 3
  commits: 3
plan_head_before: ed7b8171d38190b853fc88a4898e6c7f8a204fde
requirements-completed: []  # ready-ids: EVID-02 · EVID-03 blocked(다른 06 플랜 몫이 남음) — EVID-02는 06-04가 이미 Complete, EVID-03은 표시하지 않음
---

# Phase 06 Plan 06: 증빙 확인 S4 · O-2 게이트 · 금액 고쳐 확인 · 증빙 지문 · Q-F · EA-1 Summary

경영관리가 결재 통과 문서의 증빙을 문서 화면 1차 `증빙 확인`으로 확인한다(필요하면 금액을 고쳐 한 번에). 확인 전 증빙은 증빙 필수 설정과 관계없이 지급을 서버 게이트에서 막는다(O-2 상수 한 곳). 고친 금액은 확인 기록의 전 · 후와 끌 수 없는 `evidence_amount_change` 로그로 남는다. 화면이 본 증빙 지문이 지금 증빙과 다르면 확인을 거부한다. 승인액 · 남은 실행가를 넘는 증빙 금액은 한 줄로 보이기만 하고 막지 않는다(Q-F). 부가세가 포함된 금액으로 고치면 거부한다(EA-1).

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (tracer) | 8e6c86a0 | 확인 기록 리포지토리 · confirmEvidence · P2 · 확인부 · 1차 `증빙 확인` · E2E 트레이서 |
| 2 | 14fbbc81 | O-2 상수 · confirmationBlocksPayment · P5 · evidenceGateInputs · prepaidDueInfo · keys.ts readBy |
| 3 | 0baa3028 | 금액 고쳐 확인 · F2 · 증빙 지문 · Q-F · EA-1 · evidence_amount_change · S4 완성 |

트레이서 피드백 게이트: Task 1 `<verify>`(단위 셋 · lint · typecheck · build · CI=true E2E 15/15)를 커밋 직전에 끝까지 다시 돌려 녹색을 보고 확장했다.

## ⓪ 선행 의존 · 계획 이름 → 실제

| 계획 이름 | 실제 | 비고 |
|---|---|---|
| 06-27 확인 기록 필드 | Drizzle `expenseEvidenceReviews`: `expenseId` · `status` · `amountBeforeKrw` · `amountAfterKrw` · `waiveReason` · `reviewedBy` · `reviewedAt` · `version` | 06-27 그대로 |
| 6.1 행동 종류 `evidence_amount_change` | 없었다 → 이 플랜이 record.ts 세 배열(CORE · LABELS `증빙 금액 변경` · ALWAYS_ON)에 더함 | 6.1-01과 같은 이름 — 먼저 머지되는 쪽이 더한다 |
| `confirmation: "confirmed"` | `EvidenceConfirmation = { reviewedAt: Date }`(06-04 타입) 그대로 — `confirmation`이 null이 아니면 확인됨 | CF-1: `confirmed_at` 없음. `git grep -e confirmed_at -e confirmedAt domain repositories`의 2건은 05 공휴일(`domain/holidays/admin.ts`)뿐, 증빙 쪽 0건. **6.1-12에 알림: 확인 시각은 `reviewed_at`** |
| `confirmationBlocksPayment(status)` | `confirmationBlocksPayment({ hasEvidence, waived, confirmation }, gates = EVIDENCE_CONFIRMATION_GATES_PAYMENT)` | 상태 낱말 대신 같은 세 필드(잎 모듈 action-row.ts가 evidence-reviews를 import하지 않게) |
| `evidenceGateInputs`의 `pre`(evidenceRequired · drafterName) | `pre: { evidenceRequired, drafterName }` — 호출자가 `shared.evidenceRequired` · `pre.drafterName`을 넘긴다 | 06-04 `PaymentInputs`에 evidenceRequired 칸이 없다(shared에 있다) |
| `loadPaymentInputs`(confirmEvidence 사전 조회) | `loadPaymentShared` + `visible` · EA-1은 `approvedSupplyTax`(아래) | 행동 줄은 트랜잭션 전 권한 값으로 셈 |
| EA-1 부가세(`applyTaxRule` 부가세 칸) | `decidePayable`의 `vatKrw`(applyTaxRule 결과를 그대로 펼친 칸) — 승인 공급가를 금액 원천으로, 기준일 = 오늘 지급 | `approvedSupplyTax(viewer, expenseId, shared)` 새 export(domain/payments/index.ts) |
| Q-F 계보 `summarizeRevisions` + `listQuoteLinesByRevision` | `listLineageLinesByProjects(viewer, [projectId])`(repositories/quote-lines.ts — `LineageLine` 한 쿼리) | 같은 `resolveLinkedDocumentsByLineage`, 카드 사용이 0건이면 읽지 않는다 |

## 06-15 · 06-17 · 06-20이 읽는 모양

**액션** `confirmEvidenceAction` — `app/(app)/expenses/[id]/actions.ts`(등록: menu `expenses.payments`, action `write`, dtoName null)

```ts
z.object({
  expenseId: z.string().uuid(),
  version: z.number().int().positive(),
  correctedAmountKrw: z.number({ error: "숫자 아님 · 12,400,000처럼" }).int("원화 소수점 · 소수점 없이").positive("증빙 금액 0 이하 · 금액 고치기").optional(),
  evidenceStamp: z.string().max(4000).optional(),
})
// 응답(도메인 그대로): { version: number; evidenceStatus: EvidenceStatus; actionRow: ExpenseActionBar }
```

- `version` = 커밋 뒤 DB 문서 version(통합 「확인 응답에 새 version」).
- 거부: 권한 없음 `ForbiddenError` · 동시성 `EvidenceReviewConflictError`(`다른 사람이 HH:mm에 바꿈 · 새로 고침` / 지문 다름 `{이름}이 HH:mm에 증빙을 바꿈 · 새로 고침`) · 결재 통과 전 `GateBlockedError` · 칸 오류 `EvidenceAmountError`(`증빙 금액 없음` · `부가세 포함 금액 · 공급가로 입력`) · 확인할 증빙 없음 `UserFacingError("확인할 증빙 없음 · 새로 고침")`.
- `previewPayableAction`에 선택 입력 `evidenceAmountKrw`(정수 · 1 이상). 응답에 `evidenceTaxLine` · `evidenceOverrun`이 더해진다(그 입력이 있을 때만).

**도메인 서명**(domain/evidence-reviews/index.ts)

```ts
resolveEvidenceStatus(input: { hasEvidence: boolean; prepaid: boolean; review: { status: string } | null; evidenceRecordCount?: number }): "면제" | "확인 전" | "확인됨" | "선결제" | "증빙 없음"
confirmEvidence(viewer, { expenseId, version, correctedAmountKrw?, evidenceStamp? }): Promise<ConfirmEvidenceResult>
evidenceGateInputs(viewer, lockedDoc: { id: string; prepaid: boolean }, pre: { evidenceRequired: boolean; drafterName: string }, tx?: DbOrTx): Promise<EvidenceGateInput>
loadPrepaidDueDays(): Promise<number>
evidenceStampOf(input: { fileIds: readonly string[]; evidenceAmountKrw: number | null; evidenceDate: string | null }): string
evidenceOverrunLine(input: { hasLiveEvidence: boolean; evidenceAmountKrw: number | null; approvedSupplyKrw: number; lineRemainingKrw: number | null }): string | null
```

- domain/evidence-reviews/prepaid.ts(잎 — import 0): `prepaidDueInfo({ prepaid, hasEvidence, waived, paidOn: string | null, dueDays: number, today: string }): { dueOn: string; overdueDays: number } | null` — 날짜는 KST `YYYY-MM-DD`. 선결제 아님 · 지급 전 · 면제 · 증빙 있음이면 null.
- domain/evidence-reviews/tax-inclusive.ts: `EVIDENCE_AMOUNT_TAX_INCLUSIVE` · `isTaxInclusiveEvidenceAmount({ evidenceAmountKrw: number | null, supplyKrw, vatKrw }): boolean`(정확 일치 · 부가세 > 0). 값 import는 `@/domain/money` `sumKrw` 하나.
- domain/payments/index.ts: `loadEvidenceOverrun(viewer, doc: Pick<ExpenseRow, "id" | "projectId" | "quoteLineId" | "supplyAmountKrw">, evidenceAmountKrw: number | null): Promise<string | null>`(L704 — 몸통 첫 읽기 `hasEvidence(viewer, { ownerKind, ownerId: doc.id })` L710, 거짓이면 계보 조회 없이 null) · `approvedSupplyTax(viewer, expenseId, shared)`(L689).
- domain/payments/action-row.ts: `EVIDENCE_CONFIRMATION_GATES_PAYMENT = true` · `EVIDENCE_UNCONFIRMED = "증빙 확인 전 · 증빙 확인"` · `confirmationBlocksPayment` · `evidenceGateDecision(ctx, gates?)` · 칸 오류 상수 `EVIDENCE_AMOUNT_NOT_NUMBER` · `_NOT_POSITIVE` · `_FRACTION` · `_REQUIRED`.

**리포지토리**(repositories/expense-evidence-reviews.ts)

```ts
findReviewByExpense(viewer, expenseId: string, tx: DbOrTx = db): Promise<EvidenceReviewRow | null>   // 문서당 한 줄
upsertReview(viewer, { expenseId, status: "confirmed" | "waived", amountBeforeKrw, amountAfterKrw, waiveReason, reviewedBy }, tx): Promise<EvidenceReviewRow>  // ON CONFLICT (expense_id) DO UPDATE · version + 1 · waiveReason은 waived일 때만
updateEvidenceAmount(viewer, { expenseId, amountKrw }, tx): Promise<boolean>   // expenses.evidence_amount 그 칸만
listReviewStatusByExpenses(viewer, expenseIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, "confirmed" | "waived">>  // 빈 배열 → 쿼리 없이 빈 Map
listAliveCardUsageSuppliesByProject(viewer, projectId: string, tx: DbOrTx = db): Promise<{ quoteLineId: string; supplyKrw: number }[]>
```

repositories/files.ts `listAliveByOwners(viewer, input, tx: DbOrTx = db)` — 선택 tx 추가(05 호출부 그대로, evidence-upload 통합 녹색).

**DTO 칸**(PAYMENT_VIEW_DTO_SPEC — 새 정보 항목 없음): `evidenceStatus` · `evidenceRequired` · `reviewLine`({ byName, at `MM-DD HH:mm`, waiveReason }) · `prepaidDue` · `evidenceStamp` = `expense.value` / `evidenceAmountKrw` · `evidenceAmountDisplay`({ valueKrw, enteredByName, enteredAt `MM-DD` }) · `reviewAmounts`({ beforeKrw, afterKrw }) · `evidenceTaxLine`(TaxLinePart[] — 지급 전 · 증빙 금액 기준일 때만) · `evidenceOverrun` = `expense.amount`. PAYABLE_PREVIEW_DTO_SPEC에 `evidenceTaxLine` · `evidenceOverrun`(`expense.amount`).

## tx 범위 검사

| 범위 | 「같은 tx 기록 검사」 | 「hasEvidence tx 검사」 | 사전 조회 함수(`can` · `getSettingValue` · `loadTaxRates` · `loadPaymentInputs` · `applyTaxRule`) |
|---|---|---|---|
| `confirmEvidence` 콜백 domain/evidence-reviews/index.ts L165-205 | 0 | 0 | 0 |
| `completeExpensePayment` 콜백 domain/payments/index.ts L462-513 | 0 | 0 | — |

지급 완료 쪽 호출(넷째 인자 tx): `domain/payments/index.ts:470  const evidenceGate = await evidenceGateInputs(viewer, locked, { evidenceRequired: shared.evidenceRequired, drafterName: pre.drafterName }, tx);` — 지급 보기 L867은 tx 없이(리포지토리 기본값).

## 검증(이 실행에서 본 결과)

- 격리 DB `erp_e0606_test`(만들기 · 마이그레이션 · 사용 · 끝에 DROP).
- 단위: `pnpm test:unit` 전체 **273 파일 · 4206 통과 · 실패 0**. 지정 — action-registry-completeness · leak-scan-coverage · import-cycles · evidence-reviews(33) · evidence-prepaid(8) · payments · registry-coverage · phase6-keys · action-log/record 녹색. `-t "Q-F"` 7 통과.
- 통합: evidence-reviews 16 · expense-payments · expense-payments-concurrency(「지급 완료 동시 6건」 포함) · evidence-upload · leak-scan — **5 파일 · 3234 통과 · 실패 0**.
- E2E: `CI=true pnpm build` 녹색 뒤 `CI=true pnpm exec playwright test test/e2e/payment-single.spec.ts` — **18 통과 · 실패 0 · 18 건너뜀**(건너뜀은 이 스펙을 받지 않는 다른 프로젝트 몫 — 변경 전에도 같은 수). 06-03 · 06-04 케이스 그대로 녹색, 새 케이스 넷(트레이서 · 금액 고쳐 확인 · 빈 금액 · 초과 표시).
- `pnpm lint`(eslint + stylelint) · `pnpm typecheck` 0.
- 수용 grep: O-2 상수 파일 1(action-row.ts) · evidence-reviews/index.ts `@/db/client` 0 · prepaid.ts 값 import 0 · `EVIDENCE_PREPAID_DUE_DAYS` settings 밖 줄은 evidence-reviews/index.ts뿐 · B-3 grep 0 · `"evidence_amount_change"` record.ts 2 · `evidenceStamp` action-row 1 · actions 2 · Q-F가 domain/rules · action-row.ts에 0(종료 1) · tax-inclusive.ts의 expenses/evidence-reviews import 0 · 문구 1 · `hasLiveEvidence` 2 · `export function evidenceOverrunLine` 1 · payments `evidenceOverrun` 10 · `listNumberedByLineage` 2 · `resolveLinkedDocumentsByLineage` 2 · `listAliveCardUsageSuppliesByProject` export 1 · `tokens.css` · package.json · pnpm-lock.yaml · playwright.config.ts · `*.css` 변경 0.
- 계보 테스트가 실제로 잡는지 한 번 확인: `cardSuppliesOnChain`이 늘 빈 배열을 돌려주게 바꾸면 「Q-F 계보」가 `실행가 초과 100,000`(기대 400,000)으로 빨개짐 → 되돌림.

## Deviations from Plan

**1. [Rule 3 - Blocking] evidence-reviews → payments 동적 import**
- Found during: Task 1 · Issue: domain/payments/index.ts가 evidence-reviews를 값 import(evidenceGateInputs · resolveEvidenceStatus)하고 confirmEvidence는 `loadPaymentShared` · `pairGateCtx` · `approvedSupplyTax`가 필요 — 정적 상호 import는 런타임 순환 · Fix: `await import("@/domain/payments")`(domain/action-log/record.ts 선례). import-cycles 녹색 · Commit 8e6c86a0.

**2. [Rule 1 - Bug] 계획 밖 테스트 test/unit/domain/payments.test.ts 한 케이스**
- Found during: Task 2 · Issue: 06-04 「증빙 있음 → 통과」(confirmation null)가 O-2와 모순 · Fix: 확인 기록을 넣어 「증빙 있음(확인됨) → 통과」로 바꿈(뜻 유지 — 확인 전 막힘은 evidence-reviews.test.ts) · Commit 14fbbc81.

**3. [Rule 1 - Bug] 계획 밖 테스트 test/unit/settings/phase6-keys.test.ts**
- Found during: Task 2 · Issue: 계획대로 `EVIDENCE_PREPAID_DUE_DAYS`의 readBy를 지우면 「readBy 6」 단언이 빨개짐(전체 test:unit 녹색 지시) · Fix: 그 키를 readBy 없음 묶음으로 옮기고 테스트 이름을 고침 · Commit 14fbbc81.

**4. [Rule 2] F2 빈 금액을 채워 확인할 때의 확인 기록 전 · 후**
- 06-27 CHECK(전 · 후 둘 다 null이거나 둘 다 값) 때문에 이전 값이 null이면 기록에는 둘 다 null, 끌 수 없는 로그에 `{ before: null, after }`. 통합 「빈 증빙 금액」 케이스가 고정 · Commit 0baa3028.

**5. 서명 조정(위 「계획 이름 → 실제」)** — `confirmationBlocksPayment` 입력 · `evidenceGateInputs`의 `pre` 모양 · EA-1 부가세는 새 `approvedSupplyTax` · Q-F 계보는 `listLineageLinesByProjects`. `judgeLockedPayment`에 선택 입력 `evidenceGate`를 더해 지급 완료가 tx로 지은 게이트 입력을 넘긴다(없으면 06-04 꼴 — 기존 단위 테스트 호출 그대로).

**6. 패널 상태 합성(파일 한도 안)** — 증빙 금액 칸 상태는 계획 목록 밖 `payment-section.tsx`를 고치지 않고 evidence-review-section.tsx의 `EvidenceEditProvider`로 두고, payment-action-row.tsx가 내보내는 `PaymentPanelProvider`가 두 상태를 함께 감싼다(문서 화면은 그대로 그 이름 하나를 쓴다).

**7. 테스트 픽스처 · 준비** — E2E는 05 도우미 `submitLineExpense`(작성 중 폼에 파일 하나)로 증빙을 붙였다 — 06-03 · 06-04 E2E와 같은 길, 확인 흐름은 업로드 화면을 거치지 않는다. 기안자 증빙 금액 입력(06-10)이 아직 없어 통합 · E2E가 이 문서 행의 `evidence_amount` · 승인 공급가 · 실행가만 DB로 직접 적는다(테스트 준비 전용). Q-F 계보 통합의 1차 줄 L1 실행가는 픽스처 값 10,000,000 그대로(계획 12,000,000) — 결과는 현재 차수 줄 L2(13,000,000) 기준이라 기대값이 같다.

**8. 화면 세부** — 선결제 기한 경과 2행은 새 클래스 없이 05 `.drift`(`--status-warning` · `--text-aux`) — UI-SPEC은 `--text-tag` 400(DOM 감사 항목으로 넘김). 확인 직후 M-3: Ctrl+Enter 자동 반복 keydown(event.repeat)은 늘 무시, 포커스는 이체액 칸(P5에서 확인하면 결과 글자).

멈춤 방아쇠: ⑴ 18개 밖 파일 — 계획 밖 수정은 위 2 · 3의 테스트 두 파일뿐(지시의 「테스트 픽스처 · 훅이 요구한 점검표」 예외 범위 밖이라 보고). `domain/rules/register.ts` · `page.tsx` · `repositories/expenses.ts` · `domain/expenses/*`는 고치지 않았다. ⑵ Task 2 끝 문맥은 60% 아래 — 분할 없이 Task 3까지 진행.

## 260907 대조(보고만 — 사용자 「지금 당장 수정하지 말고 보고서를 보고 결정할게」, 구현하지 않음)

| 주제 | 260907 동작 | 근거(/home/user/erp_plant8_260907) | 06-06 |
|---|---|---|---|
| 지급 게이트 | 영수증 · 확인을 보지 않는다 — 상태 approved · 아직 지급 안 됨만 | server/src/payments.ts:929, :934 · server/src/expenses.ts:5710 | 확인 전 증빙은 지급을 막는다(O-2) |
| 지급 목록 증빙 표시 | receipt_count · receipt_waived만 | server/src/payments.ts:396-398 | 상태 다섯 값(resolveEvidenceStatus) |
| 제출 때 증빙 규칙 | 영수증 OR 첨부 OR 선결제 OR 면제 | server/src/expenses.ts:2184-2190 | 05 게이트 그대로(이 플랜 밖) |
| 금액 채택 | 「영수증 금액 채택」(지출 금액 · 부가세 = 영수증 합), `receipt.classify` 권한, 지급됨 · 결재 중 · 작성 중 · 영수증 없음 · 이미 같음이면 막힘, FOR UPDATE, 기안자에게 알림 | server/src/expenses.ts:5498-5555(whyCannotAdoptReceiptAmounts) · 라우트 5558-5560 | 경영관리가 증빙 금액만 고쳐 확인(D-602) — 부가세 · 날짜 동기화 · 기안자 알림 없음 |
| 면제 · 해제 | 영수증이 붙어 있으면 면제 거부, 해제 따로 | server/src/expenses.ts:6281/6301 · 해제 :6391 | 면제는 06-10 몫(waiveReason 칸 · upsertReview만 준비) |
| 면제 스키마 | receipt_waived 칸 · 검사 | db/schema/010_tables.sql:1729-1783 | 06-27 expense_evidence_reviews 한 줄 |
| 선결제 영수증 기한 설정 | `expense.prepay_receipt_days` | server/src/expenses.ts:756 · part-B 노트 :40 | `evidence.prepaid_due_days` + prepaidDueInfo |
| 영수증 떼기 재계산 | 떼면 지출 재계산 | F020:3968 refresh_expense_from_receipts | 승인 뒤 떼기 없음(05) · 확인 풀림은 06-11 |

260907에는 명시적 「확인 전/확인됨」 상태가 없다. 옛 코드에만 있는 규칙(금액 바뀜 기안자 알림 · 채택 때 부가세 · 날짜 동기화)은 구현하지 않았다.

## 독립 DOM 감사 항목(오케스트레이터 — CI=true · 375 · 320 · 768 · 1280)

1. S4 확인부: `증빙 금액` 값 + 2행 · 3차 `바꾸기`(valueRow) · 서버 계산 한 줄(TaxParts — 묶음 사이에서만 꺾임) · Q-F 한 줄(`.drift`, 숫자만 700) · 확인 줄(StatusTag text 변형) · 2행 `{사람} MM-DD HH:mm · 전 → 새`(nowrap 묶음). 320 가로 넘침 없음.
2. 열린 금액 칸(F2 · 바꾸기): `--field-w-short` · 높이 `--field-h` · `확인하면 전 → 새` 힌트 · 칸 오류 자리 · 1차 비활성 이유 `증빙 금액 없음` 한 자리.
3. 1차 `증빙 확인 Ctrl+Enter`(P2) · P5의 1차 + 2차 `지급 취소` 한 줄 배치 · 폰 고정 행동 줄 44px.
4. 선결제 2행 `증빙 N일 경과` 글자 크기(`--text-aux` 실측 vs UI-SPEC `--text-tag`).
5. 지급 권한 없는 사람 · 대표: 확인부 버튼 0 · `확인은 경영관리`.

## Known Stubs

없음. `getPaymentView` 지급 뒤 갈래의 `evidenceTaxLine: null`은 UI-SPEC 「지급 뒤 문서에는 서버 계산 한 줄이 없다」의 의도된 값이다.

## Threat Flags

없음 — 새 표면(confirmEvidenceAction · previewPayable 증빙 금액 입력 · 지문 입력)은 계획 위협 표 T-06-26 ~ T-06-30g에 있고 각 mitigate를 적용했다.

## 요구사항 표시

`requirements ready-ids 06-06-PLAN.md EVID-02 EVID-03` → 둘 다 blocked(같은 요구사항의 다른 06 플랜이 남음). EVID-02는 06-04 때 이미 Complete, EVID-03은 표시하지 않는다(한 번 표시된 것을 되돌림).

## Self-Check: PASSED
