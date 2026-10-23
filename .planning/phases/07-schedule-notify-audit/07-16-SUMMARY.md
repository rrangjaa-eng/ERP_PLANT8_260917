---
phase: 07-schedule-notify-audit
plan: 16
subsystem: 지급 화면(SC-01 지급 대상 표 · SC-02 지출결의 폼 희망 지급일 · SC-03 상세 지급 표시)
tags: [EXP-11, EXP-12, D-714, D-731, D-741, K19, AQ-10, U8, U13, risk-money, screen]
status: complete
requires:
  - 07-01 (payWeekGroupLabel · payRuleLine · payOffWeekdayText · resolvePaySchedule · approvingByWeek)
  - 07-06 (saveScheduledPayDate null = 자동 복귀 · moveToThisWeek · revertScheduledPayDates · thisWeekPayDate)
  - 07-02 / 07-pr-s-schema (requested_payment_date · requested_payment_reason 칸 · 짝 CHECK)
provides:
  - 지급 대상 표 — `마감 지나 밀림` · `이번 주로`(행 · 일괄) · 결과 줄 되돌리기 · 주마다 「결재 중 · 합계 제외」 하위 그룹
  - PaymentScheduleValue(app/(app)/expenses/[id]/payment-section.tsx) — 상세 지급 예정일 값 한 컴포넌트(태그 · 규칙 줄 · 자동 계산 · 요일 경고)
  - 상세 `자동으로 되돌리기`(확인 창 없음 → 결과 줄 · 되돌리기)
  - 폼 희망 지급일 · 희망 사유 + 지급 예정일 읽기 줄(testid expense-schedule-value · expense-schedule-rule)
  - domain/expenses/draft-fields.ts requestedPaymentErrors(fields, todayKst) · gate.ts REQUESTED_* 문구
  - ui/table TableSelection.hidden(행 고르기 칸 비움)
  - test/e2e/pay-schedule-e2e.ts 공용 준비(approvedDoc · submittedDoc · pushedDoc · groupOf …)
affects:
  - 07-28 (같은 폼 파일 — expense-form.tsx · expense-document.tsx · draft-fields.ts · index.ts · expense-form.spec · expense-new.spec · expense-hope-date.spec)
tech-stack:
  added: []
  patterns:
    - 화면은 07-01 라벨 · 규칙 줄을 그대로 그린다(화면 날짜 계산 없음)
    - 비동기 응답 뒤 포커스는 ref + 상태 변화 effect(inbox-list 꼴)
key-files:
  created:
    - test/e2e/payment-move-this-week.spec.ts
    - test/e2e/mobile-payment-pushed.spec.ts
    - test/e2e/pay-schedule-e2e.ts
    - test/e2e/payment-weekday-setting.spec.ts
    - test/e2e/expense-hope-date.spec.ts
    - test/unit/expenses/draft-fields-hope.test.ts
    - docs/design/checks/2026-10-22-07-16-payment-screens.md
  modified:
    - app/(app)/expenses/payment-targets-table.tsx
    - app/(app)/expenses/(list)/page.tsx
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/expenses/expenses.module.css
    - app/(app)/expenses/[id]/payment-section.tsx
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - app/(app)/expenses/[id]/expense-document.tsx
    - app/(app)/expenses/[id]/expense-form.tsx
    - app/(app)/expenses/[id]/actions.ts
    - app/(app)/expenses/[id]/page.tsx
    - app/(app)/expenses/new/page.tsx
    - ui/table/Table.tsx
    - domain/expenses/draft-fields.ts
    - domain/expenses/gate.ts
    - domain/expenses/dto.ts
    - domain/expenses/index.ts
    - domain/payments/action-row.ts
    - domain/payments/index.ts
    - repositories/expenses.ts
    - playwright.config.ts
decisions:
  - "결재 중 행은 링크 없음 · 고르기 칸 없음 · 흐린 글자(--text-muted) — --accent-weak 대신 중립 표면, 합계에서 빠짐을 머리글과 `결재 중 N건 · 합계 제외` 줄로"
  - "희망 지급일 없이 사유만 오면 사유 칸 오류 `희망 지급일 없음 · 날짜 선택`(REQUESTED_DATE_MISSING) — 한쪽만 적은 상태를 저장하지 않는다"
  - "희망 판정 문구는 클라이언트도 읽는 domain/expenses/gate.ts에 둔다(draft-fields는 서버 코드를 끌어온다)"
  - "상세 수동 지정 해제는 확인 창 없이 결과 줄 `자동 계산으로 복귀 · 되돌리기`(포커스 되돌리기)"
metrics:
  duration: 116min
  completed: 2026-10-22
actuals:
  tokens: 49000
  tasks: 3
  commits: 3
plan_head_before: 51ab0cea188cd3984c1c787735666cf97c70ad74
---

# Phase 07 Plan 16: 지급 화면 Summary

지급 대상 표에 `마감 지나 밀림` · `이번 주로` · 「결재 중 · 합계 제외」 하위 그룹을 더하고, 상세 지급 예정일을 07-01 라벨 · 규칙 줄 그대로(`(자동)` · `수동 지정` · `자동으로 되돌리기`) 그리며, 기안자 폼의 지급 예정일 입력 칸을 희망 지급일 · 희망 사유 한 쌍과 읽기 줄로 바꿨다(D-714).

## Tasks

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 | SC-01 밀림 · 이번 주로(행 · 일괄) · 결과 줄 되돌리기 · 계산 실패 · 수동 지정 글자 | dbcf18ca |
| 2 | SC-01 결재 중 하위 그룹 · 설정 요일 머리글 · SC-03 상세 지급 표시 · 자동으로 되돌리기 · 희망 두 줄 | 93b3f3f8 |
| 3 | SC-02 폼 희망 지급일 · 희망 사유 · 지급 예정일 읽기 줄 · 도메인 판정 | f91636b6 |

## 호출한 스킬
- plant8:design-gate — 화면 파일 전에(점검표 docs/design/checks/2026-10-22-07-16-payment-screens.md, 모든 항목 `[x]` + 근거)
- superpowers:test-driven-development — 태스크마다 RED 확인(Task 1 · 2 E2E RED 로그 e2e-t1-red.log · e2e-t2-red.log, Task 3 단위 RED)
- superpowers:systematic-debugging — Task 2 E2E 실패 4건 · hope 스펙 제출 실패 원인 추적 전에
- superpowers:verification-before-completion — Task 1 커밋 전, Task 2 · 3 커밋 전

## 검증(마지막 실행 기준)
- `pnpm typecheck` 0 · eslint(바뀐 ts/tsx 전부) 0 · stylelint(expenses.module.css) 0
- 단위: test/unit/ui · domain/expenses · app · expenses · design/tokens · eslint/stylelint 설정 — 121 파일 1521 통과
- 통합(erp_w0716_test): 플랜 5 파일 5197 통과. 지출결의 초안 함수를 쓰는 40 파일 — 1049 통과 · 1 실패(evidence-attach `SQL 순위 대조` 5000ms 시간 초과 7.3s, 40 파일 병렬 부하 중 — 단독 재실행 통과, 단독도 4.6s로 한도 근처. 이 플랜 변경과 무관한 시간 한도 문제로 판단, 고치지 않음)
- E2E CI=true(프로덕션 빌드 — `pnpm build && pnpm start`): desktop 묶음(payment-schedule · payment-single · payment-batch · expense-hope-date · expense-new · expense-form · evidence-pick-audit-capture · expense-auto-date · payment-move-this-week) 115 통과 · 1 실패 → 원인(증빙 없는 초안은 1차 제출이 aria-disabled) 고친 뒤 expense-hope-date 3 통과. desktop-settings `payment-weekday-setting` 1 통과. mobile-375 `mobile-payment-pushed` 1 통과
- E2E · 통합은 Task 2 · 3을 합친 작업 트리에서 돌렸다(Task 2 커밋은 공유 파일 dto.ts · index.ts의 Task 2 몫만 담았다 — 단독 커밋 상태의 typecheck는 따로 돌리지 않음)

## 인계 확인
- 공백뿐인 희망 사유: zod `.trim()` 뒤 `requestedPaymentErrors`가 빈 글자를 없음으로 보고 `희망 사유 · 입력`, `toDraftColumns`가 ""를 NULL로 — 단위 draft-fields-hope 사례
- #260 P3(예정일 비우기 → set_by/set_at CHECK): `repositories/expense-payments.ts` `updateScheduledPaymentDate`가 date null이면 setBy · setAt도 null로 쓴다 — null 저장은 CHECK 안전. 상세 `자동으로 되돌리기` E2E(payment-schedule)가 이 길을 실제로 탄다

## Deviations from Plan

### Auto-fixed Issues
1. **[Rule 3] 거부 사유 상수 이동(Task 1)** — NOT_BUSINESS_DAY · THIS_WEEK_PASSED를 클라이언트가 읽는 domain/payments/action-row.ts로(서버 모듈을 클라이언트가 import 못 함). 커밋 dbcf18ca
2. **[Rule 3] test/e2e/pay-schedule-e2e.ts 공용 준비 파일 신설** — 다섯 스펙이 같은 준비(승인 · 밀림 · 결재 중 문서)를 쓴다. 플랜 파일 목록 밖
3. **[Rule 3] 점검표 날짜 2026-10-22** — 플랜은 2026-10-21 이름, 실행일로 만듦
4. **[Rule 3] 지급 권한 없는 사용자 사례는 도메인 호출로 확인** — 화면에 버튼이 없어 클릭할 수 없음
5. **[Rule 3] ui/table `selection.hidden` 추가** — 결재 중 행은 고를 수 없고 사유 줄도 없어야 하는데 기존 표는 gate 사유 줄을 그린다. 스타일 추가 없음
6. **[Rule 3] repositories/expenses.ts** — ExpenseDraftFields Pick의 scheduledPaymentDate를 희망 두 칸으로(타입 오류). 플랜 목록 밖
7. **[Rule 3] test/unit/e2e/playwright-config.test.ts** — DESKTOP_SETTINGS_SPECS에 payment-weekday-setting을 더해 공유 목록 단언 갱신
8. **[Rule 3] 통합 effective-date · pay-week-targets** — 작성자 지급 예정일 입력 계약을 쓰던 준비를 희망/무입력으로. 플랜 목록 밖
9. **[Rule 3] E2E evidence-pick-audit-capture** — 폼 마지막 칸이 희망 지급일로 바뀐 좌표 단언
10. **[Rule 1] 기존 E2E 단언 계약 갱신** — payment-single: 예정일 고치는 동안 보이는 1차 1개(`저장`), `지급 완료`는 2차(U13). payment-batch: 토스트 0은 `div[role=status]`로 좁힘(결과 줄이 `p role=status`). payment-schedule: 숨은 상세 시트의 `dt 지급 예정일`을 피해 `dt:visible`
11. **[Rule 1] payment-section 포커스 effect의 setState** — eslint react-hooks/set-state-in-effect. ref + autoResult 변화 effect로
12. **[Rule 1] expense-hope-date 제출 사례** — 증빙 없는 초안은 1차 제출이 막혀 있어 사례 준비에서 증빙을 붙이고, 마지막 제출은 submitExpense 직접 호출(증빙 두 장 방지)
13. **결재 중 행** — 링크 없음, 짝 없는 결재 중 주는 첫 페이지에만 붙는다(페이지마다 되풀이 안 함)
14. **actions.registry.ts는 Task 1에서 바뀜, [id]/expense.module.css · scripts/demo-data.ts는 바꿀 필요 없음**(typecheck 0)

## Known Stubs
없음.

## 범위 밖 발견(고치지 않음)
- domain/expenses/detail.ts 숨은 상세 시트는 지급 예정일을 날짜 글자만 그린다(태그 · 규칙 줄 없음)
- test/integration/evidence-attach.test.ts `SQL 순위 대조` — 단독 4.6s로 기본 5000ms 한도 근처, 병렬 부하에서 시간 초과

## 열린 질문(권장안으로 진행)
- 사유만 적은 경우 문구: `희망 지급일 없음 · 날짜 선택`(권장) vs `희망 사유 · 입력`과 같은 문구 — 사유 칸에 날짜 없음을 알린다
- 결재 중 행 링크: 없음(권장 — 지급 대상 표의 행동 대상이 아님) vs 문서 링크

## Self-Check: PASSED
- 파일: test/e2e/expense-hope-date.spec.ts · payment-weekday-setting.spec.ts · pay-schedule-e2e.ts · test/unit/expenses/draft-fields-hope.test.ts · 점검표 — 존재
- 커밋: dbcf18ca · 93b3f3f8 · f91636b6 — git log에 있음
