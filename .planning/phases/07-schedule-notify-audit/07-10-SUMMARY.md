---
phase: 07-schedule-notify-audit
plan: 10
type: execute
status: complete
requirements: [NOTI-03, EXP-12]
branch: claude/07-10-notify-rules
merge_owner: session
subsystem: notify / 알림 엔진
tags: [notify, condition-kinds, rules-merge, event-window, ladder, pay-week-alert, approval-waiting, p3]
commits: 2
plan_head_before: 53da29a0
actuals:
  tokens: 31000
  tasks: 3
  commits: 2
files_modified:
  - domain/notify/condition-kinds.ts
  - domain/notify/limits.ts
  - domain/notify/rules.ts
  - domain/notify/ladder.ts
  - domain/notify/recipients.ts
  - domain/notify/tick.ts
  - domain/notify/kinds/pay-week-alert.ts
  - domain/notify/kinds/approval-waiting.ts
  - domain/notify/kinds/project-end-no-expense.ts
  - domain/notify/kinds/paid-no-evidence.ts
  - domain/notify/kinds/prepaid-evidence.ts
  - domain/notify/kinds/proxy-registered.ts
  - domain/notify/kinds/ladder-support.ts
  - domain/notify/kinds/paid-expense-ladder.ts
  - repositories/notification-rules.ts
  - repositories/notifications.ts
  - repositories/notify-sources.ts
  - test/support/notify-tick.ts
  - test/unit/notify/rules.test.ts
  - test/unit/notify/ladder.test.ts
  - test/unit/row-scope-disposition.test.ts
  - test/integration/notify/pay-week-alert.test.ts
  - test/integration/notify/event-window.test.ts
  - test/integration/notify/rules-merge.test.ts
  - test/integration/notify/kinds-core.test.ts
  - docs/OPERATIONS.md
---

# 07-10 SUMMARY — 알림 엔진 채우기(규칙 병합 · 사건 창 · 사다리 · 기본 종류 여섯)

한 줄: 04.2의 빈 등록부를 켜진 기본 종류 여섯(종료 후 지출결의 없음 · 지급 예정일 임박 · 결재 차례 · 증빙 없음 재촉 · 선결제 증빙 독촉 · 대리 등록)으로 채우고, 9시 tick이 「코드 기본값 ⊕ `notification_rules` 행」 · 고정 14일 사건 창 · 종류별 시간 예산 · 독촉 사다리 · 받는 계급 추가(회사 전체) · 이메일 끔을 처리한다.

## 만든 것

### Task 1 (tracer) — a0191d7f
- `ConditionKind` 계약 확장(`defaults` · `daysRange` · `ladder` · `defaultRecipientLabel`), `EvaluateContext`(`today` · `params` · `since` · `tx`). 상수 `NOTIFY_EVENT_LOOKBACK_DAYS=14` · `NOTIFY_KIND_EVAL_MAX=1000`은 순환 import를 피하려 잎 모듈 `domain/notify/limits.ts`에 두고 `condition-kinds.ts`가 다시 내보낸다.
- `domain/notify/rules.ts`: `effectiveRule` · `effectiveRules` · `eventWindowSince`(= max(오늘 KST 00:00 − 14일, `enabled_at`)). 범위 밖 일수는 기본값, 등록부에 없는 종류의 행은 무시.
- `tick.ts`: 잠금 tx 안에서 규칙 한 번 읽기 → 끈 종류는 `evaluate` 안 부름 → 켠 종류에 `params` · `since` · `tx`(R8) 전달. 종류마다 `notify.condition_ms`, 누적이 `txDeadlineMs / 2`를 넘으면 남은 종류를 그날 건너뛰고 `evaluation_failed` + `notify.condition_budget` 경고. 지난 tick 시각(`findLastTickRun`)은 쓰지 않는다.
- `pay-week-alert`: `listPaymentTargetRows` + `loadPaySchedules`로 `alertDate <= 오늘 <= 마감 날(cutoffAt의 KST 날짜)`인 묶음을 지급일마다 경영관리(`expenses.payments` write 보유 활성 사용자)에게 한 건. 요일은 07-01 `payWeekdayChar`. 일정 계산 실패(R15) 행은 뺀다.
- 시험: `rules.test.ts`(RED→GREEN) · `event-window.test.ts`(8건 RED 확인 뒤 GREEN) · `pay-week-alert.test.ts`(모듈 없음 RED 뒤 GREEN).

### Task 2 / 3 — efab1237
- `ladder.ts`(순수): `ladderRounds` · `ladderFinishedBefore`. `kinds/ladder-support.ts`: 최고 회차 한 후보만, 끝난 지 14일 넘은 건 0, 2회차부터 본인 + 팀장, 문장 끝 `· {N}회차`.
- `approval-waiting`: 결재함과 같은 `walkRoute`, 한 tick에 진행 중 인스턴스 · 조직 스냅숏 한 번. 열린 시각 = 앞 승인 단계(자기 결재 제외)의 가장 늦은 `actedAt`, 없으면 상신 시각. N=0은 `addBusinessDays(…, 0)`이 앞으로 구르는 것으로 처리(P6). 단계 id가 entityId라 반려 뒤 다시 올림은 새 행(K17). 대표 단계는 팀장 · 대표를 더하지 않는다.
- tick: 규칙 `extraRoleIds` → 그 계급의 회사 전체 활성 사용자를 (대상, 대상 id, 회차)마다 더함(보관 계급 · 보관 · 퇴직 제외, 계급 사용자는 tick마다 한 번에 읽음). 이메일 끔 → `emailStatus: "skipped_rule_off"`. `fresh.slice(0, max)` 줄은 그대로(R6).
- 나머지 넷: `project-end-no-expense` · `paid-no-evidence` · `prepaid-evidence` · `proxy-registered`. 증빙 유무는 `ownersWithEvidence` 재사용. 읽기는 모두 `repositories/notify-sources.ts`.
- 04.2 P3: #4 `read_at`을 `AT TIME ZONE 'UTC'`로(세션 TZ Asia/Seoul 시험, 되돌려 RED 확인) · #5 이메일 선점이 55P03(또는 같은 5초 한도의 57014)를 만나면 null · #6 `holiday.lunar_table_ending` 경고.
- `docs/OPERATIONS.md`에 평가 실패일 재실행 절차(R9).

## 열린 질문 · 결정(추천안으로 진행)
1. **대리 등록 팀 비용 연결**: **[사용자 결정 2026-10-22 20:52 KST]** 담당 PM이 없는 팀 비용 대리 등록은 카드 보유자(`corp_cards.holder_user_id`)에게 알린다. 보유자가 등록자 본인이면 보내지 않고(행동자 제외 규칙과 동일), 보유자 없는 카드(공용)는 받는 사람이 없어 보내지 않는다. 견적 줄 연결은 그대로 담당 PM. (이전 「수신자 없음」 고정 시험은 새 결정 시험으로 교체)
2. **선결제 독촉의 「기준 지급일」**: 살아 있는 지급 기록의 `pay_date` + 일수. 지급 취소 뒤 재지급하면 새 지급일 기준.
3. **N7에서 선결제 문서 제외**(N8이 맡음) · **증빙 면제(`waived`) 제외** · 증빙 무효 처리로 0이 된 건은 재촉 대상(증빙 0).
4. **종료 후 지출결의 없음에서 수주중(bidding) 프로젝트**: **[사용자 결정 2026-10-22 20:51 KST]** 수주중(`projects.status = 'bidding'`) 프로젝트는 종료일이 지나고 지출결의가 없어도 알리지 않는다(보관 · 수주중 · 미수주 · 완료 제외).
5. 첫 배포일 대리 등록 건수: 운영 데이터라 측정 불가 — 시험으로만 고정(지난 14일 건이 건마다 한 행, 하루 한 통 묶음 안).

## Deviations from Plan

### Auto-fixed Issues
**1. [Rule 3 - Blocking] 행 범위 처분표(ⓓ) 갱신** — `repositories/notify-sources.ts`의 projects 읽기 3건(`listDocumentTitles` · `listProjectsEndedWithoutExpense` · `listProxyRegistrations`)이 `test/unit/row-scope-disposition.test.ts`의 `PROJECT_READ_DISPOSITION`에 없어 실패 → 이유와 함께 3줄 추가(files_modified 밖 시험 파일 1개).
**2. [Rule 1] 종류 평가 시간 시계** — 처음에 주입 시계 `monotonicNow`로 쟀더니 `notify-email` 예산 시험(호출마다 25초 흐르는 시계)이 깨져 `performance.now()`로 바꿈.
**3. 순환 import 회피** — 상수를 `limits.ts` 잎 모듈로(위).
**4. docs/OPERATIONS.md 300줄 한도** — 문서가 이미 300줄이라 새 항목을 별도 줄이 아니라 「수동 실행」 줄 뒤에 같은 항목으로 이었다. 07-09가 같은 파일 인증 절에 줄을 더하면 300줄 한도 시험(`docs-limits`)에 걸리니 머지 때 그쪽에서 다른 줄을 줄여야 한다.
**5. 수락 grep 불일치**: `grep -c "ladderRounds(" kinds/approval-waiting.ts >= 1`은 0 — 사다리 호출은 네 종류가 같이 쓰는 `ladder-support.ts`(`ladderCandidates`)에 있다. 동작은 시험으로 고정.
**6. 추가 파일**: `domain/notify/limits.ts` · `kinds/ladder-support.ts` · `kinds/paid-expense-ladder.ts`(공유 도우미).
**7. TDD 순서**: 결재 차례 · 나머지 넷 종류는 코드를 먼저 쓰고 시험을 뒤에 썼다(결재 차례는 모듈을 잠시 치워 RED 확인 후 복원, 나머지 넷은 시험을 먼저 쓰고 모듈 없음 RED 확인).

## 시험 결과
- 단위 전체 5317 통과, 1건 실패 `docs-limits` EVIDENCE-STORAGE `vendor_document` — **기존 실패**(PR-S 마이그레이션 0043~0045가 만든 `files_owner_kind_check` 주인 종류를 `docs/EVIDENCE-STORAGE.md`가 못 따라감, 이 플랜이 만진 파일 아님).
- 통합 notify 묶음(`test/integration/notify/*` + `notify-tick` · `notify-tick-auth` · `notify-inbox` · `notify-email`) 126 통과. `pnpm typecheck` · `eslint .` 통과.
- 풀 연결: 종류 평가는 `ctx.tx`로 읽고, 남의 읽기(`listActiveInstances` · `listPaymentTargetRows` · `loadPaySchedules`)는 풀 연결 그대로라 겹치는 연결은 잠금 tx + 1.

## 건드리지 않은 경로
`repositories/approvals.ts` · `domain/approvals/` · `domain/payments/pay-schedule.ts` · `domain/settings/registry.ts` · `domain/settings/keys.ts` · `domain/approvals/route-step-settings.ts` — 변경 없음(#272와 충돌 없음). `db/` 차이는 겹쳐 쌓은 PR-S 몫. 화면 파일(`app/` · `ui/`) 변경 없음 → `plant8:design-gate` 해당 없음.

## 호출한 스킬
`superpowers:test-driven-development`(코드 전) · `superpowers:verification-before-completion`(커밋 전). `systematic-debugging`은 실패 추적이 시험 날짜 착오(개천절 대체공휴일 10-05, 선결제 기준일 산수)와 시계 선택이라 별도 호출 없이 원인(시험 입력)을 바로 확인.

## Known Stubs
없음.

## Self-Check: PASSED
- 커밋 a0191d7f · efab1237 존재, 새 파일 전부 존재, 위 시험 결과는 이 세션에서 실행한 출력.

## 2026-10-22 사용자 결정 반영 (fix2)
- 위 결정 1 · 4 반영. 시험 먼저(RED 2건 확인) → 구현 → GREEN. 호출한 스킬: `superpowers:test-driven-development` · `superpowers:verification-before-completion`.
- 변경: `repositories/notify-sources.ts`(`listProjectsEndedWithoutExpense`에 `bidding` 제외, `listProxyRegistrations`가 `recipientId` 반환 — 견적 줄=PM · 팀 비용=카드 보유자), `domain/notify/kinds/proxy-registered.ts`, `test/integration/notify/kinds-core.test.ts`.
