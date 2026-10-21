---
phase: 07-schedule-notify-audit
plan: 01
subsystem: payments
tags: [payments, pay-schedule, cutoff, holidays, gate, settings-registry, risk-money]
status: complete
plan_base: e3407821814d715b5d2ad37beaab6767ea7ef37b
plan_head_before: e3407821814d715b5d2ad37beaab6767ea7ef37b

requires:
  - phase: 04.2-holidays
    provides: "HolidayLookup · isBusinessDay · loadHolidayLookup · 공휴일 관리 addHoliday/deleteHoliday"
  - phase: 06-payments
    provides: "지급 대상 목록 listPaymentTargets · judgeTargets · PAYMENT_TARGET_ROW_DTO_SPEC · gate 레지스트리"
provides:
  - "domain/payments/pay-schedule.ts — resolvePaySchedule · resolvePayScheduleSafe · prevBusinessOnOrBefore · payWeekGroupLabel · payRuleLine · thisWeekPayDate · payWeekdayChar · payOffWeekdayText · payWeekIndex · PayScheduleLimitError"
  - "domain/payments/pay-schedule-load.ts — loadPaySchedules · loadPayScheduleConfig"
  - "설정 payment.term_days(60) · payment.weekday(fri) · payment.cutoff_time(14:00) — 네임스페이스 지급"
  - "gate payment.cutoff(ctx = PaySchedule의 manual · approvedAt · pushReason · failed)"
  - "repositories: listCurrentRoundApprovedAt · listEarliestIssuedOnForExpenses · listApprovingPaymentTargetRows"
  - "지급 대상 DTO 새 칸 + approvingByWeek(ApprovingPaymentRowDto)"
affects: [07-06, 07-10, 07-14, 07-16, 07-20]

actuals:
  tokens: 28349
  tasks: 3
  commits: 4

key-files:
  created:
    - domain/payments/pay-schedule.ts
    - domain/payments/pay-schedule-load.ts
    - test/unit/payments/pay-schedule.test.ts
    - test/unit/payments/pay-cutoff.test.ts
    - test/unit/payments/no-fixed-weekday.test.ts
    - test/unit/rules/payment-cutoff.test.ts
    - test/integration/payments/pay-week-targets.test.ts
    - test/integration/payments/approved-at.test.ts
    - test/integration/payments/holiday-rederive.test.ts
    - test/e2e/payment-schedule.spec.ts
  modified:
    - domain/payments/targets.ts
    - domain/expenses/dto.ts
    - domain/expenses/index.ts
    - domain/rules/register.ts
    - domain/settings/keys.ts
    - repositories/expenses.ts
    - repositories/evidence-record-links.ts
    - repositories/payment-targets.ts
    - test/e2e/payment-batch.spec.ts
    - test/e2e/expense-new.spec.ts
    - test/integration/expense-create-fields.test.ts
    - test/integration/expense-tax-snapshot.test.ts
---

# 07-01 SUMMARY — 지급 예정일 · 결재 마감 · 그 주 판정 규칙

## 만든 것

- **순수 함수 한 벌(D-715)** `domain/payments/pay-schedule.ts` — DB · 설정 · 시계 import 없음.
  - 첫 후보: 기한 창(기준일 < d ≤ 기준일 + 기한) 안 마지막 지급 요일을 앞 영업일로 맞춤. 창에 지급 요일이 없으면 기한 이하 마지막 영업일 · `no-slot`(D-741). 창에 영업일이 하나도 없으면 기준일 당일도 포함(D-749).
  - 결재 마감 = 지급일 하루 전 날 이하 가장 가까운 영업일의 `payment.cutoff_time` KST(D-701 · J6). KST 시각은 `kstAt` 한 곳에서 만든다.
  - 기준 시각 `approvedAt ?? now`가 마감을 1분이라도 넘기면 다음 지급 가능 요일로 민다 · `cutoff`(D-703 · D-704 첫 절). 기한을 넘겨도, `no-slot`에서 출발해도 민다. 앞 후보보다 같거나 이른 날은 고르지 않는다(한 주가 통째로 휴일이면 건너뜀).
  - 수동 값은 밀지 않는다 · `pushReason` null · cutoffAt은 표시용(D-742).
  - `alertDate` = 마감 날짜의 전 영업일.
  - 상한 가드 둘 — 앞 영업일 걷기 366일 · 밀림 60주 → `PayScheduleLimitError`. `resolvePayScheduleSafe`는 그 오류를 잡아 `failed: true` 대체 일정을 돌려준다(R15).
  - 머리글 `payWeekGroupLabel`: 실패 → `예정일 계산 실패` · 지난 날짜 → `예정일 지남`(warning) · `이번 주 {실제 요일} MM-DD · 마감 MM-DD HH:MM` · `다음 주 …` · `그 뒤`.
  - 규칙 줄 `payRuleLine`의 네 문구(D-731)와 `thisWeekPayDate` · `payWeekdayChar` · `payOffWeekdayText` · `payWeekIndex`.
- **로더** `pay-schedule-load.ts`
  - 기준일 = 살아 있는 붙임 증빙 기록의 가장 이른 issued_on → 없으면 제출 시각의 KST 날짜 → 없으면 오늘.
  - 승인 시각 = `listCurrentRoundApprovedAt`(지금 차수 승인 단계 acted_at의 최댓값. 인스턴스 updated_at은 쓰지 않는다).
  - 공휴일 lookup은 음력 표(2025~2035) 범위로 자른다. 표 밖 해는 주말만 뺀다(B-P1-4).
  - 행마다 Safe를 부르고, 실패 행은 `log.error("payment.schedule_failed", { expenseId })`.
- **설정 3키**: `payment.term_days` · `payment.weekday` · `payment.cutoff_time`(HH:MM, `readInvalidAsDefault`).
- **gate `payment.cutoff`**(register.ts): failed → `예정일 계산 실패` · manual → 통과 · approvedAt null → `결재 중` · `pushReason === "cutoff"` → `마감 지나 밀림`. 판정은 pushReason으로만 한다(K30). 지급 처리 동작은 막지 않는다.
- **지급 대상 목록**(`targets.ts`)
  - 유효 예정일(수동 ?? 자동)로 정렬: 계산 실패 → 예정일 → 번호 → id. 「다음 확인 전」도 같은 키를 쓴다.
  - 묶음은 지급 주 머리글로 만들고, 연속한 같은 라벨은 머리글 하나로 합친다.
  - 행마다 gate 판정을 DTO에 싣는다.
  - DTO 새 칸: `scheduledPaymentManual` · `autoPaymentDate` · `paymentCutoffAt`(ISO) · `paymentPushReason` · `paymentScheduleFailed` · `paymentCutoffReason`.
  - `approvingByWeek`: 결재 중 건을 「지금 승인되면」 기준으로 이번 주 · 다음 주에 넣는다. groups와 합계에는 들어가지 않는다. 같은 팀 · 검색 조건과 같은 보임 범위를 쓰고, 금액이 안 보이는 계급에는 `sumKrw` null.
- **작성자 날짜 차단(D-714 · D-742)**
  - `toDraftColumns`와 `createExpenseFromLines`의 insert가 지급 예정일을 칸에 쓰지 않는다.
  - 스키마 키는 남겨 두어 형식 검증은 그대로 돈다.
  - 갱신에서 빠지므로 D-740 기존 값은 남는다.
- **실제 지급 대상 목록 경로**: `app/(app)/expenses/(list)/page.tsx` → `listPaymentTargets`. 화면(.tsx)은 바꾸지 않았다. 묶음 머리글과 예정일 칸 값만 바뀐다.

## 커밋

| 해시 | 제목 |
|---|---|
| 6fa10c4 | feat: auto pay date from evidence date in payment targets (Task 1) |
| b4bee87 | feat: approval cutoff, weekly pay grouping and cutoff gate for payment targets (Task 2) |
| 2e185ec | feat: block drafter pay date and lock holiday rederive and weekday rules in tests (Task 3) |
| (이 커밋) | docs: 07-01 SUMMARY |

## 시험 명령과 실제 결과

공유 `erp_test`는 다른 워크트리 에이전트와 겹쳐 FK 오류가 났다. 그래서 통합 · E2E는 전용 DB `p0701_test`(`DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/p0701_test`)에서 돌렸다. 처음에는 `flock /tmp/plant8-erp-test.lock`으로 감쌌다.

E2E 포트 3100은 다른 에이전트(07-12 감사 설정 `playwright.audit0712.config.ts`)가 잠금 없이 쓰고 있었다. 그 결과 첫 Task 2 E2E 실행은 남의 서버에 붙어 64 failed(`EADDRINUSE` · 로그인 `/login` 머묾)로 끝났다 — 환경 문제다. 그래서 커밋하지 않은 임시 설정 `playwright.p0701.config.ts`(기본 설정을 포트 3171로만 바꿈 · `BETTER_AUTH_URL=http://127.0.0.1:3171`)로 다시 돌렸고, 끝난 뒤 지웠다.

| 명령 | 결과 |
|---|---|
| `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts test/unit/payments/pay-cutoff.test.ts test/unit/rules/payment-cutoff.test.ts test/unit/domain/rules-gate.test.ts` | 4 files · 99 passed |
| `pnpm exec vitest run --project unit test/unit/payments/no-fixed-weekday.test.ts test/unit/app/expense-draft-dates.test.ts` | 2 files · 4 passed |
| `pnpm exec vitest run --project unit` (전체 단위) | 334 passed · 1 skipped files / 5229 passed · 6 skipped |
| 통합(전용 DB): `vitest run --project integration test/integration/payments/ expense-payments payment-batch expense-create-fields expense-draft-guards leak-scan expense-tax-snapshot` | 9 files · 5181 passed |
| Task 2 통합 verify(pay-week-targets · approved-at · expense-payments · payment-batch · leak-scan) | 5 files · 5154 passed |
| Task 3 통합 verify(holiday-rederive · pay-week-targets · expense-create-fields · expense-draft-guards) | 4 files · 22 passed |
| `CI=true playwright test payment-schedule payment-single payment-batch`(포트 3171) | 64 passed · 18 skipped(visual 전용 프로젝트) |
| `CI=true playwright test expense-new expense-form`(포트 3171) | 35 passed · 18 skipped |
| Task 1 트레이서 `CI=true playwright test payment-schedule`(3100, Task 1 시점) | 1 passed · 18 skipped |
| `pnpm typecheck` | 오류 0 |
| `pnpm lint` | exit 0(경고 1은 임시 설정 파일 — 지운 뒤 없음) |
| 인수 grep(Task 2 열넷 · Task 3 다섯) | 모두 기대값(`"payment.cutoff"` 1 · `payment.cutoff_time` 1 · export 다섯 각 1 · `결재 마감 면제` 1 · `approvingByWeek` 2 · `paymentPushReason` 2 · `listCurrentRoundApprovedAt` 1 · `pushReason`(register) 3 · Safe 1 · Safe 호출 1 · `payment.schedule_failed` 1 · D-714 rg 출력 없음 · pick 키 1 · `pay-schedule.ts` 5 · `payWeekLabel` 7) |
| AQ-09 · K26 `rg -n 'unstable_cache\|"use cache"' app domain lib` | 출력 없음(exit 1) |
| `git diff --name-only origin/main...HEAD -- db/ domain/auth/ domain/permissions/ lib/ .github/ infra/ .claude/ CLAUDE.md app/` | 빈 출력 |

판별력 확인(RED):
- pay-cutoff 18 failed(구현 전).
- rules payment-cutoff 5 failed(gate 등록 전).
- Task 3: 작성자 날짜 사례 3건 실패(차단 전) → 구현 뒤 녹색.
- pay-week-targets K30 사례는 로더의 승인 시각을 null로 바꾸는 변이에서 실패했고, 되돌리니 녹색.

holiday-rederive와 no-fixed-weekday는 계획대로 처음부터 녹색이다. 자동값을 저장하지 않는다는 계약을 고정하는 회귀 시험이다.

## 계획과 다른 점(Deviations)

1. **`repositories/payment-targets.ts` 수정(files_modified 밖).** 결재 중 행 읽기를 `listApprovingPaymentTargetRows`로 더했다. 기존 질의에서 상태 조건만 다르다. 비공개 `selectRows`를 다시 쓰려고 같은 파일 안에 `listRowsByStatus` 도우미를 뒀다. 계획 ⑥이 「기존 질의의 상태 조건만 다른 형제 함수」를 요구했는데 그 질의가 이 파일에 있다.
2. **`test/integration/expense-tax-snapshot.test.ts` 수정(files_modified 밖).** 「예정 세율 취소」 사례는 작성자 임시 저장으로 지급 예정일을 두었는데, D-714 차단 뒤 깨졌다(실행해서 확인). 같은 날짜를 저장 칸에 직접 쓰도록만 바꿨다. 세율 · 스냅숏 단언은 그대로다.
3. **Task 1 단위 시험 승인 시각.** `pay-schedule.test.ts`의 `approvedAt`을 「기준일 0시」에서 「기준일 전날 0시」로 옮겼다. 그대로 두면 D-749 사례(지급일 = 기준일, 마감 = 전날 14:00)에 Task 2의 마감 밀림이 끼어든다. 시험 의도(첫 후보만 검증)는 같다.
4. **밀림 걷기 시작점.** 계획 문구는 「첫 후보 뒤 anchor마다」다. 그대로 걸으면 오래된 기준일(2024 증빙 · 2026 승인)이 60주 가드에 걸린다. 그래서 시작점을 `max(첫 후보, 승인일 − 7일)`로 당겼다. 그보다 이른 anchor는 마감이 승인 시각보다 앞이라 후보가 될 수 없으므로 결과는 같다(단위 사례로 고정).
5. **`prevBusinessOnOrBefore`는 자체 루프(366일 가드)를 쓴다.** `addBusinessDays(d, -1)`을 쓰지 않았다. 모든 날이 휴일로 보이는 lookup에서 무한 반복 대신 오류를 내야 R15 Safe가 성립한다.
6. **`autoPayDate`는 마감 밀림까지 포함한 자동 결과다.** 수동 행도 자동값을 따로 셈한다.
7. **DTO 칸 하나 추가 `paymentCutoffReason`**(gate 이유). 「행마다 gate 판정을 DTO와 맞춘다」(⑥)를 데이터로 싣기 위해서다. 07-16 배지가 그대로 읽으면 된다.
8. **`PaySchedule`에 `approvedAt` 칸을 더했다.** gate ctx(`manual · approvedAt · pushReason · failed`)를 로더 결과 하나에서 바로 넘긴다.
9. **`payWeekIndex`(새 export)를 더했다.** `approvingByWeek`의 이번 주 · 다음 주 거르기와 머리글이 같은 주 셈을 쓴다. 요일 셈은 pay-schedule.ts 밖에 두지 않는다.
10. **`payment.cutoff_time`에 `readInvalidAsDefault: true`.** 허용 밖 저장값이 마감 계산을 Invalid Date로 만들지 않게 했다(문서 번호 구분자와 같은 관례).
11. **시험 쪽 통합 픽스처.** 견적 줄 하나에 지출결의 하나라 pay-week-targets · holiday-rederive는 문서마다 `setupExpenseProject`를 새로 부른다. 그래서 시험당 시간 제한을 30초로 뒀다.
12. **기존 시험 단언 변경(D-714 계약 변경 — 약화 아님).**
    - `expense-create-fields`: 지급 예정일이 저장된다 → 칸 NULL · 비고 · 지급 방식은 저장.
    - `expense-new` E2E 두 사례: 비고 단언은 그대로 두고, 지급 예정일은 「다시 열면 빈 칸」.
    - `payment-batch` E2E 「그룹 · 합계」: 머리글을 새 라벨(`이번 주 {요일} MM-DD · 마감 …` · `그 뒤`)로만 바꿈.
    - 통합 `payment-batch` · `expense-payments`는 바꿀 필요가 없었다(녹색).
13. **Superpowers 스킬(`test-driven-development` · `systematic-debugging` · `verification-before-completion`)은 이 세션에서 쓸 수 없었다(skill unavailable).** 규율은 직접 따랐다(RED 확인 → 구현 → 녹색, 실패는 재현 뒤 원인 수정).
    - 예외: approved-at · pay-week-targets 통합 시험은 구현을 먼저 쓴 뒤 작성했다. 판별력은 위 변이 검사로 확인했다.

## 남은 일 · 넘김(Handoffs)

- **R7 중간 상태:** 이 PR 머지부터 07-16 머지 전까지 지급 대상 목록의 순서와 묶음 머리글이 바뀐다. `마감 지나 밀림` · `수동 지정` 배지, 결재 중 묶음, 규칙 줄 화면은 07-16이 붙인다(DTO 칸은 이미 실림).
- **FA-3 전환 창:** 이 플랜 머지부터 07-16 머지 전까지 지출결의 폼의 `지급 예정일` 칸은 저장해도 칸에 남지 않는다(스테이징만, 운영 전환은 Phase 8). 07-16이 이 칸을 읽기 줄 + `희망 지급일`로 바꾼다. 작성자 미리 보기의 세금 기준일도 이제 작성자 날짜를 쓰지 않는다(`toDraftColumns` 공유).
- **07-06**
  - `domain/next-turn/phase6-items.ts`는 아직 저장 칸 `row.scheduledPaymentDate`를 읽는다(이 플랜 files_modified 밖). 유효 예정일로 바꾸는 일은 07-06 몫이다.
  - `payableOf` 세금 기준일 인자도 바꾸지 않았다(금지 5 — 07-06).
  - 거래처 기한(`vendorTermDays`)은 로더 입력 칸만 있다. 읽기는 07-06, 칸은 07-02.
- 연도 확정(후보 → 확정)으로 날이 바뀌는 재파생 사례는 넣지 않았다. 계획이 「시험 DB에 그 해 후보가 있으면」이라 단서를 단 선택 사례다. 추가 · 삭제 사례로 같은 경로(저장 없음)를 고정했다.
- 07-10 · 07-14 · 07-16은 export 이름(`resolvePaySchedule` · `loadPaySchedules` · `payWeekGroupLabel` · `payRuleLine` · `thisWeekPayDate` · `payWeekdayChar` · `payOffWeekdayText`)을 그대로 쓰면 된다.
- 운영 메모: 로컬에서 E2E 포트 3100을 잠금 없이 쓰는 에이전트가 있으면 E2E가 남의 서버에 붙는다. 오케스트레이터가 확인하면 좋다.

## Known Stubs

- `loadPayScheduleConfig`의 `vendorTermDays`는 소스 칸만 있고, 아직 채우는 쪽이 없다(07-02 · 07-06). 지금은 회사 기본 기한을 쓴다.

## Threat Flags

- 새 보안 경계는 없다. 새 DTO 칸 · `ApprovingPaymentRowDto`는 `registerDto`(`expense.value` / 금액 `expense.amount`)로 투영되고 leak-scan이 녹색이다.
- 승인 시각은 서버 `approval_steps.acted_at`만 읽는다(T-07-01-01).
- 작성자 날짜는 칸에 쓰이지 않는다(T-07-01-02).

## Self-Check: PASSED
