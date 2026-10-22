---
phase: 07-schedule-notify-audit
plan: 14
subsystem: notify
tags: [notify, approvals, condition-kinds, auto-read, email-digest, href, risk-approvals]
status: complete
plan_base: c7e8b8d8cf6cf55582397c9814f1233cc0ec9e0e
plan_head_before: c7e8b8d8cf6cf55582397c9814f1233cc0ec9e0e

requires:
  - phase: 07-10
    provides: "조건 종류 등록부 · tick(권고 잠금 · 종류별 savepoint) · 사다리 도우미 · dedup 키 · 이메일 단계(claimNextEmailBundle)"
  - phase: 07-01
    provides: "loadPaySchedules · resolvePaySchedule(마감 = payment.cutoff_time) · listApprovingPaymentTargetRows"
provides:
  - "꺼 둔 종류 여섯: expense-result(승인 · 반려 · 금액 바뀜 · 지급 완료 · 지급 취소 갈래) · pre-cutoff-unapproved · settle-nudge · rejected-idle · quote-nudge · orphan-evidence"
  - "domain/notify/href.ts — notificationHref(viewer, rows) · documentIdOf (갈래: 지출결의 · 결재 결과 · 결재 단계 · 프로젝트 · 지급 주 · 임자 없는 증빙 · 확인증 행사)"
  - "SC-07 메일 형식(제목 `알림 N건 · MM-DD` · 줄 `- {문장} 열기 {URL}`)"
  - "결재 처리 자동 읽음 markStepNotificationsRead(승인 · 반려 트랜잭션 안, SKIP LOCKED) + 다음 tick 정리 markHandledStepNotificationsRead(K25)"
  - "repositories: listExpenseFinalApprovals · listExpenseRejections · listExpensePaymentEvents · listExpenseAmountChanges · listMenuWriterIds · listSettlingProjectsNotSubmitted · listRejectedIdleExpenses · listProjectsWithoutQuote · listStepDocuments · listArchivedProjectIds · countPublishedUnattachedBefore · listEventIdsInScope"
  - "domain/certs/events.ts listVisibleCertEventIds · domain/evidence-records CARD_FORMATS export"
affects: [07-22, 07-23]

actuals:
  tokens: 31570
  tasks: 3
  commits: 3

key-files:
  created:
    - domain/notify/href.ts
    - domain/notify/kinds/expense-result.ts
    - domain/notify/kinds/pre-cutoff-unapproved.ts
    - domain/notify/kinds/settle-nudge.ts
    - domain/notify/kinds/rejected-idle.ts
    - domain/notify/kinds/quote-nudge.ts
    - domain/notify/kinds/orphan-evidence.ts
    - test/integration/notify/expense-result.test.ts
    - test/integration/notify/approval-auto-read.test.ts
    - test/integration/notify/kinds-off.test.ts
    - test/integration/notify/href.test.ts
  modified:
    - domain/notify/digest.ts
    - domain/notify/email-phase.ts
    - domain/notify/condition-kinds.ts
    - domain/notify/tick.ts
    - domain/approvals/index.ts
    - domain/certs/events.ts
    - domain/evidence-records/index.ts
    - repositories/notifications.ts
    - repositories/notify-sources.ts
    - repositories/evidence-records.ts
    - repositories/cert-events.ts
    - test/unit/domain/notify-digest.test.ts
    - test/unit/lib/email-sender.test.ts
    - test/integration/notify-email.test.ts
    - test/integration/notify/kinds-core.test.ts

key-decisions:
  - "AQ-24 금액 바뀜 원천 = action_log evidence_amount_change(ALWAYS_ON — 끌 수 없어 조용히 비지 않는다). expense_evidence_reviews는 문서당 한 행이라 덮어써져 사건 원천이 못 된다"
  - "결재 결과 모든 갈래에서 기안자 본인 행동(본인 승인 · 본인 지급 · 취소 · 금액 고침)은 알리지 않는다"
  - "최종 승인 판정은 시각이 아니라 step_index 최대(나중 단계가 더 이른 acted_at을 가질 수 있다)"
  - "결재 단계 자동 읽음 키 = 단계 id, 대표 폴백 자리는 `{차수 id}:fallback` — 승인 · 반려 트랜잭션 안 SKIP LOCKED, 잡힌 행은 다음 tick이 정리"
  - "임자 없는 증빙은 06.1 목록 stateWhere('published')를 그대로 재사용(같은 판정 두 벌 금지), 받는 사람 = evidence.intake 쓰기 활성 사용자"
  - "착지 링크 href 계산이 실패해도 메일은 링크 없이 보낸다(notify.email_href_failed 로그) — 'sending'에 묶이지 않게"

patterns-established:
  - "착지 링크 갈래 = { entities · keyOf · resolve } — 갈래마다 기존 화면 판정 함수로 묶음 한 번"

duration: "약 1일(세션 압축 2회 포함)"
completed: 2026-10-22
---

# Phase 07 Plan 14: 결재 · 재촉 알림 종류 여섯 + 결재 처리 자동 읽음 + 메일 착지 링크 Summary

결재 결과(승인 · 반려 · 금액 바뀜 · 지급 완료 · 지급 취소) · 마감 전 미승인 · 정산 상신/반려 방치/견적 재촉 · 임자 없는 증빙 여섯 종류를 기본 끔으로 등록부에 더했다. 결재 처리 시 같은 트랜잭션에서 SKIP LOCKED로 결재 차례 알림을 자동 읽음 처리하고, 놓친 행은 다음 tick이 정리한다. 메일은 SC-07 형식으로 바꾸고, 줄마다 받는 사람이 볼 수 있는 문서에만 「열기」 링크를 붙인다.

## Tasks

| # | Task | Commit | 주요 파일 |
|---|------|--------|-----------|
| 1 | 결재 결과 트레이서(최종 승인) · 착지 링크(지출결의) · SC-07 메일 형식 | 62b457db | kinds/expense-result.ts · href.ts · digest.ts · email-phase.ts · notifications.ts |
| 2 | 결재 결과 나머지 갈래 · 마감 전 미승인 · 결재 처리 자동 읽음(N16 · G33 · K25) | a3f691d4 | kinds/pre-cutoff-unapproved.ts · approvals/index.ts · tick.ts · notifications.ts · notify-sources.ts |
| 3 | 재촉 셋 · 임자 없는 증빙 · 등록부 순서 · 착지 링크 나머지 갈래 | c6f3977b | kinds/settle-nudge · rejected-idle · quote-nudge · orphan-evidence · href.ts · cert-events |

## 검증 (모두 DATABASE_URL=erp_w0714_test)

- Task 1·2 마감: 7 파일 152 시험 통과 · typecheck 0 · lint 0
- Task 3 마감:
  - kinds-off · href · kinds-core: 48/48
  - evidence-records(06.1 목록 「공개」 거르개) · notify-email · expense-result · approval-auto-read · cert-events: 99/99
  - unit import-cycles · notify-digest: 8/8
  - typecheck 0 · lint 0 · lint:sql 0
- 받아들임 점검: `ls domain/notify/kinds | wc -l` = 14(12 이상) · kinds에 insertEventNotifications 없음 · evidence-table.tsx 안 건드림 · notifications.ts `SKIP LOCKED` 3회
- E2E: 화면 파일을 건드리지 않아 돌리지 않았다

## TDD 증거

- RED를 먼저 확인했다:
  - Task 1: expense-result 모듈 없음 · 메일 형식 불일치
  - Task 2: 갈래 셋 실패 · 자동 읽음 행 그대로
  - Task 3: 종류 모듈 4개 없음(typecheck TS2307) · href 갈래 undefined
- 변이 점검(되돌린 뒤 다시 통과 확인):
  - expense-result.ts를 Task 1판으로 되돌리면 → 갈래 시험 3개 실패
  - 마감 창을 `from !== today`로 바꾸면 → days=1 시험 실패
  - orphan-evidence 기준을 `-days`로 바꾸면 → 3건→2건으로 실패
  - settle-nudge의 firstDue off-by-one은 질의 창(종료일 ≤ 오늘−N−1)이 막아 시험이 잡지 않는다. 경계는 질의 창이 정한다

## Skills invoked

- superpowers:test-driven-development — 구현 전 1회(Task 1 착수)
- superpowers:systematic-debugging — 실패 추적 전마다:
  - 최종 승인 entityId 오판 — 원인: acted_at 순서. step_index로 고침
  - 같은 견적 줄 두 지출결의 → "지출결의 없음"
  - lint `expect.any` unsafe-any
- superpowers:verification-before-completion — 커밋 3회 전 각각 + 보고 전
- plant8:design-gate — 호출 안 함. app/ · ui/ 화면 파일을 건드리지 않았다

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] test/unit/lib/email-sender.test.ts 수정** (Task 1, 62b457db)
   - composeDigest 입력이 `{text, href}` 객체로 바뀌어 typecheck가 깨졌다.
   - 메시지 꼴과 새 제목에 맞췄다.
2. **[Rule 3 - Blocking] test/integration/notify/kinds-core.test.ts 등록부 단언** (Task 1)
   - 07-10 시험이 "등록부 = 여섯"을 단언했다.
   - `defaults.enabled` 기본 켬 종류로 거르게 바꿨다.
3. **[Rule 1 - Bug] 최종 승인 선택을 step_index 기준으로** (Task 1)
   - 시각 기준으로 고르면 앞 단계를 "마지막"으로 잘못 골랐다.
4. **계획 `<files>` 밖 파일을 건드림**
   - repositories/evidence-records.ts: countPublishedUnattachedBefore. 계획 ③이 허락한 "그 조각을 repository로"에 해당한다.
   - domain/evidence-records/index.ts: CARD_FORMATS export 한 단어.
   - repositories/cert-events.ts · domain/certs/events.ts: 확인증 갈래 묶음 판정. 기존 scopeOf · scopeWhere를 재사용했고 새 권한 규칙은 없다.
5. **받아들임 grep `SYSTEM_VIEWER` in email-phase.ts == 0 불충족**
   - 이미 있던 4곳(import · claim · recordOutcome · finish 감사 viewer)이다.
   - 이 플랜이 더한 href 계산은 받는 사람 viewer(`{id, roleId}`)로 한다.
6. **pre-cutoff-unapproved는 tx 대신 전역 풀로 읽는다**
   - listApprovingPaymentTargetRows · loadPaySchedules(07-01 파일)에 tx 인자가 없다.
   - pay-week-alert 선례를 따랐다. 두 읽기 모두 잠금 대상 표를 FOR UPDATE하지 않는다.
7. **착지 링크 결재 단계 갈래: 연차 · 정산 문서는 문서마다 판정**
   - canSeeLeaveDocument · canSeeSettlementDocument에 묶음 판정 함수가 없다.
   - 판정을 새로 쓰지 않으려고 문서마다 부른다. 지출결의(대다수)는 묶음 한 번이다.
   - 시험의 질의 수 고정은 지출결의 · 프로젝트 · 화면 갈래로 확인했다.

## 열린 질문 (권장안으로 진행)

1. **정산 상신 재촉 기준일**
   - 지금: 종료일 다음 날(정산 가능일) + N, status = settling만.
   - 대안: effectiveOnFor 마지막 상태 변경일.
   - 권장: 지금대로.
2. **견적 재촉 판정**
   - 지금: "살아 있는 견적 줄 0개". 프로젝트마다 첫 차수가 자동으로 생기므로 차수 유무로는 판정할 수 없다.
   - 입찰 중은 포함한다.
   - 권장: 지금대로.
3. **지급 완료 · 취소의 본인 제외**
   - 기안자가 직접 지급 처리한 경우 알리지 않는다.
   - 권장: 지금대로.
4. **연차 · 정산 결재 단계 링크의 문서별 판정**
   - 묶음 판정 함수를 만들지 여부(N+1 최소화).
   - 권장: 메일 20줄 상한이라 지금은 두고, 필요하면 결재 모듈에 묶음 판정을 더한다.

## Known Stubs

없음.

## Next Phase Readiness

- 07-22: `{projectId}:{dueDate}` entityId는 documentIdOf로 이미 처리된다.
- 07-23: 계좌 바뀜 종류는 등록부에서 quote-nudge와 orphan-evidence 사이에 끼운다. 자리는 시험 주석에 표시했다.

## Self-Check: PASSED
