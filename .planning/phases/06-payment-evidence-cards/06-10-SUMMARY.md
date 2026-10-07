---
phase: 06-payment-evidence-cards
plan: 10
subsystem: expenses form (선결제 · 증빙 금액 · 증빙일) · document evidence section (증빙 면제)
status: complete
tags: [EXP-13, EVID-03, D-603, D-611, O-4, EA-1, I-2, S4-empty, S6, C6]
requires: ["06-03", "06-04", "06-06", "06-27", "06-28"]
provides:
  - "선결제 제출 표 단계(⑧ 바로 앞) · PREPAID_REASON_REQUIRED · 선결제면 ⑧ 증빙 없음 풀림"
  - "기안자 증빙 금액 · 증빙일 칸(expenseDraftFieldsSchema 공용) · EA-1 부가세 포함 금액 저장 막힘"
  - "waiveEvidence(domain) · waiveEvidenceAction · 끌 수 없는 행동 로그 evidence_waive"
  - "증빙 섹션 3차 `증빙 면제` + 확인 모달 · S4 empty 줄 · 읽기 줄 `선결제 사유`"
  - "I-2: 지급 완료 문서의 증빙 금액 바꾸기 서버 거부(사용자 결정 10/7 09:08)"
affects: ["06-11", "06-12", "06-26"]
tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약 — 권한 · 사전 조회는 tx 밖, tx 안은 tx 리포지토리 · recordAction(…, { tx })"
    - "E-26 장벽 경합 — deps.afterLock + deferred + waitForLockWaiter"
key-files:
  created:
    - test/integration/evidence-waive-prepaid.test.ts
    - test/e2e/evidence-waive-prepaid.spec.ts
    - docs/design/checks/2026-10-07-06-10-prepaid-waive.md
  modified:
    - domain/expenses/gate.ts
    - domain/expenses/index.ts
    - domain/expenses/draft-fields.ts
    - domain/expenses/dto.ts
    - repositories/expenses.ts
    - domain/evidence-reviews/index.ts
    - domain/action-log/record.ts
    - app/(app)/expenses/[id]/expense-form.tsx
    - app/(app)/expenses/[id]/page.tsx
    - app/(app)/expenses/new/page.tsx
    - app/(app)/expenses/[id]/evidence-review-section.tsx
    - app/(app)/expenses/[id]/expense-document.tsx
    - app/(app)/expenses/[id]/actions.ts
    - app/(app)/expenses/[id]/actions.registry.ts
    - test/unit/domain/expenses/submit-gate.test.ts
    - test/e2e/payment-single.spec.ts
key-decisions:
  - "면제 모달은 payment-action-row.tsx(금지 파일)가 아니라 evidence-review-section.tsx 안에 둔다 — 지급 취소 모달과 같은 ConfirmDialog 꼴"
  - "선결제 사유 문구는 서버 상수 한 곳(PREPAID_REASON_REQUIRED) — 화면은 서버 이유를 그린다"
  - "지급 완료 문서의 빈 증빙 금액 채우기는 허용(P5 교착 회피) — 있는 금액 바꾸기만 거부"
metrics:
  plan_head_before: 171d5f785d2459b56f019555af69c1931166b436
  commits: 8
  tasks: 3
  completed: 2026-10-07
actuals:
  tokens: 21000
  tasks: 3
  commits: 8
plan_head_before: 171d5f785d2459b56f019555af69c1931166b436
commits: 8
---

# Phase 06 Plan 10: 선결제 · 기안자 증빙 · 증빙 면제 Summary

기안자가 폼에서 선결제 + 사유 · 증빙 금액 · 증빙일을 적어 증빙 없이 제출할 수 있고(EXP-13 · EVID-03), 경영관리가 증빙 없는 결재 통과 문서를 사유와 함께 면제해(D-603 · D-611, 끌 수 없는 로그) 지급 게이트를 여는 서버 · 화면 한 묶음.

## 계획 이름 → 실제 표 (06-27)

| 계획 이름 | 실제 Drizzle 이름 |
|---|---|
| `expenses.prepaid` | `expenses.prepaid` (boolean, default false) — `db/schema/expenses.ts:57` |
| `expenses.prepaid_reason` | `prepaidReason` / `prepaid_reason` — `:58` |
| `expenses.evidence_amount` | `evidenceAmount` / `evidence_amount` (bigint) — `:59` (DTO 이름 `evidenceAmountKrw`) |
| `expenses.evidence_date` | `evidenceDate` / `evidence_date` (date) — `:60` |
| `expenses_prepaid_reason_check` | 있음 — `:85` |
| 확인 기록 `waive_reason` | `expenseEvidenceReviews.waiveReason` — `db/schema/expense-payments.ts:64` (표 이름 `expense_evidence_reviews`, 계획의 상태 `waived` 문자열) |
| 행동 종류 `evidence_waive` | **없었음 → 이 플랜이 `domain/action-log/record.ts` 세 배열에 더함**(`:51` · `:89` · `:118`) |

C4(`evidenceTypeInactive` · `paymentMethodInactive`)는 있었다 — 선결제 단계는 그 두 단계 · 공급가 0 단계 뒤, ⑧ 바로 앞이다.

06-10 시작 커밋 = `171d5f785d2459b56f019555af69c1931166b436`. 원장 `plan_head_before` = 같은 값, `git rev-list --count` = 8.

## 커밋 (8)

| # | 해시 | 내용 |
|---|---|---|
| 1 | 5ad958f | test RED — 제출 표 선결제 단계 |
| 2 | 31f4169 | feat Task 1 트레이서 — 선결제 칸 · 제출 표 · ⑧ 풀림 · 문서 화면 읽기 줄 |
| 3 | a52736e | test RED — 기안자 증빙 금액 · 증빙일 · 선결제 · EA-1 통합 |
| 4 | 89064e8 | feat Task 2 — 칸 검증 · O-4 · EA-1 저장 막힘 |
| 5 | a32647e | fix — 지급 완료 문서 증빙 금액 바꾸기 서버 거부(I-2) + P5 `바꾸기` 숨김 |
| 6 | b32bbf5 | test RED — 증빙 면제 통합 |
| 7 | bed2830 | feat Task 3 서버 — `waiveEvidence` · `waiveEvidenceAction` · `evidence_waive` 로그 |
| 8 | 5c885e7 | feat Task 3 화면 — 면제 모달 · S4 empty 줄 · E2E |

## 260907 대조 (표만 — 구현 없음)

입력: `.planning/research/ERP260907-CONTEXT.md` · `/mnt/project-files/notes/260907-gap/gap-audit.md` · `/mnt/project-files/notes/260907-audit-full/REPORT.md` · `/mnt/project-files/notes/06-review/06-vs-260907-code.md`. 260907 경로는 `/home/user/erp_plant8_260907/server/src/…`.

| 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|---|---|---|
| 선결제면 증빙 0 제출 허용 | `expenses.ts:2152-2193`(증빙 · 첨부 · 선결제 · 면제 중 하나) | `domain/expenses/gate.ts:111` ⑧ `evidenceCount === 0 && !prepaid` | 같음(핵심) — 260907은 첨부 파일 · 면제도 제출 근거로 인정, 우리는 면제를 결재 통과 뒤 지급 게이트에서 처리(D-603) → 계획 결정 |
| 선결제 사유 필수 | `expenses.ts:2146-2151`(사유 · 예상 수령일 필수) · 사유 코드목록 `prepay_reason_id` + `prepay_reason_text`(`:3336-3337`) | `gate.ts:44` · `:110` · DB CHECK `db/schema/expenses.ts:85-86` | 같음(필수) / **숨은 규칙 H1**: 260907은 선결제 사유를 코드 목록 + 자유 글, 우리는 자유 글 한 칸 |
| 예상 수령일(기한) | `expenses.ts:983-990` `FILL_EXPECTED_RECEIPT_DATE` — 제출 때 `coalesce(issue_date, 오늘) + expense.prepay_receipt_days`를 저장 | 지급일 + `evidence.prepaid_due_days`를 읽을 때 셈(06-06 `prepaidDueInfo`), 폼 힌트 `증빙 기한 지급일부터 N일`(`expense-form.tsx` · `domain/expenses/index.ts` `listExpenseFormOptions`) | 계획 결정(EXP-13 — 기준일이 증빙일이 아니라 지급일, 값을 저장하지 않음) |
| 선결제 켜고 끄기 | 제출 뒤 수정 창이 막힘(`expenses.ts:4359` 편집 가능 상태만) | `saveExpenseDraft` 편집 가능 상태만(O-4), 쓰기 함수 추가 0 | 같음 |
| 증빙 금액 입력 주체 | 증빙(영수증) 줄이 금액을 갖고 사람이 맞춘다(`expenses.ts:5497` `whyCannotAdoptReceiptAmounts`) | 기안자 칸 `evidenceAmountKrw` + 경영관리 「금액 고쳐 확인」(06-06) | 계획 결정(C6 기안자 몫) |
| 지급 뒤 금액 변경 막힘 | `expenses.ts:5509-5513` `paidDate !== null` → 409 「이미 지급이 나간 건입니다」 | `domain/evidence-reviews/index.ts:197` `EVIDENCE_AMOUNT_PAID_LOCKED` · `:54` | 같음(사용자 결정 10/7 09:08 — I-2). 단 우리는 빈 금액 채우기는 허용 |
| 증빙 면제 조건 | `expenses.ts:6299-6307`(이미 면제 409 · 증빙 있으면 409) | `domain/evidence-reviews/index.ts:274-276` `WAIVE_HAS_EVIDENCE` · `WAIVE_ALREADY` | 같음 |
| 면제 권한 | 별도 권한 `expense.waive_receipt`(`expenses.ts:6283`) | `expenses.payments` write(`domain/evidence-reviews/index.ts:256`, `actions.registry.ts:18`) | 계획 결정(D-601) |
| 면제 사유 | 코드 목록(`reasonId`) 또는 자유 글(설정 `waiveFreeText`일 때만), 200자(`expenses.ts:6288-6313` `whyWaiveReasonBad`) | 자유 글 한 칸, 최대 480자(`actions.ts:waiveEvidenceSchema`) | **숨은 규칙 H2** |
| 면제 기록 | 감사 기록(`asActor`) + 문서 칸 5개 | 확인 기록 `waived` + 끌 수 없는 로그 `evidence_waive`(`domain/action-log/record.ts:51` · `:89` · `:118`) | 같음(견제는 기록뿐) |
| 면제 알림 | 올린 사람에게 「증빙 없이 닫혔습니다」(제 건이면 생략, `notify.approval_result` 설정, `expenses.ts:6330-6360`) | 없음 | **숨은 규칙 H3**(알림은 Phase 7 추정 — 넘김) |
| 면제 되돌리기 | `POST …/unwaive-receipt`(`expenses.ts:6391-`) 수동, 감사 기록 | 수동 경로 없음. 승인 뒤 증빙이 새로 붙으면 06-11 훅이 자동 해제(06-11-PLAN:35) | 계획 결정(수동 되돌리기 없음 — 사용자 질문 후보 Q6) |

숨은 규칙 수: **3**(H1 선결제 사유 코드 목록 · H2 면제 사유 코드 목록 / 자유 글 설정 · 200자 · H3 면제 알림).

## 캡처 · GPT 검사 대상 경로

| 경로 | 바뀐 요소 | 데이터 조건 |
|---|---|---|
| `/expenses/{작성 중 id}` | 증빙 묶음: `증빙 금액` · `증빙일` · `선결제`(체크) · `선결제 사유`(켤 때) + 힌트 `증빙 기한 지급일부터 14일` · 칸 오류 · 1차 옆 막힘 `선결제 사유 없음 · 사유 적기` | 작성 중 문서(기안자), 선결제 켬 · 사유 비움 / 증빙 금액 0 · 13,640,000(EA-1) 오류 |
| `/expenses/new` | 같은 칸 | 팀 비용 새 문서 |
| `/expenses/{결재 통과 · 지급 전 · 증빙 필수 on · 증빙 0 · 선결제 아님}` (지급 권한자) | 증빙 섹션 `확인` 줄: S4 empty `증빙 없음 · 기안자 {이름}`(danger) + 3차 `증빙 면제` | 증빙 필수 on, 증빙 전부 무효 |
| 위 문서에서 `증빙 면제` 클릭 | 확인 모달: 제목 · 부제 · 결과 줄 · 사유 칸 · 1차 `증빙 면제 Ctrl+Enter`(사유 비면 비활성 + `사유 없음 · 사유 적기`) | 지급 전(P3) / 지급 뒤(P6: 결과 줄 `지급 기록 그대로 …`) / 선결제 상태(결과 줄 `선결제 증빙 기한 없어짐`) |
| 면제 뒤 같은 문서 | `확인` 줄 `면제` + 2행 `{이름 HH:mm} · {사유}` · 1차 `지급 완료`로 포커스 | 면제된 문서 |
| `/expenses/{선결제 제출 · 지급 완료}` | `선결제` 낱말 + 2행 `증빙 기한 MM-DD` · 읽기 줄 `선결제 사유` | 선결제 문서 지급 뒤 |
| 폰 320 · 375 · 태블릿 768 · 1280 | 위 모두(체크박스 44px · 모달 폭 · 사유 줄바꿈) | 독립 DOM 감사 대상 |

## 화면 검토 증거

(오케스트레이터가 채움)

## 사용자 질문 후보

| # | 무엇을 골랐나 | 왜 | 다른 안 |
|---|---|---|---|
| Q1 | 지급 완료 문서의 증빙 금액 바꾸기 거부 문구 `지급 완료 문서 · 증빙 금액 못 바꿈 · 새로 고침`(UI-SPEC에 없음, 기존 「… · 새로 고침」 명사형) | 사용자 결정 10/7 09:08 | 지급 취소 뒤 고치기 안내 포함 문구 |
| Q2 | 지급 완료 뒤에도 **비어 있는** 증빙 금액 채우기는 허용 | 거부하면 P5(확인 전 · 금액 비어 있음)가 풀리지 않는 교착이 생김 | 「누구도 못 고침」 글자 그대로 — 지급 뒤에는 빈 금액도 거부하고 취소 뒤 입력 |
| Q3 | 면제 사유 최대 길이 480자, 초과 문구 `사유 480자 넘음 · 줄여 적기` 재사용 | 지급 취소 사유와 같은 한도 | 260907 200자 |
| Q4 | S4 empty 줄 `증빙 없음 · 기안자 {이름}`이 1차 옆 막힘 글자와 같아 한 화면에 두 번 보임 | UI-SPEC 「Empty — 문서 화면 증빙」 원문 + 06-04 막힘 원문 둘 다 있음 | 한쪽을 줄이기(디자인 결정) |
| Q5 | `/expenses/new`의 선결제 켜기는 첫 저장 전에는 ⑧을 풀지 못함(NEW_DOC_BLOCK 그대로) | 새 문서는 저장 전 제출 불가가 05 규칙 | 새 문서도 선결제 즉시 제출 허용(05 변경) |
| Q6 | 면제 수동 되돌리기 경로 없음(승인 뒤 증빙이 붙으면 06-11 자동 해제) | 계획에 없음, 260907에는 있음 | 경영관리용 `면제 취소` 3차 + 로그 |
| Q7 | 260907 숨은 규칙 H1~H3(선결제 · 면제 사유 코드 목록, 면제 알림) 채택 여부 | 구현 금지 지시 | 채택 시 사유 코드표 + 알림은 Phase 7 |

## 플랜 밖 변경

| 파일 | 이유 |
|---|---|
| `app/(app)/expenses/[id]/expense-document.tsx` | 증빙 섹션에 `PrepaidReasonLine`(읽기 줄)을 놓고 `waiveSubtitle`(문서 번호 · 대상 · 금액)을 `EvidenceReviewBlock`에 넘기려면 이 파일이 필요(섹션이 번호 · 대상 · 금액 계산을 갖지 않는다) |
| `test/e2e/payment-single.spec.ts` | S4 empty 줄이 늘어 `증빙 없음 · 기안자 …` 글자가 화면에 둘이 되어 strict 기대(`toBeVisible`)를 `toHaveCount(2)`로 정정(기대 정정 수준) |
| `docs/design/checks/2026-10-07-06-10-prepaid-waive.md` | design-gate 훅이 화면 파일 커밋에 점검표를 요구 |
| `domain/evidence-reviews/index.ts` `confirmEvidence` I-2 가드 + 화면 `바꾸기` 숨김(P5) | **사용자 결정 10/7 09:08(06-06 검토 I-2)**: 지급 완료 문서는 누구도 증빙 금액을 못 고치게 서버가 막음. 이전 plan_notes 3번(막지 않음)은 이 지시로 바뀜. 서버 거부 `EVIDENCE_AMOUNT_PAID_LOCKED`, 잠금 뒤 판정(260907 `expenses.ts:5509` 참고) |
| `domain/expenses/index.ts` `listExpenseFormOptions` 반환형 | `prepaidDueDays`를 더해 시그니처 줄(유일한 `export … function` 변경 줄)이 바뀜 — 새 쓰기 함수는 아님(O-4 grep 참고) |
| 기한 일수 읽기 | `loadPrepaidDueDays`(evidence-reviews)는 import 순환 때문에 `domain/expenses`에서 못 불러 `getSettingValue(EVIDENCE_PREPAID_DUE_DAYS)`를 직접 읽음 |

## 넘김

- `domain/payments/action-row.ts` P5 `tertiary: "change"`는 서버가 여전히 냄(소유 06-04 · 06-06) — 화면에서만 숨김. 서버 행 자체를 바꾸려면 그 플랜.
- 06-11 훅: 승인 뒤 증빙이 붙을 때 면제를 해제하는 훅은 06-11 소유. `evidence_waive` 로그는 끌 수 없는 종류로 남는다.
- 면제 알림 · 사유 코드 목록(H1 · H3)은 Phase 7 알림 / 사용자 결정 후.
- TDD 편차: Task 1 E2E(`선결제 → 제출 → 지급`)는 구현 뒤에 썼다(E2E RED 없음). 단위 · 통합은 RED → GREEN 커밋 순서대로.

## 검증 결과

| 명령 | 통과 | 실패 |
|---|---|---|
| `vitest --project unit` (expenses 폴더 · action-log/record · action-registry-completeness · leak-scan-coverage · import-cycles, 12 파일) | 128 | 0 |
| `vitest --project integration` (evidence-waive-prepaid · evidence-reviews · expense-payments · expense-payments-concurrency · expense-create-fields · expense-draft-guards · expense-submit-concurrency, 7 파일, DB erp_e0610_test) | 118 | 0 |
| `CI=true playwright --project=desktop` evidence-waive-prepaid + payment-single + expense-form (1차 돌림) | 33 | 1(내 면제 E2E의 칸 이유 단언 — 아래 고침) |
| 같은 스펙 evidence-waive-prepaid 재실행 | 3 | 0 |
| `pnpm lint` · `pnpm typecheck` | 0 오류 | — |
| `pnpm build` | E2E의 `CI=true` 프로덕션 빌드가 두 번 성공(로컬 전용 `next.config.ts` turbopack root는 되돌림 — 커밋 안 함) | — |

참고: 1차 돌림의 payment-single 실패(`12,400,000` strict 중복)는 면제 모달 부제가 증빙 블록 안에 있던 탓 — 모달을 블록 밖 · 면제 권한자에게만 렌더하도록 고쳐 payment-single · expense-form 33개가 통과했다. `pnpm test:unit` 전체 · 전체 통합 · 전체 E2E는 지시대로 돌리지 않았다(CI 몫).

## 인수 grep

- O-4(새 쓰기 함수 없음): `git diff 171d5f785d2459b56f019555af69c1931166b436 -U0 -- domain/expenses/index.ts | grep -E '^[+-]export (async )?function'` → `-export async function listExpenseFormOptions(viewer…): Promise<{ evidence; payment }>` / `+export async function listExpenseFormOptions(` 한 쌍(반환형에 `prepaidDueDays` 추가, 쓰기 함수 아님). `--name-only -G "^export (async )?function"` 출력은 이 시그니처 줄 때문에 `domain/expenses/index.ts` 한 줄이다 — 새 export 함수 0.
- `waiveEvidence` 함수 줄 범위: `domain/evidence-reviews/index.ts:251-293`, `withTransaction` 콜백 `:266-284`.
- 06-03 tx 규약: `sed -n '266,284p' domain/evidence-reviews/index.ts | grep -v '^\s*//' | grep -cE '\b(can|getSettingValue|loadPaymentInputs|loadPrepaidDueDays)\('` → **0**. 콜백 안은 `lockExpenseForUpdate` · `findExpenseApprovalInstance(…, tx)` · `hasEvidence(…, tx)` · `findReviewByExpense(…, tx)` · `upsertReview(…, tx)` · `bumpExpenseVersion(…, tx)` · `recordAction(…, { tx })` · `findLivePayment(…, tx)`.
- `document_update`(면제 경로 `:251-293`) → **0**(파일의 `document_update`는 `:206` `confirmEvidence`뿐).
- `evidence_waive` in `domain/action-log/record.ts` → 3건(`:51` · `:89` · `:118`), `domain/evidence-reviews/index.ts:281` 1건.
- `grep -c afterLock domain/evidence-reviews/index.ts` → 3(≥2). `grep -c waitForLockWaiter test/integration/evidence-waive-prepaid.test.ts` → 2(≥1).
- `grep -c -e "--faint" -e 'className="num"' "app/(app)/expenses/[id]/evidence-review-section.tsx"` → 0(C12).
- 「면제 동시 두 요청」 RED 확인: `waiveEvidence`에서 `lockExpenseForUpdate`를 `findExpenseById`로 잠시 바꿔 돌리면 `waitForLockWaiter: 4000ms 안에 잠금 대기 연결이 생기지 않았다`로 빨갛게 된다(복원 뒤 녹색, `git diff` 0).

## Deviations from Plan

**1. [Rule 2 - 사용자 결정] 지급 완료 문서 증빙 금액 변경 서버 거부(I-2)** — 위 「플랜 밖 변경」. 커밋 a32647e.

**2. [Rule 1 - 테스트 정정] payment-single 기대** — 위 「플랜 밖 변경」. 커밋 5c885e7.

**3. [Rule 1 - lint] 통합 테스트 `expect.any(Number)` any 경고** — `typeof …overdueDays` 단언으로 교체. 커밋 5c885e7.

## Known Stubs

없음(스캔: `TODO` · `FIXME` · `placeholder` · 빈 값 UI 경로 0).

## Threat Flags

없음 — 새 서버 액션 `waiveEvidenceAction`은 플랜 threat_model 범위(`expenses.payments` write 등록 · 서버 권한 · 사유 필수 · 끌 수 없는 로그)다. I-2 거부는 위협 완화이지 새 표면이 아니다.

## 화면 검토

점검표 `docs/design/checks/2026-10-07-06-10-prepaid-waive.md` 전 항목 체크(근거 포함). 새 색 · 서체 · radius 0, CSS 파일 변경 0.

## Self-Check: PASSED

파일 6건 · 커밋 8건 모두 확인.

## 검토 반영 (06-10-review.md · 06-10-dom-audit.md)

| 지적 | 처리 | 커밋 | 테스트 |
|---|---|---|---|
| B-1 EA-1이 새 팀 비용 첫 저장에서 빠짐 | EA-1 판정을 `assertEvidenceAmountNotTaxInclusive`(`domain/expenses/index.ts`) 하나로 옮겨 `saveExpenseDraft`(합친 행)와 `createTeamExpenseDraft`(칸 값)가 함께 부름 | eb56fae(RED) · 2891ca9 | 통합 「새 팀 비용 첫 저장 — EA-1」 RED → GREEN |
| I-1 지급 뒤 빈 증빙 금액 채우기 예외 | 추천안 (a): `paidEvidenceAmountRejection`(`domain/evidence-reviews/index.ts`) 한 함수가 지급 완료 문서 판정 — 있는 금액 수정 거부(기존) · 빈 금액은 지급 기록 `gross_supply_krw`와 같은 값만, 다르면 `지급 공급가와 다름 · 지급 취소 뒤 고치기`. 잠금 뒤 같은 tx. 지급 전 동작 그대로 | df7264a(RED) · 2261fa1 | 통합 같은 값 허용(녹색 유지) · 다른 값 거부(RED → GREEN) · 있는 값 수정 거부(기존) |
| I-2 면제 E2E가 전역 `evidence.required`를 바꿈 | 면제 E2E에서 설정 쓰기를 뺌. 증빙 필수 켬 · 끔 어느 쪽이든 서는 3차 `증빙 면제` 흐름만 단언(P3 전용 단언 `aria-disabled` · S4 empty 줄은 E2E에서 뺌 — DOM 감사 실측으로 남음) | 44238d4 | `--workers=2` evidence-waive-prepaid + payment-single 22/22, + expense-form 35/35 |
| D-1 P6 면제 뒤 포커스가 2차 `지급 취소` | 결과 글자 `payment-result`를 먼저 찾고 없으면 고정 줄 버튼(P4 1차) | 44238d4(RED) · 12c042f | E2E 「지급된 선결제 문서(P6) → 포커스는 결과 글자」 RED → GREEN |
| D-2 증빙 금액 서버 오류가 고친 뒤에도 남음 | 증빙 금액 onChange에서 그 칸 오류 지움(증빙일은 지시 범위 밖 — 그대로) | 44238d4(RED) · 12c042f | E2E EA-1 케이스 RED → GREEN |
| D-3 선결제 끄고 켜면 사유 되살아남 | 끌 때 `setPrepaidReason("")` | 12c042f | E2E 끄고 켜면 빈 칸(D-4 RED 뒤라 RED 단계 미도달 — GREEN 확인) |
| 검토 S-6 서버 오류를 화면 값으로 짐작해 사유 칸에 붙임 | 같은 곳 — `message === PREPAID_REASON_REQUIRED`일 때만 사유 칸 오류 | 12c042f | (E2E 첫 케이스 녹색) |
| D-4 `선결제`가 첨부 영역 바로 아래 아님 | `선결제` · `선결제 사유`를 첨부 영역 바로 뒤로, 그다음 증빙 금액 · 증빙일 | 44238d4(RED) · 12c042f | E2E 위치 단언 RED → GREEN |
| 검토 S-3 새 문서 선결제 사유 검사 테스트 없음 | 통합 「새 팀 비용 첫 저장 — 선결제 · 사유 빔 거부」 1개(기존 동작이라 처음부터 녹색) | eb56fae | 통합 |

- 고치지 않음(지시): S-1 P5 서버 `tertiary: "change"`(06-04 · 06-06 소유), S-2 · S-4 · S-5(D-3과 같음 — 고침) · S-7 · 관찰 O-1~O-7, 260907 숨은 규칙.
- 점검표: `docs/design/checks/2026-10-07-06-10-review-fixes.md`.
- 캡처 대상 추가: `/expenses/{작성 중 id}` 증빙 묶음 칸 순서(첨부 → 선결제 → 사유 → 증빙 금액 → 증빙일) · 지급된 선결제 문서 면제 뒤 포커스. O-7 정정: 면제 2행은 `{이름} {MM-DD} · {사유}`(코드 · UI-SPEC과 같음).
- 검증: 통합 5파일(evidence-waive-prepaid · evidence-reviews · expense-payments-concurrency · expense-team-attribution · expense-create-fields) 74/74 · 단위(domain/expenses · domain/evidence-reviews · import-cycles · leak-scan-coverage) 146/146 · `pnpm lint` · `pnpm typecheck` rc 0(잠금 안) · E2E `CI=true --project=desktop --workers=2` evidence-waive-prepaid + payment-single + expense-form 35/35(두 스펙 짝은 22/22로 한 번 더).

- PR #183 합본 게이트(wt/06-gate1 · erp_g1_test) /review B-1: 지급 뒤 빈 증빙 금액 판정을 「고친 금액을 그 지급일 같은 세금 규칙으로 다시 셈한 지급 총액 = 지급 기록 payable_krw」로 바꿈(사용자 결정 10/7 11:04 「지급액과 같을 때만」 — 부가세 · 원천징수 · 세금 없음 같은 기준, 스키마 없음) · 판정 재료는 트랜잭션 전 `paidPayableBasis`, 잠근 뒤 다른 지급이면 동시성 거부 — 810c8e1a(acef84b9 RED) · 통합 세 갈래 + 원천징수 무효 경로 + 경합 1 · 돌연변이 2. 남음: 원천징수 10원 절사로 지급 총액이 같은 이웃 금액(한두 값)도 통과(사용자 질문 후보) · I-2(기안자 증빙 금액 지위)는 사용자 결정 대상이라 그대로.

### 사용자 질문 후보(검토 반영분)

| # | 무엇을 골랐나 | 왜 | 다른 안 |
|---|---|---|---|
| Q7 | 검토 I-1 (a): 지급 뒤 빈 증빙 금액은 지급 기록 공급가와 같은 값만 받음, 다르면 `지급 공급가와 다름 · 지급 취소 뒤 고치기`(새 문구 — UI-SPEC에 없음, 기존 I-2 문구와 같은 명사형) | 장부 · 통장이 갈리지 않고 P5 교착도 없음(검토자 추천) | (b) 지급 뒤에는 금액 없이 확인만 · (c) 전부 거부(지급 취소 → 확인 → 다시 지급) · (d) 예외 유지 — 판정은 `paidEvidenceAmountRejection` 한 함수라 다른 안도 그 함수만 바뀜 |
