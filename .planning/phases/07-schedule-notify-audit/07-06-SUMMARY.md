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
    - test/integration/expense-approval-lifecycle.test.ts
    - test/e2e/expense-new.spec.ts

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

## 독립 검토 반영 (2026-10-22)

검토 범위 054c6396..a466ab85. 돈 경로 금액 결함은 없음 — CI를 붉게 하는 낡은 시험 셋(P1)과 P3 넷을 아래처럼 처리했다.

### 검토 처리 표

| 지적 | 처리 | 커밋 |
|------|------|------|
| P1-1 행 범위 처분표 ⓓ에 listUnpaidApprovedScheduleSources 빠짐 | 처분표에 등록(scopeCondition은 listExpensePage와 같음) | 9a6e5671 |
| P1-2 expense-approval-lifecycle 결재 시트 「지급 예정일」 기대 `—` · muted | D-704대로 상세 DTO와 같은 로더 값 · default로. 고치기 전 전용 DB에서 실패 확인(`expected ['2026-12-18'] to deeply equal ['—']`) | 1263d3b6 |
| P1-3 expense-new E2E 두 곳 `toHaveValue("")` | CI=true E2E로 두 곳 실패 확인(Received `2026-12-18`) 뒤, 칸 = 유효 예정일(상세 DTO 값) · DB 칸 NULL 단언으로 | ad55de90 |
| P3 승인 보기 구간 머리글이 지급 끝난 건에서 되풀이 | 지급 끝난 건은 맨 뒤 「지급 완료」 구간 하나(사용자 결정 2026-10-22). tone 없음 — 기존 중립 구간과 같은 꼴, 새 색 · 화면 파일 변경 없음 | 878d04a3 |
| P3 제출 스냅숏 = 「지금 승인되면」 일정 | 설계 한계로 아래에 기록(고치지 않음) | 이 SUMMARY 커밋 |
| P3 pushReason null(pay-schedule.ts:96-99) | 후속 quick으로 넘김(아래) | — |
| P3 작은 견고성 넷 | 지금 닿는 경로 없음 — 메모만(아래) | — |

### 설계 한계 — 제출 스냅숏의 세금 기준일

- 제출 스냅숏은 「지금 승인되면」 일정으로 세금을 셈한다(domain/expenses/index.ts:1142 — submitExpense는 approvedAt이 없어 now 기준 자동값을 쓴다).
- 실제 승인이 그 주 결재 마감을 넘기면 지급일이 다음 주로 밀린다. 그 사이 세율이 바뀌면 스냅숏 세액과 지급 세액이 갈린다. 이때는 상세의 「세율 바뀜」 표시로 드러난다(조용한 오차 아님).
- 그래서 truth 4(「승인 스냅숏 = 지급 세액」)는 승인이 같은 지급 주 안일 때만 성립한다.
- 반려 · 회수 뒤 증빙 없이 재제출하면 기준일이 옛 submittedAt이라 같은 갈림이 생길 수 있다.
- 승인 시점에 스냅숏을 다시 잡는 것은 이 플랜 범위 밖이다.

### 후속 메모 — pushReason null로 규칙 줄이 「마지막 금요일」 — #269(636296e)로 해소

- #269(636296e, D-749 firstCandidate no-slot 수정)로 해소. main 머지 뒤 firstCandidate는 영업일로 맞춘 날이 기준일 이하이면 no-slot(「기한 N일 안 마지막 영업일」)을 돌려준다.
- test/unit/payments/pay-schedule.test.ts의 휴일 주 사례(기준 07-09(목) · 기한 1 · 07-10 공휴일) 기대를 no-slot으로 바꿨다. 날짜(07-09 · 07-08)는 그대로다.

### 작은 견고성 넷 — 지금 닿는 경로 없음(고치지 않음)

- domain/payments/index.ts:726 `rejectOnUserError`가 UPDATE 뒤 단계(recordAction)까지 감싼다. 거기서 UserFacingError가 나면 행은 바뀐 채 커밋되고 로그가 빠진다. 지금은 등록된 로그 유형이라 닿지 않는다.
- `PaymentInputs.autoPayDate` 선택 칸: 운영 호출처는 loadPaymentInputs 하나라 늘 채워진다. 새 호출처가 빠뜨리면 잠금 뒤 판정의 지급 예정일 자리가 저장값뿐이라, 수동 값이 없는 건은 세금 기준일이 조용히 오늘로 떨어진다(domain/expenses/tax.ts:51). 타입 주석으로만 지킨다.
- revertScheduledPayDates는 이전 값이 영업일이 아니면(D-740 옛 주말 값 · 그 뒤 공휴일 지정) 「영업일만 선택」으로 되돌리기를 거부한다. 드문 경우다.
- domain/payments/batch.ts:81 `rejudgePaymentTargets(…, { shared })`에 deps.now가 넘어가지 않는다 — 시계 주입 시험에서만 차이.

### 검토 반영 검증 (전용 DB erp_w0706_test, 새로 비운 뒤)

- 통합: expense-approval-lifecycle · payments/effective-date · payments/move-to-this-week · expenses/approved-sort · expense-list-search — 5파일 51 통과.
- 단위: row-scope-disposition · domain/expenses/list-groups — 2파일 26 통과.
- E2E(desktop, flock · CI=true): expense-new · expense-list · expense-auto-date — 30 통과(skipped 18은 visual 프로젝트 몫).
- P3 RED: 새 단위 사례가 「다음 주」 뒤 「예정일 지남」 · 「그 뒤」 · 「이번 주 지급」 머리글 되풀이로 실패. approved-sort 새 단언은 고치기 전 list.ts로 `expected { label: '예정일 지남' } to match { label: '지급 완료' }` 실패 → 고친 뒤 통과.

## 실행 검토 round2 반영 (2026-10-22, #267)

- 호출한 스킬: superpowers:systematic-debugging · test-driven-development · verification-before-completion.
- F-267-1 · F-267-2: origin/main(#269 포함)을 머지 커밋으로 반영했다. pay-schedule.ts는 main판 그대로다. 휴일 주 사례의 이전 기대(null)가 main판에서 실패함을 먼저 재현했고(RED), 기대를 no-slot으로 바꿨다(GREEN).
- 「내 차례」 지급 묶음: main(phase6-items.ts — `row.scheduledPaymentDate`)은 예정일을 적지 않은 새 승인 건을 세지 않는다. 07-06이 유효 예정일(`schedule.payDate`)로 바꿔 덮는다. 그 줄만 main판으로 되돌리면 payments/effective-date 「내 차례」 사례가 `expected +0 to be 1`로 실패하는 것을 확인했다.
- sundayOf(D-715): 지급 묶음의 「이번 주」가 pay-schedule 밖에서 getUTCDay로 셈해졌다. domain/next-turn이 no-fixed-weekday 검사 범위 밖이라 걸리지 않았다. 검사 범위에 domain/next-turn을 더해 RED를 확인했다. 그 뒤 `payWeekIndex(date, today) <= 0`으로 바꿨다(GREEN — 일요일 경계 단위 사례 유지).
- 검증: 단위 payments · rules/payment-cutoff · domain/next-turn-phase6 — 5파일 71 통과. 통합 next-turn · payments — 6파일 77 통과. typecheck 통과. eslint는 바뀐 파일 통과다. 저장소 전체 eslint는 이 머신 메모리 부족(OOM 134/137)으로 끝나지 않았다. 전체 실행은 CI가 맡는다.

## Known Stubs

없음.

## Self-Check: PASSED
