---
phase: 07-schedule-notify-audit
plan: 06
subsystem: payments
tags: [payments, pay-schedule, effective-date, expenses-list, tax-basis, vendor-term, risk-money]
status: complete
plan_head_before: 054c639620d0cca3b8549de21aaac12a489f0617

requires:
  - phase: 07-01
    provides: "pay-schedule.ts 순수 함수(resolvePaySchedule · payRuleLine · payOffWeekdayText · thisWeekPayDate) · loadPaySchedules 로더"
  - phase: 07-02
    provides: "expenses.scheduled_payment_set_by/_set_at + CHECK expenses_scheduled_payment_set_check · vendors.payment_term_days"
  - phase: 07-04
    provides: "행동 로그 유형 payment_schedule_change(끌 수 없음) · buildChanges"
provides:
  - "지출결의 DTO(작성 · 상세 · 목록)의 scheduledPaymentDate = 유효 예정일(수동 ?? 자동) + scheduledPaymentManual · autoPaymentDate · paymentPushReason · paymentRuleLine · paymentOffWeekday"
  - "승인 묶음 정렬 = 미지급 승인 건의 유효 예정일(도메인 사전 정렬 → array_position) → 지급 끝난 건 실제 지급일 순 · repositories listUnpaidApprovedScheduleSources"
  - "세금 기준일 「지급 예정일」 = 유효 예정일 — 제출 스냅숏 · 미리보기 · 상세 차이 · 결재 시트 차이 · 지급 대상 · 지급 처리(사전 조회 + 잠금 뒤 판정)"
  - "domain/payments: saveScheduledPayDate(string | null → {version, offWeekday}) · moveToThisWeek · revertScheduledPayDates(부분 결과)"
  - "listPaymentTargets 반환 thisWeekMove: {payDate} | null"
  - "loadPaySchedules가 거래처 지급 기한(협력사 · 칸 있음)을 읽는다 — LoadedPaySchedule = PaySchedule & {termDays} · loadPayCalendar(years)"
  - "repositories/vendors listPaymentTermDays · expense-payments updateScheduledPaymentDate(date | null · setBy · setAt)"
affects: [07-16, 07-10, 07-14, 07-20]

tech-stack:
  added: []
  patterns:
    - "여러 건 저장의 부분 결과 — 보임 사전 조회(tx 전) → 한 tx에서 id 순 잠금 · 건마다 UserFacingError만 그 건 거부로 모음"
    - "잠금 뒤 판정은 DB 없이 — 사전 조회 때 셈한 autoPayDate를 넘겨 잠근 행의 수동 값 ?? 자동값을 세금 기준일로"

key-files:
  created:
    - test/integration/payments/effective-date.test.ts
    - test/integration/payments/move-to-this-week.test.ts
    - test/integration/expenses/approved-sort.test.ts
    - test/e2e/expense-auto-date.spec.ts
  modified:
    - domain/expenses/dto.ts
    - domain/expenses/index.ts
    - domain/expenses/list.ts
    - repositories/expenses.ts
    - domain/next-turn/phase6-items.ts
    - domain/payments/targets.ts
    - domain/payments/index.ts
    - domain/payments/pay-schedule-load.ts
    - repositories/expense-payments.ts
    - repositories/vendors.ts
    - scripts/demo-data.ts
    - test/unit/domain/expenses/list-groups.test.ts
    - test/unit/payments/pay-schedule.test.ts
    - test/integration/expense-payments.test.ts
    - test/integration/payment-batch.test.ts
    - test/e2e/payment-single.spec.ts

key-decisions:
  - "07-06: 홈 지급 묶음(phase6-items)은 loadPaySchedules를 직접 부르지 않고 같은 요청의 지급 대상 판정(judgeTargets)이 실은 PaySchedule(target.schedule)을 쓴다"
  - "07-06: 지급 처리 잠금 뒤 판정의 세금 기준일 = 잠근 행 수동 값 ?? 사전 조회 autoPayDate(PaymentInputs.autoPayDate 선택 칸 — 기존 단위 시험 리터럴을 깨지 않게)"
  - "07-06: 이번 주로의 밀리지 않은 건 거부 사유 = `마감 지나 밀림 아님 · 새로 고침`(UI-SPEC에 없는 문구 — 07-16이 화면 문구를 정한다)"
  - "07-06: PayScheduleSource.vendorTermDays(07-01 자리 칸)를 vendorId로 바꾸고 로더가 기한을 읽는다 — 문서에 쓴 기한은 LoadedPaySchedule.termDays로 돌려준다"

requirements-completed: [EXP-11, EXP-12]

actuals:
  tokens: 32746
  tasks: 3
  commits: 3

duration: "첫 커밋 02:07Z → 03:15Z(시작 시각은 압축 전 문맥에서 잃음)"
completed: 2026-10-22
---

# Phase 07 Plan 06: 유효 예정일 · 수동 지정 · 이번 주로 Summary

지출결의 목록 · 상세 · 승인 묶음 · 홈 지급 묶음 · 지급 대상 · 세금 계산 · 지급 처리가 모두 같은 유효 예정일(수동 ?? 07-01 자동)을 쓰고, 수동 지정은 영업일 · 기록 칸 · 끌 수 없는 로그로, 「이번 주로」 · 되돌리기는 부분 결과로 서버가 판정한다. 자동값은 어디에도 저장되지 않는다(D-715 · D-740).

## Tasks

| # | 이름 | 커밋 | 핵심 |
|---|------|------|------|
| 1 | 목록 · 상세 DTO 유효 예정일(트레이서) | 6a160cd2 | DTO 새 칸 5 · 상세 · 목록 · 문서 묶음이 loadPaySchedules · B-P1-1 왕복(칸 NULL 유지) · E2E expense-auto-date |
| 2 | 승인 묶음 정렬 · 세금 기준일 · 홈 묶음 | aa369d76 | listUnpaidApprovedScheduleSources → 도메인 정렬 → array_position · computeExpenseTax 네 자리 withEffectiveDate · 지급 대상 판정이 PaySchedule을 실음 |
| 3 | 수동 지정 규칙 · 이번 주로 · 되돌리기 · 지급 처리 · 거래처 기한 · 데모 | 168b1638 | saveScheduledPayDate(null = 자동 복귀) · moveToThisWeek · revertScheduledPayDates · thisWeekMove · basisOf 유효 예정일 · listPaymentTermDays · demo-data 예정일 인자 제거 |

## 검증 (실제 실행)

- 트레이서 게이트(Task 1): 통합 effective-date 3 · leak-scan(새 DB) 2파일 5,127 · E2E expense-auto-date 1 · 단위 277 — 모두 통과.
- Task 2(새 DB): approved-sort · payments/*(effective-date · pay-week-targets · holiday-rederive · approved-at) · expense-tax-snapshot · expense-list-search · next-turn — 8파일 92 통과. E2E(desktop, flock · CI=true) expense-auto-date · expense-list · next-turn-phase6 17 통과. 단위 14파일 277 통과.
- Task 3(새 DB): payments/*(move-to-this-week · effective-date · holiday-rederive · pay-week-targets · approved-at) · expense-payments · payment-batch — 7파일 114 통과. 관련 지급 묶음(새 DB): leak-scan · payment-adjustment-line · expense-payments-concurrency · payment-scope-wiring · evidence-reviews · evidence-waive-prepaid · bank-transfer-export · dual-link-concurrency · expense-list-search — 9파일 5,255 통과. demo-data 통합 26 통과. 단위 18파일 333 통과.
- E2E(desktop, flock · CI=true): payment-schedule · payment-batch · expense-auto-date 녹색, payment-single은 고친 뒤 18 통과.
- 잠금 뒤 판정 회귀 확인: judgeLockedPayment의 유효 예정일 변경을 잠시 되돌리면 effective-date 세율 경계 사례가 `지급 총액 바뀜`으로 실패 → 복원.
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build:cli` 0 · `dist/cli/demo-data.mjs`를 시험 DB(APP_ENV=local, 실행 시 만든 임시 키)에 purge → seed 실행: `demo seed complete … expenses=6`, 새 지출결의 7건 중 scheduled_payment_date 저장 0건.
- B-P1-3 두 값: 유효 예정일(미래 · VAT 17%) 기준 지급 총액 14,508,000 — 제출 스냅숏 · 미리보기 · 상세(차이 없음) · 결재 시트(경고 행 없음) · 지급 대상 · 지급 처리 미리보기 · 지급 완료 행 모두 같음. 오늘 기준 계산은 14,508,000이 아님을 같은 시험이 단언(Task 3 RED 때 지급 미리보기 오늘 기준 값 13,640,000).
- 수용 grep: loadPaySchedules( · payRuleLine( (expenses/index.ts) · scheduledPaymentManual · paymentRuleLine · paymentOffWeekday(dto.ts) · array_position(repositories/expenses.ts) · moveToThisWeek 1 · revertScheduledPayDates 1 · payment_schedule_change 2 · thisWeekPayDate( 1 · thisWeekMove 3 · scheduledPaymentSetBy 1 — 모두 충족. phase6-items는 「같은 요청의 PaySchedule」 쪽(target.schedule).
- D-740 `git diff --name-only origin/main...HEAD -- db/`: 07-06 커밋의 db/ 변경은 0(`git diff 054c6396..HEAD -- db/` 빈 출력). 지금 보이는 7파일(0039 · 0040 마이그레이션 · 스냅숏 · schema/expenses · vendors)은 아직 main에 없는 07-02 의존 머지(054c6396)에서 온 것 — 07-02가 main에 들어가면 빈 출력이 된다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 목록 구간 단위 시험의 null 갈래 정리**
- **Found during:** Task 2
- **Issue:** 계획대로 `paymentBand`의 「지급 예정일 없음」 갈래를 지우자(남은 호출처 없음) `test/unit/domain/expenses/list-groups.test.ts`가 null 예정일 행 · 그 구간을 기대해 타입 오류.
- **Fix:** 시험 Row 타입을 string으로, null 사례(구간 「지급 예정일 없음」)를 지움. files_modified 밖 시험 파일.
- **Commit:** aa369d76

**2. [Rule 3 - Blocking] 오늘에서 셈한 날짜를 수동 저장하던 기존 시험 · 로그 유형 기대**
- **Found during:** Task 3
- **Issue:** 영업일 판정(D-714)이 들어가 `addDays(today, n)`이 주말에 걸리면 저장이 거부됨(payment-batch `+3 · +9`, payment-single E2E `+45` = 2026-12-06 일요일). 로그 유형이 document_update → payment_schedule_change(계획 명시)라 기대값도 바뀜.
- **Fix:** expense-payments.test.ts · payment-batch.test.ts · payment-single.spec.ts에 `businessDayFrom`(그 날 이후 첫 영업일 — loadHolidayLookup · isBusinessDay) 도우미, 로그 기대를 `payment_schedule_change` + `changes.scheduledPaymentDate`로. files_modified 밖 시험 파일.
- **Commit:** 168b1638

**3. [오케스트레이터 지시] pay-schedule.ts:99 경계 단위 시험**
- `test/unit/payments/pay-schedule.test.ts`에 「휴일 주에 지급일이 기준일 당일 · 그 앞일 수 있음(pushReason null)」 고정 사례 추가(기존 동작 특성화라 처음부터 녹색). files_modified 밖.
- **Commit:** 168b1638

**4. [Rule 1 - 내 시험 기대 수정] 결재 시트 공급가액 행 수**
- effective-date의 결재 시트 단언이 「공급가액 행 1개」를 기대했으나 설계상 금액 행 + 계산 한 줄 행 둘. 의도(세율 바뀜 경고 행 없음 · 지급 총액 한 줄)로 단언을 고침.
- **Commit:** aa369d76

### 판단 기록 (계획과 다르게 고정한 시험 시점 · 형태)

- **이번 주로 「오늘 수요일」 → 「마감 지난 목요일 15:00」:** 마감(지급일 전 영업일 14:00) 넘김으로 밀린 건은 그 주 마감이 지난 뒤에만 생긴다 — 수요일에는 이번 주 마감에 밀린 건이 있을 수 없어 현실 시점인 목요일 15:00으로 고정. thisWeekMove의 「수요일 → 그 주 금요일」은 그대로 시험.
- **PaymentInputs.autoPayDate 선택 칸:** 필수로 두면 기존 단위 시험(test/unit/domain/payments.test.ts) 리터럴이 깨져 선택 칸으로 둠 — 없으면 저장값만(종전 동작).
- **saveScheduledPayDate 반환에 offWeekday 추가 · 입력 null 허용:** app/(app)/expenses/[id]/actions.ts는 건드리지 않음(zod는 아직 string, 액션 반환은 {version}) — 화면 연결은 07-16.

## 남은 일 · 다음 플랜 메모

- **07-16(화면):** actions.ts `saveScheduledPayDate` 스키마를 `string | null`로(자동으로 되돌리기), 반환 `offWeekday`를 화면 `{요일}요일 아님`에, `moveToThisWeek` · `revertScheduledPayDates` 액션 신설(반환 그대로 되돌리기에 넘김), `thisWeekMove === null`이면 `이번 주로` 숨김. 서버 거부 사유: `영업일만 선택 · 다시 선택` · `이번 주 지급일 지남` · `마감 지나 밀림 아님 · 새로 고침` · `이미 지급 완료 · 새로 고침` · `다른 사람이 HH:mm에 바꿈 · 새로 고침` — UI-SPEC의 막힌 행 줄 `영업일이 아닌 날`과 맞출지는 07-16 판단.
- 이번 주로 · 되돌리기는 지급 대상 화면 선택 건만 받는다고 가정 — 서버는 건마다 보임 · 결재 통과 · 지급 여부 · version을 다시 판정한다.
- `pnpm lint`는 이 환경에서 `NODE_OPTIONS=--max-old-space-size=6144`가 있어야 OOM 없이 끝났다.

## Known Stubs

없음.

## Self-Check: PASSED
