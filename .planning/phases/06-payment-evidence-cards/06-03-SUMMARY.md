---
phase: 06-payment-evidence-cards
plan: 03
subsystem: payments
tags: [payments, money, tax, transaction, gate, expense-document, e2e, concurrency, risk-money]
requires:
  - phase: 06-payment-evidence-cards
    provides: "06-27 expense_payments 스키마(CHECK 묶음 · expense_payments_live_uniq) · expenses.evidence_amount/evidence_date · 메뉴 expenses.payments"
  - phase: 05-expense-approval-leave
    provides: "lockExpenseForUpdate · findExpenseApprovalInstance · pickTaxDates · incomeTypeFor · computeExpenseTax · countActiveByOwner · listAliveByOwners · voidEvidence · ExpenseDocument · setupExpenseE2E"
provides:
  - "domain/money/tax.ts loadTaxRates · TaxRates · taxRatesReader(트랜잭션 전 세율 사전 조회)"
  - "domain/payments: pickPaymentAmount · decidePayable · loadPaymentShared · PaymentShared · loadPaymentInputs · judgeLockedPayment · completeExpensePayment · getPaymentView · PAYMENT_VIEW_DTO_SPEC · PayableChangedError · BasisChangedSignal"
  - "domain/payments/action-row.ts approvalGateDecision · resolveExpenseActionRow(P0 · P4 · P6) · ExpenseActionBar"
  - "게이트 규칙 payment.approval-required"
  - "domain/evidence/has-evidence.ts hasEvidence · ownersWithEvidence"
  - "repositories/expense-payments.ts insertPayment · findLivePayment · bumpExpenseVersion"
  - "completeExpensePaymentAction + 문서 화면 지급 섹션 뼈대(PaymentPanelProvider · PaymentSection · PaymentActionRow · PaymentLoadError)"
  - "통합 픽스처 makePaymentManager · setEvidenceRequired · approvedExpenseWithEvidence · approvedExpenseWithoutEvidence"
affects: [06-04, 06-06, 06-10, 06-11, 06-13, 06-15, 06-17, 06-20, 06-23]

actuals:
  tokens: 25181
  tasks: 2
  commits: 2
plan_head_before: 4c55b8665ff84dfeb2a4236ca7ed40284e2453eb

tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약: 권한 · 설정 · 세율 · 코드표 · 결재 단계 이름은 트랜잭션 전에 읽어 인자로, tx 안은 tx 리포지토리 + 순수 함수 + recordAction(…, { tx })만"
    - "세율 사전 조회(loadTaxRates) → taxRatesReader로 applyTaxRule에 주입 — 05 세금 함수 서명 그대로"
    - "잠금 뒤 판정은 DB 없는 judgeLockedPayment(게이트 → 기준 재판정 → 지급 총액 → 화면 값 비교)"
    - "지급 뒤 정본은 지급 기록(E-22) — getPaymentView는 기록 값, 문서 화면은 05 세율 바뀜 줄 숨김"
    - "PR #75 꼴 결정적 교착 재현(풀 밖 Client 행 잠금 + pg_blocking_pids 재귀 폴링 + 10초 race)"

key-files:
  created:
    - domain/payments/index.ts
    - domain/payments/action-row.ts
    - domain/evidence/has-evidence.ts
    - repositories/expense-payments.ts
    - app/(app)/expenses/[id]/actions.ts
    - app/(app)/expenses/[id]/actions.registry.ts
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - test/unit/domain/payments.test.ts
    - test/integration/fixtures/payments.ts
    - test/integration/expense-payments-concurrency.test.ts
    - test/e2e/payment-single.spec.ts
    - docs/design/checks/2026-10-06-06-03-payment-section.md
  modified:
    - domain/money/tax.ts
    - domain/rules/register.ts
    - app/(app)/expenses/[id]/expense-document.tsx
    - app/(app)/expenses/[id]/page.tsx
    - test/unit/domain/money-tax.test.ts
    - test/integration/leak-scan.test.ts

key-decisions:
  - "06-03: 지급 전 화면의 지급 총액은 지급일 = 오늘(KST)로 셈하고, 액션은 화면이 본 payDate · expectedPayableKrw를 그대로 보낸다(비교값으로만)"
  - "06-03: 지급 섹션이 서면 위 읽기 칸의 지급 예정일 · 지급 방식은 빼고 섹션 한 자리에만 둔다(같은 사실 두 자리 금지 — UI-SPEC S5 칸 표)"
  - "06-03: 잠금 뒤 기준이 바뀌어도 기준일이 같으면 사전 조회 세율로 tx 안에서 새 값을 셈해 PayableChangedError, 기준일이 바뀌면 BasisChangedSignal → tx 밖에서 그날 세율로 다시 셈"
  - "06-03: 결재 단계 이름(stepName)은 진행 중 문서만 읽는다(막힘 이유 글자용 — 통과 여부는 잠금 뒤 tx로 읽은 결재 상태)"
  - "06-03: P6 결과 글자 `지급 완료 → 날짜 · 시각`은 지급 권한과 무관하게 모두에게 보인다(버튼이 아닌 상태 표시)"

requirements-completed: [EXP-06, EXP-09, OPS-09]

metrics:
  duration: 44min
  completed: 2026-10-06
status: complete
---

# Phase 6 Plan 03: 한 건 지급 완료 트레이서 Summary

**결재 통과 지출결의 한 건이 트랜잭션 전 세율 · 권한 사전 조회 → 05 행 잠금 → 결재 게이트 → 잠금 뒤 기준 재판정(hasEvidence tx) → 서버 재계산 지급 총액 → 지급 기록 · version + 1 · `payment_process` 행동 로그(같은 tx)를 지나 문서 화면 1차 `지급 완료`로 끝난다. 동시 지급 6건(풀 + 1)이 교착 없이 끝나는 것을 PR #75 꼴로 고정했다.**

## Performance

- **Duration:** 44 min(기록된 시작 2026-10-06T07:00:20Z — 압축 전 작업 포함 여부는 시작 기록 기준)
- **Completed:** 2026-10-06T07:44Z
- **Tasks:** 2/2
- **Files:** 18(플랜 files_modified 17 + 디자인 점검표 1 — 아래 「파일 한도」)

## Accomplishments

- `loadTaxRates`(11 키를 asOf로 순차 읽기) · `taxRatesReader`(그 값만 돌려주는 getSettingValue 대역 — 모르는 키 · 다른 날짜면 던짐)로 applyTaxRule 서명을 바꾸지 않고 tx 안 풀 읽기 0
- `completeExpensePayment` · `judgeLockedPayment` · `getPaymentView`(지급 뒤 기록 값 — E-22) · `resolveExpenseActionRow`(P0 · P4 · P6) · 게이트 `payment.approval-required`
- 문서 화면: 결재 통과 문서에만 「지급」 섹션 + 행동 줄 1차 `지급 완료`(Ctrl+Enter, 확인 모달 없음) → P6 `지급 완료` 태그 + 결과 글자(포커스 이동), 권한 없는 사람은 버튼 0 + `지급은 경영관리`, 로드 실패는 섹션 자리 한 줄 + `다시 시도`
- 테스트: 단위 payments 29 · money-tax 케이스, 통합 「지급 완료 동시 6건」 · 「hasEvidence는 넘긴 tx로 읽는다」 · leak-scan 지급 DTO 축, E2E payment-single 4건

## completeExpensePayment 서명(06-04 · 06-11 · 06-15가 쓴다)

```ts
export async function completeExpensePayment(viewer: Viewer, input: { expenseId: string; payDate?: string | null; expectedPayableKrw: number; version: number }, deps?: CompletePaymentDeps): Promise<CompletePaymentResult>
// CompletePaymentDeps = { shared?: PaymentShared; afterLock?: () => Promise<void>; now?: Date }
```

## ⓪ 선행 확인

| 항목 | 결과 | 계획 이름 → 실제 |
|---|---|---|
| 05 행 잠금 · 결재 인스턴스 | 있음 | `lockExpenseForUpdate` · `findExpenseApprovalInstance(…, tx = db)` |
| 04.1 결재 보기 | 있음 | `getApprovalView(readOnlyVisible)` |
| 05 세금 함수 셋 | 있음 | `pickTaxDates` · `incomeTypeFor` · `computeExpenseTax`(domain/expenses/tax.ts) |
| 05 증빙 | 있음 | `countActiveByOwner` · `listAliveByOwners` · `voidEvidence` · `submitReadyDraft` · `makeEvidenceManager` · `setupExpenseE2E` |
| 05 문서 화면 | 있음 | `ExpenseDocument`(expense-document.tsx) · page.tsx C1 갈래 |
| 06-27 스키마 | 있음 | Drizzle `expensePayments` · `expenses.evidenceAmount` · `expenses.evidenceDate` · CHECK(diff = transfer − payable, ≥ 0, 취소 짝) |
| 메뉴 · 낱말 · 설정 | 있음 | `expenses.payments` · status-map `지급 완료` · `evidence.required`(기본 true) |
| approved 문서의 05 행동 | 0 | TRANSITIONS approved `{}` — 1차 둘 충돌 없음 |
| 문서 종류 상수 | 있음 | `EXPENSE_DOCUMENT_KIND = "expense"`(domain/expenses/access.ts) |

## 검사 결과

- **06-03 tx 범위:** `completeExpensePayment`의 `withTransaction` 콜백 = domain/payments/index.ts **309–358행**. 금지 호출 grep(`can|visible|getSettingValue|loadTaxRates|loadPaymentInputs|loadPaymentShared|ratesFor|applyTaxRule|listCodeItems|getApprovalView`) = **0**
- **같은 tx 기록 검사:** tx 없는 recordAction = **0**, recordAction( = **1**
- **hasEvidence tx 검사:** tx 없는 hasEvidence = **0**, hasEvidence( = **1**
- `payment.approval-required` in register.ts = 1 · `lockExpenseRow` = 0 · pickTaxDates/incomeTypeFor(git grep) = 4 · payments 안 선언 0
- R-5: grossFromTotal 호출 1 · `"round"` 아닌 호출 0 · 「역산 경계」 · 「역산 경계 — 정방향 절사」 녹색
- R-4: 세 이름 그대로 녹색 · `pickPaymentAmount(` = **2**(아래 이탈 5)
- **E-23: ⒜** — main에 이미 있음(PR #167), 테스트 이름 개수 **1**(중복 구현 없음), domain/money/index.ts 커밋 제목 검사 종료 코드 0(`round` 미수정)
- E-22 · C1 E2E 이름 = 2 · E-34 = 3 · isCalendarDate 2 · DATE_FORMAT_ERROR 2 · 잎 모듈 가드 0 · zod 입력에 지급 총액 · 역산 필드 없음
- 「동시 6건」 1 · `pool.options.max` 2(숫자 6 하드코딩 없음) · 「hasEvidence는 넘긴 tx로 읽는다」 1

## RED 확인(「지급 완료 동시 6건」)

`lockExpenseForUpdate` 뒤에 `await defaultLoadTaxRates(...)`를 임시로 넣자:

```
× 지급 완료 동시 6건 — … 11194ms   Error: 다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장
```

(교착이 withTransaction의 시간 초과 변환 오류로 드러남 — 10초 race 전에 Promise.all이 거부.) 되돌린 뒤 `Tests 2 passed (2)`, `grep -c RED-TEMP` = 0, git diff에 남지 않음.

## 테스트(실행 결과)

- 단위: `pnpm test:unit` 263 files · **4065 passed**. 지정 넷(payments · money-tax · leak-scan-coverage · action-registry-completeness) 54 passed(Task 1 시점)
- 통합: expense-payments-concurrency **2 passed** · leak-scan **2922 passed**
- E2E(CI=true · desktop · --no-deps): payment-single + expense-form **17 passed**(Task 1), Task 2 뒤 payment-single **4 passed**
- `pnpm lint` 0 · `pnpm typecheck` 0 · `CI=true pnpm build` 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 타입 이름 `ExpenseActionRow` → `ExpenseActionBar`**
- **Found during:** Task 1 · **Issue:** lint `plant8/no-row-type-escape`가 domain 반환 타입 이름 /Row$/를 막음 · **Fix:** 타입만 개명(함수 `resolveExpenseActionRow`는 계획 그대로) · **Commit:** 8cb6dd5a

**2. [Rule 2 - UI 일관성] 지급 섹션이 서면 위 읽기 칸의 지급 예정일 · 지급 방식을 뺌**
- **Found during:** Task 1 · **Issue:** 계획대로 섹션에 두 칸을 두면 05 위 읽기 칸과 같은 사실이 두 자리(§8 규칙 5 · 점검표 「같은 말 두 번」) · **Fix:** `paymentView`가 뷰일 때만 위 두 행 생략(오류 · null이면 그대로) — DOM 실측 dt 각 1개 · **Files:** expense-document.tsx · **Commit:** 8cb6dd5a

**3. [Rule 3] 잠금 뒤 판정을 `judgeLockedPayment`로 떼어 냄(Task 2)**
- **Issue:** behavior 「주입한 잠근 행으로 단위 확인」은 tx 콜백 안 인라인 판정으로는 단위 테스트 불가 · **Fix:** DB 없는 순수 함수로 추출, tx 콜백은 tx로 읽은 값만 넘김. 기준이 바뀌어도 기준일이 같으면 tx 안에서 사전 조회 세율로 새 값을 셈해 PayableChangedError, 기준일이 바뀌면 BasisChangedSignal(밖에서 그날 세율로 다시 셈 — 단위는 신호까지, 변환은 기존 catch 경로) · **Commit:** bc27cb6f

**4. [Rule 1 - 테스트 가정] leak-scan 음성 단언**
- **Issue:** 시드가 모든 계급에 `expense.amount`를 켜 「못 보는 계급」이 없어 비어 있는 단언이 됨 · **Fix:** 노출표 행이 없는 탐침 계급(새 계급의 기본 숨김)으로 음성 단언 + 금액 칸 넷의 정보 항목 = expense.amount 고정 · **Commit:** bc27cb6f

### 기록할 이탈(고치지 않음)

5. **`pickPaymentAmount(` grep 2(기준 ≥ 3):** 사전 조회와 잠금 뒤 재판정이 같은 `basisOf` 하나를 거쳐 호출이 한 자리. 두 경로가 모두 이 함수를 쓰는 것은 단위 「금액 원천 바뀜(R-4)」(잠금 뒤 경로)로 확인. 규칙 한 곳 유지를 위해 grep 개수를 맞추는 중복 호출은 넣지 않았다.
6. **파일 한도:** 커밋 파일 18 = 플랜 17 + `docs/design/checks/2026-10-06-06-03-payment-section.md`. 화면 코드 커밋에 훅(design-gate)이 요구하는 절차 산출물이라 코드 파일 한도(멈춤 방아쇠 ⑴) 밖으로 판단했다 — 오케스트레이터 판단 필요 시 보고 항목.
7. **E2E는 구현 뒤 작성**(계획 순서상 ⑥) — 테스트 먼저가 아니다. 단위 · 통합 판정 함수는 RED를 거쳤다(judgeLockedPayment 미존재 7건 실패 → 녹색, 동시 6건 RED 위 기록).
8. **E2E가 공유 DB의 `evidence.required`를 false로 둔다**(계획 지시 — 06-04 게이트 대비). 되돌리지 않는다.

## DOM 감사 항목(오케스트레이터 독립 감사용 — CI=true · 1280 · 768 · 375 · 320)

1. 지급 권한자 P4: 「지급」 섹션 1개, 1차 `지급 완료` 하나(폰 높이 44 · 하단 탭 위 fixed), 05 `DocumentActions` 버튼 0, 위 읽기 칸 `지급 예정일` · `지급 방식` dt 각 1개(섹션 안만)
2. P6(지급 뒤): 1차 버튼 0, `지급 완료` 태그 + `data-testid=payment-result` 결과 글자, 지급 직후 포커스 = 결과 글자, `payment-paid-line` `지급 총액 …`(차이 0이면 차이 없음 · 부가세면 `공급가 역산`), `expense-tax-drift` 0
3. 대표(권한 없음) P4: 섹션 안 버튼 0 + 지급 예정일 2행 `지급은 경영관리`, P6: 담당 표기 없음 · 결과 글자만
4. 05 C1 작성 중 문서: 「지급」 섹션 0 · `지급 정보 불러오지 못함` 0
5. 320에서 가로 넘침 0(실행자 자체 실측: 4폭 × 4상태 scrollWidth = clientWidth, 섹션 넘침 요소 0)
6. 새 색 · 서체 · radius 없음(기존 expense.module.css 클래스 + 05 행동 줄 CSS만)

## Known Stubs

없음 — 이체액 · 지급일 · 차이 사유 칸 · 지급 취소(06-04), 증빙 확인(06-06), 계좌 행(06-20)은 계획상 뒤 플랜 몫이다.

## Threat Flags

없음 — 새 Server Action `completeExpensePaymentAction`은 계획 threat_model(T-06-08 등)에 있고 domain 첫 줄 `can(expenses.payments, write)`로 막는다.

## Next

06-04가 `PaymentShared`에 증빙 필수 · 짝 칸을 더하고 증빙 · 짝 게이트를 `judgeLockedPayment`의 결재 게이트 뒤에 붙인다.

## Self-Check: PASSED
