---
phase: 06-payment-evidence-cards
plan: 04
status: complete
subsystem: payments
tags: [payments, evidence-gate, pair-gate, payment-cancel, concurrency, s5]
requires: [06-02, 06-03]
provides:
  - "지급 섹션 S5 칸(지급일 · 이체액 · 차이 사유 · 지급 총액 미리보기)"
  - "증빙 필수 · 지급 방식↔증빙 종류 짝 게이트(rules.gate 두 규칙)"
  - "지급 예정일 제자리 저장(saveScheduledPayDate)"
  - "지급 취소(cancelExpensePayment · 끌 수 없는 payment_cancel)"
  - "PaymentAlreadyDoneError(동시 두 지급 — 사람 · 시각)"
  - "resolveExpenseActionRow P0 · P1 · P3 · P4 · P6 + 2차 cancel · 3차 waive 자리"
affects: [06-05, 06-06, 06-10, 06-11, 06-13, 06-15, 06-28]
tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약 유지 — 설정 · 코드표 · 이름은 loadPaymentShared/loadPaymentInputs(트랜잭션 전), 증빙 유무 · 선결제는 잠금 뒤 tx"
    - "트랜잭션 안 신호(AlreadyPaidSignal) → 트랜잭션 밖에서 이름을 붙인 UserFacingError"
key-files:
  created:
    - app/(app)/expenses/[id]/payment-section.tsx
    - test/integration/expense-payments.test.ts
    - docs/design/checks/2026-10-06-06-04-payment-fields.md
  modified:
    - domain/payments/index.ts
    - domain/payments/action-row.ts
    - domain/rules/register.ts
    - domain/settings/keys.ts
    - domain/action-log/record.ts
    - repositories/expense-payments.ts
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - app/(app)/expenses/[id]/actions.ts
    - app/(app)/expenses/[id]/actions.registry.ts
    - test/unit/domain/payments.test.ts
    - test/e2e/payment-single.spec.ts
    - test/integration/expense-payments-concurrency.test.ts
decisions:
  - "06-04: 증빙 · 짝 게이트는 결재 게이트 뒤 · 기준 재판정 앞(CROSS-R1 F-3) — 잠금 뒤 무효 + 증빙일 변경도 PayableChangedError가 아니라 증빙 없음"
  - "06-04: 같은 문서를 이미 지급했으면 version 비교 앞에서 PaymentAlreadyDoneError(`{사람}이 {HH:mm}에 지급 완료함 · 새로 고침`, 이름은 트랜잭션 밖)"
  - "06-04: 지급 취소는 끌 수 없는 payment_cancel(세 배열) · 행 삭제 없음 · 프로젝트 상태를 읽지 않음(완료 프로젝트도 취소 — U-4)"
  - "06-04: 지급 총액(expense.amount)을 못 보는 지급 권한자는 `지급 완료` 비활성 + `지급 총액 볼 권한 없음 · 노출 설정은 관리자`(06-03 검토 P3-4 — 새 문구)"
  - "06-04: 지급일 과거 하한 없음 유지(06-03 검토 P3-3 — 사용자 결정 카드 대기, 권장안)"
metrics:
  duration: 80min
  completed: 2026-10-06
  tasks: 3
  files: 15
plan_head_before: f3ffcc5d3f80105a051fa006fb9880000cfbe5cb
actuals:
  tokens: 35130
  tasks: 3
  commits: 10
---

# Phase 06 Plan 04: 지급 섹션 칸 · 증빙/짝 게이트 · 예정일 제자리 저장 · 지급 취소 Summary

지출결의 문서 화면 「지급」 섹션이 이체액 · 차이 사유 · 미래 지급일로 지급하고, 증빙 필수 · 짝 게이트(설정은 트랜잭션 전, 증빙 유무는 잠금 뒤 tx)로 막히며, 예정일을 제자리에서 저장하고, 사유와 함께 끌 수 없는 로그로 지급을 취소한다 — 동시 두 지급은 뒤 요청이 `{사람}이 {HH:mm}에 지급 완료함`으로 거부된다.

## Commits

| Task | Commit | 내용 |
|---|---|---|
| 1 (tracer) | 953bdbd9 | 지급 섹션 칸 — 이체액 · 차이 사유 · 미래 지급일 · `previewPayable` 미리보기 · 날짜 칸 달력 검증(E-20) |
| 2 | 16e14e97 | 증빙 · 짝 게이트 · 지급 예정일 제자리 저장 · P1/P3 행동 줄 |
| 2′ | 52044a7f | 06-03 동시 6건 테스트의 evidence.required 끄기를 beforeEach로(파일 한도 예외) |
| 3 | 233c1817 | 지급 취소 · payment_cancel · PaymentAlreadyDoneError · 권한 · 게이트 통합 테스트 · 취소 모달 |

`commits: 10`은 `git rev-list --count f3ffcc5d..HEAD` 실측이다 — 이 플랜 커밋 4건에 오케스트레이터 커밋(aa442df3 게이트 기록 · e6c5d66e fix-0630 병합)과 병합된 06-30 수정 4건이 섞여 있다.

## ⓪ 게이트 · acceptance

| 항목 | 결과 |
|---|---|
| register.ts 규칙 수(`payment.evidence-required` · `payment.method-evidence-mismatch`) | 2 |
| `EVIDENCE_REQUIRED` · 짝 키 읽기 줄 | `domain/payments/index.ts:196` · `:197` — `loadPaymentShared` 안, 아래 트랜잭션 콜백 범위 밖 |
| `completeExpensePayment` 콜백 L434–484 | 금지 호출(can · getSettingValue · loadTaxRates · listCodeItems) 0 · 같은 tx 기록 검사 0 / recordAction 1 · hasEvidence tx 검사 0 / hasEvidence 1 |
| `cancelExpensePayment` 콜백 L512–535 | 금지 호출 0 · 같은 tx 기록 검사 0 / recordAction 1 |
| `saveScheduledPayDate` 콜백 L546–573 | 금지 호출 0 · 같은 tx 기록 검사 0 / recordAction 1 |
| E-34 `loadPaymentInputs` 안 getSettingValue · listCodeItems | 0 |
| C5 · P3 `countActiveByOwner` · `pmUserId` · `담당 PM` / U-4 · C3 `project.completed-lock` · `CompletedProjectError` · `quoteLockReason` (domain/payments) | 0 / 0 |
| `domain/payments/pair.ts` · action-row `isMethodEvidencePairAllowed` · action-row `@/domain/expenses` | 없음 · 3 · 0 |
| `"payment_cancel"` in record.ts · 라벨 | 2 · `payment_cancel: "지급 취소"` 1 |
| `isCalendarDate` in actions.ts(모듈 지역 날짜 zod 하나 — 세 액션 공용) | 3(import · 정의 · 주석) |
| 통합 `waitForLockWaiter` · 「동시 두 지급 완료 — 장벽」 · 「잠금 뒤 게이트 재판정」 · 「증빙 게이트가 기준 재판정보다 먼저」 · `not.toBeInstanceOf(PayableChangedError)` · 「예정일 달력 검증」 | 2 · 1 · 1 · 1 · 1 · 1 |
| Task 1 Q6 · C12 · E-20 grep(앞 커밋 때 확인) | 날짜 상한 없음 · `\d{4}` 0 · 「날짜 형식 오류」 0 |

### RED 기록(임시 변경은 `git diff`에 남기지 않음 — cmp로 복원 확인)
- 장벽 변이(`lockExpenseForUpdate` → `findExpenseById`): `Error: waitForLockWaiter: 4000ms 안에 잠금 대기 연결이 생기지 않았다`
- 잠금 뒤 게이트 재판정 변이(`lockedHasEvidence: pre.hasLiveEvidence`): `AssertionError: expected Error: 지급일 10-06 기준 지급 총액 바뀜 · 이체액 확인 { payableKrw: … } to not be an instance of PayableChangedError`
- payment_cancel 단위: `expected [ 'login', … ] to include 'payment_cancel'` → 세 배열 추가 뒤 녹색
- 예정일 저장 · 취소 · 장벽 · 권한 통합 10건: 함수 미정의로 빨강 → 구현 뒤 녹색. Task 2 단위 27건 · Task 1 단위 6건 · 통합 5건도 실패를 먼저 봤다

## 테스트(실행 결과)

- 단위: payments · action-log/record · action-registry-completeness · settings/registry-coverage · leak-scan-coverage — 5파일 94/94
- 통합: expense-payments(27) · expense-payments-concurrency(2) · leak-scan — 3파일 2996 통과
- E2E: `pnpm db:reset:test && CI=true playwright test test/e2e/payment-single.spec.ts --project=desktop --no-deps` — 10/10
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0
- `pnpm test:unit` 전체: 4112 통과 · **1 실패 — 아래 「Deferred Issues」**

## Deviations from Plan

1. **[파일 한도 예외 — 사용자 결정 카드 대기 · 오케스트레이터 지시로 권장안 진행] `test/integration/expense-payments-concurrency.test.ts` 한 줄** (52044a7f) — `setup.ts`가 매 테스트 전 TRUNCATE + 시드로 `evidence.required`를 켬으로 되돌려 06-03의 `beforeAll` 끄기가 지워진다. 06-04 증빙 게이트가 붙자 「지급 완료 동시 6건」이 `증빙 없음`으로 빨갰다 → `beforeEach`. 같은 원인으로 이 플랜의 `expense-payments.test.ts`도 `beforeEach`.
2. **[06-03 검토 P2-1]** 지급 총액 바뀜 거부 뒤 `router.refresh()` + 미리보기 다시 받기 — 안 고친 이체액 칸이 새 값을 따른다(E2E 「지급 총액 바뀜 뒤 다시 지급」).
3. **[06-03 검토 P3-1]** 지급 권한 없는 계정 · 대표 → 지급 완료 · 취소 · 예정일 저장 · 미리보기 ForbiddenError 통합 테스트.
4. **[06-03 검토 P3-2]** 지급 방식 없음이 세금 계산 불가 문구로 나가던 것 → `지급 방식 없음 · 지출결의 확인`(단위 테스트).
5. **[06-03 검토 P3-4 · Rule 1]** `expense.amount`를 못 보는 지급 권한자가 `?? 0`을 보내 영원히 거부되던 경로 → P4 `지급 완료` 비활성 + 새 문구 `지급 총액 볼 권한 없음 · 노출 설정은 관리자`(AMOUNT_HIDDEN — UI-SPEC에 없는 문구, `/design-review` 확인 대상). 클라이언트는 지급 총액을 모르면 보내지 않는다.
6. **[Rule 3] leak-scan.test.ts(열지 않는 파일) 호환** — `PaymentViewDto` 새 칸(`diffReason` · `processedByName` · `number`)은 선택 칸, `row`는 `PaymentViewBar`(새 bar 칸 Partial). `ExpenseActionBar` 자체는 엄격.
7. **[Rule 2] `ExpenseActionBar.secondary: "cancel" | null`** — 2차 `지급 취소`를 P6 지급 권한자에게만 세우려면 클라이언트가 권한을 알아야 해서 같은 판정 함수에 자리를 더했다(06-03 단위 모양 단언 갱신).
8. **[Rule 2] `PaymentViewDto.number`** — 취소 모달 부제 `{번호} · {지급일} 지급 · {이체액}`.
9. `transferKrw` · `diffReason`은 도메인에서 선택(없으면 지급 총액 — 일괄 · 06-03 테스트 경로), 액션 스키마에서는 `transferKrw` 필수.
10. 디자인 점검표 `docs/design/checks/2026-10-06-06-04-payment-fields.md` — 훅이 요구하는 산출물(13개 밖).
11. payment-single E2E `afterAll`이 `evidence.required`를 기본값(켬)으로 되돌린다(오케스트레이터 힌트).
12. 예정일 힌트 `지급 총액 {전} → {후}`는 `previewPayableAction`을 이전 · 새 날짜로 두 번 불러 다를 때만(이전 예정일이 없으면 힌트 없음). 예정일 칸의 Form은 칸 라벨과 같은 aria-label을 두지 않는다(같은 이름 두 번).
13. Task 2 · 3 E2E는 화면을 만든 뒤 썼다(단위 · 통합은 실패 먼저).

## Open Decisions

- **P3-3 지급일 과거 하한** — 플랜 · 기록된 결정 어디에도 하한이 없어 만들지 않았다. 사용자 결정 카드(권장: 하한 없음 유지) 대기.
- **파일 한도 예외(위 1)** — 사용자 카드 대기, 권장안으로 진행.

## Deferred Issues

- **`test/unit/settings/phase6-keys.test.ts` 1건 빨강(16e14e97부터)** — 06-02 테스트가 「넷 모두 readBy 6」을 단언한다. 이 플랜 Task 2가 플랜대로 `EVIDENCE_REQUIRED` · `PAYMENT_METHOD_EVIDENCE_PAIRS`의 readBy를 지웠다(registry-coverage가 강제 — 읽는 곳이 생겼다). 13개 밖 파일이고 승인은 동시성 테스트 한 파일만이라 고치지 않았다. 제안 수정(테스트 한 곳): 루프를 `[EVIDENCE_PREPAID_DUE_DAYS, PURCHASE_ONLINE_VENDOR_NAME]`(readBy 6)과 `[EVIDENCE_REQUIRED, PAYMENT_METHOD_EVIDENCE_PAIRS]`(readBy undefined · SETTING_DEFS에 있음)로 나눈다. 같은 웨이브에서 이 파일을 쓰는 플랜 없음(06-02만, wave 2). **푸시 전 처리 필요 — 안 하면 CI unit 빨강.**

## 독립 DOM 감사 항목(CI=true · 375 · 320 · 768 · 1280)

- 지급 전 섹션: 지급 예정일 행 `valueRow`(값 + 3차 `지급 예정일 바꾸기`) 320 가로 넘침 · 44px 터치, 지급일 · 이체액 칸 · 힌트 `지급 총액 N · 차이 ±N`(오는 동안 `.stale`)
- 예정일 제자리 칸(`#payment-scheduled-date`, Form.Field short): dirty면 1차 `예정일 저장` 하나 · `지급 완료` 없음, Esc → 3차로 포커스, 저장 뒤 `지급 완료`로 포커스, 힌트 `지급 총액 {전} → {후}`
- P3: `지급 완료` aria-disabled + `증빙 없음 · 기안자 …`(block) — 폰 고정 행동 줄에서 이유 줄 꺾임
- 지급 뒤: 읽기 줄 `지급 총액 · 차이 · 공급가 역산`(taxSegment nowrap — 묶음 사이에서만 꺾임) · 차이 사유 keep-all · 결과 글자 + 오른쪽 끝 2차 `지급 취소`(폰 320에서 결과 글자와 2차가 한 줄에 들어가는지)
- 취소 모달: 부제 · 결과 줄 · 사유 칸 · 막힘 이유 한 자리(Button 자체 이유는 숨김 — §7-17) · `닫기 Esc` · 폰 시트
- 대표 · 지급 권한 없음: 지급 전 · 지급 뒤 모두 버튼 0 · 토스트 없음

## Known Stubs

없음 — 3차 `waive` 자리는 06-10이 렌더한다(판정 함수에만 있고 화면에 그리지 않는다, 플랜 ④대로).

## Threat Flags

없음 — 새 액션 둘(`saveScheduledPayDateAction` · `cancelExpensePaymentAction`)은 플랜 threat_model(T-06-18 · T-06-19)의 표면이고 `expenses.payments write` 권한 · 레지스트리 등록 · zod를 거친다.

## Self-Check: PASSED

- FOUND: app/(app)/expenses/[id]/payment-section.tsx · test/integration/expense-payments.test.ts · docs/design/checks/2026-10-06-06-04-payment-fields.md · repositories/expense-payments.ts
- FOUND: 953bdbd9 · 16e14e97 · 52044a7f · 233c1817
