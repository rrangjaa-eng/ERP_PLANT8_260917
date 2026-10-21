# Phase 07 — /plan-eng-review (2026-10-21)
대상: `.planning/phases/07-schedule-notify-audit/` (28 plans · 7 waves) · 기준 커밋 `82fc1bf`(origin/main `a17eba8` 포함) · 분석: Opus 서브에이전트(읽기 전용) · 교차 검토: Opus(Codex 대신, 사용자 결정 10/5 선례)

## 진행 방식 (사용자 부재 적응)
- 이 스킬은 결정마다 묻는 대화형이다. 이 세션은 사용자 부재 중이므로 04.6·06 선례를 따른다. 제품·범위·정책이나 잠긴 결정(D-701~749)을 바꾸는 지적은 **사용자 결정**으로 PR #258에 올리고 pending으로 둔다. 제품 동작을 바꾸지 않는 계획 내부 수정은 **세션 수용**으로 표시해 `/plan-design-review` 뒤 계획 파일에 한꺼번에 반영한다. 세션 수용은 사용자 승인이 아니며, 사용자는 PR에서 어느 항목이든 거부할 수 있다.
- 설정 질문: 교차 프로젝트 학습(설정 안 바꿈) · `/office-hours`(건너뜀, 근거는 CONTEXT·RESEARCH) · gstack 업그레이드(범위 밖).
- Outside Voice: gstack `codex_reviews=disabled`이고 CLAUDE.md §6이 Codex를 디자인 검토에만 허용한다. 대신 새 문맥 Opus 교차 검토를 돌렸다(아래 절).

---

## 본분석

# Phase 07 — plan-eng-review 분석 (읽기 전용, main 34a1959 기준)

범위: 07-01~07-28 PLAN · CONTEXT(D-701~D-749 잠김) · REVIEWS(Round-1 67건) · ROADMAP 07 절 · 실제 코드 대조.
총평: Round-1 반영이 촘촘하다. 실제 코드 대조에서 **실행을 깨는 P0는 찾지 못했다.** 남은 것은 병합 순서·처리량(P1~P2), 몇 개의 계약 틈(P2), 문서 사실 정정(P3). Round-1 Addressed 항목(R20 분할 틈, 07-13 TRUNCATE 우회, 사건 창 C-P1-1, 사다리 C-P2-2, 자동 읽음 SKIP LOCKED, K30 gate)은 플랜 안 처리가 실제 코드와 맞아 재제기하지 않는다.

---

### 1. Scope Challenge

#### 이미 있는 것(재사용 확인 — 실제 경로)
| 하위 문제 | 기존 코드 | 플랜 사용 |
|---|---|---|
| 영업일·KST | `domain/holidays/business-day.ts:30 toKstDate · :55 isBusinessDay · :59 addBusinessDays` · `domain/holidays/calendar.ts:20 loadHolidayLookup` · 음력 표 `lunar-table.ts:5-6`(2025~2035) | 07-01 재사용 + `prevBusinessOnOrBefore` 신설(현재 없음 — 확인) |
| 표 밖 해 방어 | `domain/leave/guard.ts:25` NO_HOLIDAYS 선례 | 07-01 ④ 그대로 |
| 승인 시각 | `repositories/expenses.ts:625 statusChangedAtExpr`(현재 차수 max(acted_at)) · `db/schema/approvals.ts:76 acted_at` | 07-01 ④ 같은 식 재사용 — 승인은 `domain/approvals/index.ts:739 recordStepAction`으로만 일어나 최종 승인에 acted_at이 항상 있음(확인) |
| 알림 tick | `domain/notify/tick.ts`(잠금 tx 안 종류 평가, dedup, 상한) · `repositories/notifications.ts:12 NOTIFY_TX_DEADLINE_MS=25_000` · 등록부 `condition-kinds.ts:23 CONDITION_KINDS=[]` · Scheduler `scripts/deploy.sh:632 ensure_scheduler`(`--max-retry-attempts=0 --attempt-deadline=180s` :647) | 07-10 계약 확장 |
| 행동 로그 정리 | `repositories/action-log.ts:170-187 markActionLogRowsPruned`(prunedAt·prunedBy 한 번 UPDATE) | 07-13 트리거 UPDATE 허용 조건과 정확히 일치(확인) |
| 잠금/초기화 | `domain/auth/accounts.ts:72,104` · `lib/auth.ts:70` `RATE_LIMIT_LOGIN_MAX` · `lib/env.ts:66` 기본 10 | 07-09 |
| 시드 | `domain/seed/index.ts:205-233`(시스템 관리자만 upsert, 나머지 insert-if-absent) | 07-05 대표 `admin.action-log` 켬 — 기존 행이 없으면 스테이징에도 반영됨 |

#### 최소 변경 집합 / 복잡도
- 플랜 28 · 웨이브 7 · PR 23(위험 3 + 무인 20) · 새 마이그레이션 8개(0039~0046 예상) · 새 domain 모듈: `domain/payments/pay-schedule*`, `domain/notify/{rules,ladder,recipients,href,kinds/*(13)}`, `domain/vendors/{account-*,contacts,documents}`, `domain/projects/{budget,pre-estimate,documents}`, `domain/revenue/{collection,invoice-file}`, `domain/evidence/private-files`, `domain/action-log/{changes,detail-lines}`. 새 화면 라우트 2(`/admin/notification-rules`, `/projects/budget`).
- 단일 페이즈로는 큰 편이나 D-713(범위 잠김)이 정한 것 — 축소 제안 안 함.

#### 미룰 수 있는 것(잠긴 결정을 깨지 않는 범위)
- 없음에 가깝다. D17 6종·임자 없는 증빙·수금 지연은 시드 꺼짐이라 07-14/07-22/07-23의 "종류 등록"만 해도 되고 화면은 07-19 하나로 충분 — 이미 그렇게 계획됨.

#### TODOS.md 교차
- `TODOS.md:30-41` 「자동 정산을 예약 작업으로」 — Depends on: 「Phase 7 Scheduler 기반」. 07은 Scheduler 기반을 새로 만들지 않고(04.2가 이미 만듦) 이 TODO를 어느 플랜도 소유하지 않는다 → **F-09**.
- `TODOS.md:119` ② 「action_log.detail 노출 꺼진 계급은 /admin/action-log 500」(`domain/action-log/index.ts:264-266`에서 `ForbiddenError` throw) — 07-05가 대표 행동 로그를 열고 07-25가 행동 로그 화면을 고치는데 이 결함을 다루는 줄이 없다 → **F-05**.
- `TODOS.md:408-420`(관리자 목록 `ui/table` 이관, Depends on Phase 7) — 07 SCOPE에 없음, 07.1 분류로 보이나 TODO의 Depends 표기는 낡음(NOT in scope에 기록).

#### 배포·CI 함의
- Cloud Scheduler 잡은 그대로(새 잡 없음). 종류 수 0 → 14로 늘어 tick 평가 시간이 처음으로 의미를 가진다(F-04).
- 마이그레이션 8개가 PR-S 하나로 한 번에 배포 — `migrate()` 단일 트랜잭션(.claude/rules/db.md)이라 07-11 백필 UPDATE 2건 + CHECK 교체가 같은 트랜잭션. 운영 데이터 전이라 수용 가능.
- `.github/workflows/` 수정 없음(07-13 AQ-17이 `ci.yml:124-131` POSTGRES_USER=erp superuser 전제만 읽음 — 맞음).

---

### 2. Architecture

#### 흐름 A — 지급 예정일 (D-715 단일 함수)
```
expenses(scheduled_payment_date=수동만) ─┐
evidence_record_links.min(issued_on) ────┼─> loadPaySchedules(viewer,rows) ──> resolvePaySchedule() [순수]
approval_steps.max(acted_at) 현재차수 ───┤        │ settings: term_days·weekday·cutoff_time
vendors.payment_term_days(07-02/07-06) ──┘        │ holidays lookup(표 밖 해=주말만)
                                                   v
             ┌──────────── PaySchedule{payDate,autoPayDate,manual,cutoffAt,alertDate,pushReason}
             v                     v                         v                       v
   listPaymentTargets      gate("payment.cutoff")     notify pay-week-alert     payRuleLine(화면)
   (07-01/06, 그룹·합계)     (domain/rules)             (07-10, alertDate)        (07-16·07-28)
```
#### 흐름 B — 알림 tick
```
Cloud Scheduler 09:00 KST ─OIDC─> POST /internal/notify-tick (attempt-deadline 180s, retry 0)
  runTick: isBusinessDay? ── no ─> tick_run 기록 + (07-14) 자동읽음 정리만
     │yes
  withNotifyTickLock(tx, 25s 마감)
     ├ listNotificationRules(tx)  (07-10)
     ├ for kind in CONDITION_KINDS(최대 14): evaluate({today,params,since})  ← 풀 연결로 SYSTEM_VIEWER 읽기
     │     누적 > 12.5s → 남은 종류 skip + evaluation_failed (그날 메일 선점 보류)
     ├ dedup(kind,entity,entityId,recipient,round) → insert ≤ batchMax
     └ tick_run
  runEmailPhase (사람당 1통)
결재 승인/반려 tx ── markStepNotificationsRead(SKIP LOCKED) (07-14)
```
#### 흐름 C — 행동 로그 불변
```
domain 행동 ─> recordAction ─> action_log INSERT
                     정리(OPS-05) ─> UPDATE pruned_at/by (NULL→값, 나머지 jsonb 동일) ─ 통과
                     DELETE/TRUNCATE/기타 UPDATE ─> trigger RAISE (07-13)
test/integration/setup.ts truncateAll(): SET LOCAL session_replication_role=replica (시험만)
E2E global-setup: DROP SCHEMA public CASCADE (트리거 무관 — 확인 test/e2e/global-setup.ts:47)
```

#### 아키텍처 지적 (≤8)

**F-01 [P1 · conf 8 · USER] PR-S가 W4 끝에야 ready → 무인 PR 약 16개가 W4 끝 + 사용자 머지까지 전부 막히고, 그 뒤 「한 번에 하나 · 스테이징 초록 뒤 다음」으로 직렬 머지된다.**
- 근거: `07-01-PLAN.md:202` 「ready 예상: PR-AUTH = W2 끝 · PR-PERM = W3 끝(D-722 카드 답 뒤) · PR-S = W4 끝.」 + `:203-204` 「**머지는 기다린다:** depends_on 사슬이 모두 main에 들어갈 때까지 … 위상 순서로 한 번에 PR 하나, 앞 머지의 스테이징 배포가 초록이 된 뒤 다음」.
- 07-06(W2)은 07-02만, 07-10(W3)은 07-07만 필요하지만 07-13(W4, 트리거 — 소비 코드 없음, 07-25만 의존)이 같은 PR에 묶여 있어 W2~W6 무인 PR 전부가 W4 끝까지 main에 못 들어간다. 그동안 무인 브랜치들은 "depends_on 브랜치를 머지 커밋으로 품고" 쌓이므로 hot 파일(`domain/expenses/index.ts`·`dto.ts`·`domain/notify/condition-kinds.ts`·`tick.ts`·`repositories/vendors.ts`·`app/(app)/expenses/payment-targets-table.tsx`)에서 머지 커밋 충돌이 누적된다. 결과적으로 7웨이브가 아니라 "W4 이후 ~16 PR 직렬 + 각 스테이징 배포 대기"가 실제 임계 경로.
- 실패 시나리오: 사용자가 PR-S를 하루 늦게 머지 → W5·W6 실행은 진행되지만 main은 W1 상태에 머묾 → 07-25(W7) 계급 스모크가 main이 아닌 스택 브랜치에서만 녹색.
- 권고(둘 다 D-726의 PR-S 구성을 바꾸므로 USER): (a) PR-S를 07-02·07-07·07-11까지로 W3 끝 ready, 07-13을 넷째 작은 위험 PR(PR-S2)로 분리 — 사용자 머지 3→4회. (b) 현 구성 유지 시 플랜에 "PR-S 머지 지연 시 무인 PR들은 draft 유지, 스택 브랜치 재머지 주기"를 명시(plan-internal). 추천 (a).

**F-02 [P2 · conf 7 · plan-internal] 07-01이 W1 끝 main에 먼저 들어가 지급 목록 묶음·순서를 바꾸지만, 그 결과를 설명하는 화면(배지·결재 중 칸·규칙 줄)은 07-16(PR-S 뒤)까지 없다 — 스테이징에서 "승인됐는데 다음 주로 간 건"이 이유 표시 없이 보인다.**
- 근거: `07-01-PLAN.md:454` 「`listPaymentTargets`의 `groupExpenses(..., approved)` 호출을 `payWeekGroupLabel` 기반 묶음으로 바꾼다 … `approvingByWeek` … `groups`와 합계에는 넣지 않는다」, 화면은 `07-16`(W3, depends 07-06 → PR-S).
- 운영 전(Phase 8 전환 전)이라 사용자 영향은 스테이징뿐. 권고: 07-01 PR 본문·SUMMARY에 「중간 상태: DTO 칸만, 화면 07-16」 한 줄 + 07-01 E2E(`payment-schedule.spec.ts`)가 기존 표에서 그룹 머리글 문자열만 단언하는지 확인(새 배지 단언은 07-16으로). plan-internal.

**F-03 [P2 · conf 6 · plan-internal] tick 종류 평가가 잠금 tx 밖의 풀 연결로 읽는다 — `DB_POOL_MAX=5`에서 잠금 tx 1 + 종류 쿼리 + 같은 시각 사용자 요청(9시 출근 30명 로그인, D-723)이 경합.**
- 근거: `domain/notify/tick.ts`(실제) `withNotifyTickLock(SYSTEM_VIEWER, async (tx) => { … kind.evaluate({ today }) …` — evaluate에 tx가 없다. `lib/env.ts:54 DB_POOL_MAX: numberWithDefault(5)`. 07-10 `:154` 「종류 평가는 지금처럼 잠금 tx 안에서 돈다 … 누적이 `txDeadlineMs / 2`를 넘으면 남은 종류를 그날 평가하지 않는다」.
- 종류 14개 중 결재 차례는 `listActiveInstances` + `listOrgSnapshot` + 인스턴스마다 `walkRoute`(07-10:236). 9시에 Cloud Run 인스턴스 하나가 tick과 로그인 폭주를 함께 받으면 풀 대기 → 12.5s 예산 소진 → `evaluation_failed` → **그날 메일 전원 보류**(04.2 규칙). 조용하진 않지만(`notify.condition_budget` 경고) 하루 통째 메일 누락.
- 권고: 07-10 Task 1에 "풀 대기 포함 종류 시간" 측정과, 종류 쿼리가 tx를 받을 수 있게 `EvaluateContext`에 선택 `tx?` 추가(새 연결 0) 또는 Scheduler 시각을 08:5x로 당기는 운영 메모 중 하나. 기본 권고: `tx` 전달(04.2-10 「풀 연결 하나 더 없음」 원칙과 일치 — `TickDeps.batchMax` 주석). plan-internal.

**F-04 [P2 · conf 6 · plan-internal] evaluation_failed 하루 보류 + Scheduler 재시도 0 → 한 종류의 일시 오류가 그날 모든 사람의 메일을 막는다. 07이 종류를 0→14로 늘리며 이 결합이 처음 실전화된다.**
- 근거: tick.ts 주석 「실패한 종류가 누구의 알림을 덜 만들었는지 모르므로 실행 기록에 evaluation_failed를 남긴다(04.2-10 이메일 선점이 전원 보류한다)」, `scripts/deploy.sh:647 --max-retry-attempts=0`. 07-10 `:154`는 예산 초과도 같은 경로로 보낸다.
- 알림함 행은 들어가고 메일만 다음 영업일로 밀리므로 D-706(사람당 하루 한 통)은 지켜진다. 그러나 D-701 「지급일 2영업일 전 9시」 임박 알림 메일이 하루 늦으면 마감 뒤 도착.
- 권고: 07-10에 "evaluation_failed 날 pay-week-alert 메일 지연" 통합 사례 1개 + OPERATIONS 한 줄(수동 재실행 절차). 보류 범위를 "실패 종류의 수신 후보"로 좁히는 것은 04.2 결정 변경이라 USER — 여기선 제안만.

**F-05 [P2 · conf 7 · plan-internal] 대표에게 `/admin/action-log`를 열어 주는데(07-05), `action_log.detail` 정보 항목이 꺼진 계급은 페이지가 500 — 대표 노출 표(D-722)가 detail을 끄면 ADMN-10 갭이 404→500으로 바뀔 뿐이다.**
- 근거: `07-05-PLAN.md:33` 「대표가 새 배포 직후 `/admin/action-log`를 열 수 있다」; 실제 `domain/action-log/index.ts:264-266` `if (!(await visibleFn(viewer, DETAIL_INFO_ITEM))) { throw new ForbiddenError("행동 로그 열람 권한 없음"); }`; `TODOS.md:119` ② 「action_log.detail 노출이 꺼진 계급은 /admin/action-log가 500」.
- 권고: 07-05 결정 카드 표에 「대표 `action_log.detail` 정보 항목 = 켬」 행을 명시하고 계급 스모크(07-05 E2E · 07-25)가 대표 페이지 200 + 행 1개 이상을 단언. 500 자체 수정은 07-25(action-log 화면 소유)에 넣는 것을 권고(page에서 Forbidden→404/빈 상태). plan-internal(07-25에 결함 수정 추가 — 범위 안 화면).

**F-06 [P2 · conf 5 · plan-internal] D-728 서버 거부가 화면 PR(07-17, 무인)의 액션 층에만 있고 `domain/auth/accounts.ts unlockAccount`(PR-AUTH)는 퇴직자도 푼다.**
- 근거: `07-17-PLAN.md:52` 「서버 `unlockPerson`도 목록 `퇴직` 낱말과 같은 기준으로 거부」; 07-09 files_modified에는 `domain/auth/accounts.ts`가 있으나 D-728 언급 없음(07-09 grep: D-728 0건). `scripts/account-cli.ts` 등 다른 호출처는 우회.
- 퇴직자는 07-09 로그인 막기로 어차피 못 들어오므로 보안 영향은 낮음 → P2. 권고: 07-17 `unlockPerson` 거부를 domain(`domain/people`)에 두고 단위 시험 — 이미 그렇다면 플랜 문장에 위치를 명시. auth 층 이동은 PR-AUTH 범위 변경이라 하지 않음.

**F-07 [P3 · conf 6 · plan-internal] `approval-waiting` 알림 entity가 `approval-step`(단계 id) — 착지 링크가 행마다 단계→인스턴스→문서 조회를 요구.**
- 근거: `07-14-PLAN.md:266` 「`approval-step` → 단계 → 문서 종류별 상세 URL … 갈래별 묶음 조회」. 묶음 조회로 N+1은 피하나, 알림함 읽기 경로에 결재 표 조인이 새로 생긴다 — `07-19` 알림함 쿼리 성능 시험에 이 갈래 행 50개 사례 추가 권고.

---

### 3. Code quality (≤8)

**F-08 [P2 · conf 6 · plan-internal] hot 파일 다중 소유 — 같은 파일을 4~5개 플랜이 연속 수정.**
- `domain/notify/condition-kinds.ts`: 07-10 · 07-14 · 07-22 · 07-23. `domain/payments/targets.ts`: 07-01 · 07-06 · 07-23. `domain/expenses/dto.ts`: 07-01 · 07-06 · 07-16 · 07-23. `app/(app)/admin/vendors/*`: 07-20 · 07-23. `test/integration/leak-scan.test.ts`: 07-03 · 07-20 · 07-24 · 07-25.
- 웨이브가 겹치지 않아 동시 충돌은 없음(§8 표 확인). 그러나 F-01과 결합하면 스택 머지 충돌. 권고: 등록부는 "끝에 한 줄 추가" 규칙(07-10:280 「순서 = SC-07 표 순서」와 충돌 — 07-19가 등록 순서로 행을 보임)이므로 07-22·07-23이 넣을 위치를 SC-07 표 위치로 명시. plan-internal.

**F-09 [P3 · conf 7 · plan-internal(기록만)] `TODOS.md:30-41` 자동 정산 예약 작업이 "Depends on: Phase 7 Scheduler 기반"인데 07 어느 플랜도 소유·이관하지 않는다.** 권고: 07-01 페이즈 지도 「뺌」 표에 한 줄(07.1 또는 별도 quick) + TODOS Depends 갱신은 실행 세션 몫.

**F-10 [P3 · conf 5 · plan-internal] `resolvePaySchedule` 반복 상한 "예: 60주" 넘으면 throw — 목록 하나가 통째 500.**
- 근거: `07-01-PLAN.md:443` 「반복 상한 가드(예: 60주)를 넘으면 오류를 던진다」. 표 밖 해는 주말만 lookup이라 실제로 도달 불가에 가깝지만, 던지는 위치가 `loadPaySchedules` 안이면 지급 목록·tick 종류 전체가 실패. 권고: 행 단위 격리(그 행만 `pushReason` 오류 표시 + log.error) 또는 상한 사례 단위 시험으로 도달 불가 증명. plan-internal.

---

### 4. Tests

#### 커버리지 다이어그램(계획된 시험 = planned)
```
지급 예정일 순수 함수 resolvePaySchedule      [★★★ planned] 07-01 단위(경계 15종·D-741·D-749·K30)
  └ 로더(증빙 issued_on·표 밖 해)              [★★ planned] 통합 pay-week-targets·holiday-rederive
  └ gate payment.cutoff                         [★★★ planned] 단위+통합(정각/+1분)
  └ 거래처 기한 vendorTermDays                  [★★ planned] 07-06
  └ 설정 요일 변경                              [★ planned]→E2E payment-weekday-setting(serial)
  └ 중간 상태(07-01만 main)                     [GAP] F-02
「이번 주로」(D19) + 되돌리기 + 로그           [★★ planned] 07-06 move-to-this-week · →E2E 07-16
tick 규칙 병합·사건 창·사다리                  [★★★ planned] 07-10 event-window·ladder·rules-merge
  └ 풀 대기·예산 초과 시 메일 보류 영향         [GAP] F-03/F-04
결재 자동 읽음 SKIP LOCKED + 다음 tick 정리     [★★★ planned] 07-14 approval-auto-read(두 연결)
꺼 둔 종류 6 · 수금 지연 · 계좌 바뀜           [★★ planned] 07-14 kinds-off · 07-22 · 07-23
행동 로그 불변 트리거                          [★★★ planned] 07-13 DELETE/TRUNCATE/UPDATE 4갈래 + setup 우회
  └ markActionLogRowsPruned 회귀                [★★ planned] (기존 action-log 통합 + 07-13 정리 칸 통과)
퇴직 로그인·세션 끊기                          [★★★ planned] 07-09 retiree-login(어제/오늘/내일)
초기화가 잠금도 풂·잠금 경쟁                    [★★ planned] 07-09 reset-unlocks·lockout
IP 한도 60                                      [★ planned] env 단위 + rate-limit 통합
권한 시드 D-722 · 딸린 권한 · 계급 가드         [★★ planned] 07-05·07-15·07-26 통합
  └ 대표 action-log 200 + detail 숨김 계급 500  [GAP] F-05
누수 스캔 자동 로드·DTO 대조                     [★★★ planned] 07-03·07-25
R20 files 칸 백필·판정                          [★★ planned] 07-11·07-27
예산(증액만 자동·직접 수정·첫 저장 백필)        [★★ planned] 07-24 단위+통합 →E2E
화면 전체                                       [→E2E] 07-16~07-25 + design-review DOM 감사
```
#### 회귀 위험 (CRITICAL 보호 대상)
| 기존 동작 | 위협 플랜 | 보호 단언 | 계획 여부 |
|---|---|---|---|
| 지급 단건·일괄 처리 동작은 gate로 막히지 않음(EXP-12) | 07-01 | `payment-single/batch` 통합: cutoff 밀림 건도 지급 처리 성공 | 계획됨(07-01:452 주석 + files에 두 시험) |
| 결재 승인 tx가 메일 단계 잠금을 기다리지 않음 | 07-14 | 두 연결 시험, 승인 지연 < lock_timeout | 계획됨 |
| 행동 로그 정리(OPS-05) 유지 | 07-13 | `markActionLogRowsPruned` 후 행 수 반환 = 기존 | 계획됨 |
| 기존 `scheduled_payment_date` 값 보존(D-740) | 07-01/07-02/07-06 | 마이그레이션 뒤 값 불변 + `manual=true` | 계획됨 |
| 통합 시험 setup 4파일 `resetDatabase()` | 07-13 | `truncateAll()` 공용 | 계획됨(07-13:118) |
| 제출 필수 `상세`(J13)로 기존 제출 시험 전부 | 07-28 | 공용 픽스처만 수정 | 계획됨(files 30+) |

#### VALIDATION.md 매핑
- 28 플랜 모두 1회 이상 등장(grep 확인). F-03/F-04/F-05 GAP은 VALIDATION에 행 없음 → 추가 권고.

---

### 5. Performance (≤8)
- **P-1** tick 종류 14개 · 풀 5 · 25s 잠금 — F-03.
- **P-2** `loadPaySchedules`는 지급 대상 전부를 JS로 계산(D-715 "읽을 때 계산"). 30명 규모 수백 행 — 문제 없음. 홈·목록이 같은 로더를 여러 번 부르지 않는지(설정 2키·공휴일 한 번) 07-06 소비처 추가 시 단언 권고(`loadHolidayLookup` 호출 1회 spy).
- **P-3** `listEarliestIssuedOnForExpenses` group by owner_id — `evidence_record_links(owner_kind, owner_id)` 색인 존재 여부 실행 때 확인(못 확인 → conf 4, 부록).
- **P-4** action_log 불변 → 무한 증가. 정리는 표시만. 30명 규모 연 수십만 행 수준 — 지금 색인 `action_log_pruned_occurred_idx` 유지로 충분. 보관 정책은 범위 밖(NOT in scope).
- **P-5** 거래처 내려받기 5,000 상한(D-736) — 서버 메모리 OK.
- **P-6** approval-waiting 종류: 활성 인스턴스마다 walkRoute — O(인스턴스) 메모리, 상한 1000(`NOTIFY_KIND_EVAL_MAX`). OK.

---

### 6. Failure modes
| 경로 | 실패 | 시험? | 처리? | 사용자에게 보임/조용 |
|---|---|---|---|---|
| tick 종류 평가 | 풀 대기로 예산 초과 | 부분(예산 시험) | evaluation_failed | 메일 하루 지연 — 로그만 → **준-조용**(F-03/F-04) |
| tick 전체 | Cloud Run 180s 초과/5xx | 기존 04.2 | 재시도 0, 다음 영업일 창 14일 | 조용(다음날 회복) |
| 지급 로더 | 반복 상한 throw | 계획 단위 | throw → 목록 500 | 보임(F-10) |
| 지급 로더 | 음력 표 밖 해 | 계획 | 주말만 | 날짜 조금 틀림, 조용(수용, AQ-08) |
| 공휴일 추가 | 승인된 건이 cutoff로 뒤집힘 | 계획(holiday-rederive) | D-705 의도 | 배지로 보임 |
| 자동 읽음 | 메일 단계 잠금 행 | 계획 | SKIP LOCKED + 다음 tick | 하루 미읽음, 수용 |
| 불변 트리거 | Phase 8 데모 정리 DELETE | 없음 | 없음(07-13:115 「아침 확인 필요」) | 보임(마이그레이션/스크립트 실패) — Phase 8 몫 |
| 퇴직 세션 | 쿠키 캐시로 퇴직일 늦게 반영 | 계획(같은 쿠키 getSession) | fail-closed | 보임 |
| R20 분할 틈 | PR-S~07-27 사이 업로드 false | 수용 | 종류 갈래 | 조용(수용, 운영 전) |
| PR-S 머지 지연 | 무인 PR 정체 | 없음 | 없음 | 보임(진행 정지) — F-01 |
**치명 틈(무시험·무처리·조용)**: 없음. 준-조용 1건(F-03/F-04).

---

### 7. Sequencing / PR 묶음 (D-724/D-726/D-727)
- 위험 경로 파일이 무인 플랜에 섞인 곳: 없음(front-matter 대조 — `db/`·`domain/auth/`·`domain/permissions/`는 07-02/07/11/13 · 07-09 · 07-05/15/26에만). 07-15가 `domain/archive`·`repositories/roles.ts`·`domain/seed`를 같이 들고 가는 것은 허용(비위험 파일이 위험 PR에 실림 — 사용자 머지 대상이 늘 뿐).
- 교착: 없음. 무인 PR이 사용자 PR을 기다릴 뿐 역방향 의존 없음. 단 처리량 병목 F-01.
- 마이그레이션 번호: main 마지막 `0038_phase61_evidence.sql`(확인) → 0039~0046 예상. 원격 브랜치는 `origin/main` · `origin/ccr-ddfc1a72-xza8gd`뿐 — 다른 마이그레이션 경합 현재 없음. 재생성 절차(07-11:127, 07-13:109 `--custom` 본문 옮김)는 손질 목록이 있어 OK. 07.1 계획 레인이 먼저 마이그레이션을 내면 PR-S 재생성 필요 — 이미 절차화.
- 07-08(W2 무인)이 `auth.lockout.*` 범위 키를 바꾸고 07-09(PR-AUTH)가 읽는다 — 07-08 depends_on에 07-09 없음. 키 스키마만 바꾸고 기존 기본값(5/15)이 범위 안이라 독립 머지 가능(문제 없음, 확인용 메모).

### 8. Worktree 병렬 표
| 웨이브 | 병렬 플랜 | 공유 파일 충돌 | depends-on |
|---|---|---|---|
| 1 | 07-01 · 07-02 · 07-03 · 07-04 · 07-12 | 없음(07-01 keys.ts vs 07-04 registry.ts 별개) | — |
| 2 | 07-05 · 07-06 · 07-07 · 07-08 · 07-09 · 07-26 | 없음 | 07-03 / 01·02·04 / 02 / 01·04 / 04 / 04 |
| 3 | 07-10 · 07-11 · 07-15 · 07-16 · 07-17 | 없음 | 07-07·01 / 07 / 05·26·12 / 06·12 / 09·12 |
| 4 | 07-13 · 07-14 · 07-18 · 07-20 · 07-21 · 07-27 · 07-28 | 없음(07-18 `domain/rules/register.ts` 단독) | 11 / 10·01 / 11·12·01 / 15·02·12·06 / 15·12·17 / 11 / 16 |
| 5 | 07-19 · 07-22 | 없음 | 15·10·14·12 / 18·14·11·08·12·27 |
| 6 | 07-23 · 07-24 | 없음 | … / … |
| 7 | 07-25 | — | 13개 |

### 9. NOT in scope / What exists / 사실 정정
- NOT in scope: 07.1 92행, Phase 9 수금 데이터, action_log 보관·아카이브, 실행 계정 REVOKE(07-13:86 infra 몫), TODOS:408 관리자 표 이관, TODOS:30 자동 정산(F-09).
- What exists: §1 표.
- 사실 정정(행동 변화 없음):
  - CONTEXT `code_context` 「시드 `domain/seed/index.ts:204-345`」 — 실제 시드 권한 루프는 `:205-233`부터, 대표 행동 로그 행 위치는 플랜이 다시 확인할 것(줄 번호 이동).
  - CONTEXT 「`lib/auth.ts:69-71` 로그인 rateLimit」 — 실제 키 줄은 `lib/auth.ts:70` 하나(범위 표기 무해).
  - `prevBusinessOnOrBefore`는 기존 함수가 아니라 07-01이 새로 만든다(07-01:46은 기존처럼 읽힘) — `business-day.ts` export는 `toKstDate · formatKstMinute · formatKstTime · isBusinessDay · addBusinessDays`뿐.

---

#### 부록 — 억제(conf ≤4)
- S-1 (conf 4) `evidence_record_links (owner_kind, owner_id)` 색인 유무 미확인 — 07-01 로더 쿼리 계획 확인 권고.
- S-2 (conf 3) `payment.weekday` ≠ fri 설정 시 D-704 「다음 지급 가능 금요일」 문구와 「지급 요일 anchor」 구현 차이 — 플랜은 설정 요일 기준으로 일관, 결정 문구만 금요일. 사용자 의도 확인 여지.
- S-3 (conf 4) 월~금 전부 공휴일 주 처리 결과(앞 주 마지막 영업일)가 기준일 이하가 되는 경우 — D-749 사례와 같은 경로로 보이나 별도 시험 없음.
- S-4 (conf 3) 07-17 퇴직 판정 기준(`resignationDate < 오늘`)과 목록 「퇴직」 낱말 기준 일치 여부 — 07-17:52 「같은 기준」이라 적혀 있으나 person-status.ts 기준을 보지 못함.

---

## Outside Voice — Opus 교차 검토 (Codex 대신)

독립 문맥 Opus(Plan 에이전트, 읽기 전용). 웨이브 depends_on 순서는 맞고, 문제는 머지 위상에 몰려 있다는 판단.

| ID | 심각도 | 확신 | 내용 | 처리 |
|---|---|---|---|---|
| X-F1 | P1 | 8 | 07-01-PLAN.md:202 「PR-S = W4 끝」 + 「한 번에 PR 하나, 스테이징 초록 뒤 다음」 → W2~W4 무인 PR 약 15개가 사용자 머지 한 번 뒤 직렬 대기. 하류 브랜치가 미머지 묶음을 품은 채 쌓임 | F-01과 같음 → R1 |
| X-F2 | P1 | 7 | 07-01-PLAN.md:202 번호 충돌 시 「지우고 `pnpm db:generate` 재실행」. 07-13(`--custom`, 07-13-PLAN.md:146)·07-11 백필·07-02 validate는 손 SQL이라 재생성하면 빈 껍데기가 되고 grep 가드만 통과할 위험 | R2 |
| X-F3 | P2 | 6 | 07-02 `0039`/`0040`(NOT VALID → VALIDATE) 분리가 PR-S 한 번 머지로 같은 migrate Job에서 연달아 돈다 — 분리 이점 없음 | R3 |
| X-F4 | P2 | 6 | 07-13-PLAN.md:119 「`UNPRUNABLE_ACTION_TYPES` 정리 금지는 DB에 옮기지 않는다」 — 접속기록(`cert_view`·`mask_reveal`, `domain/action-log/prune-scope.ts:6-13`) 정리 표시 UPDATE를 DB가 통과 | R4 |
| X-F5 | P2 | 6 | 07-01-PLAN.md:202 `git checkout origin/main -- <경로>`는 경로만 덮는다 — 묶음 PR이 리뷰로 API가 바뀌면 하류 호출부 깨짐이 CI에서야 드러남 | R5 |
| X-F6 | P3 | 5 | 07-10-PLAN.md:156 새 계급 사용자에게 14일 창 알림이 한꺼번에 — 메일 켬 종류면 대량 발송. 결정은 유지, 받는 사람별 상한 시험 1건 | R6 |

문제 없음 확인: 07-13 트리거와 E2E 초기화(`global-setup.ts:47` DROP SCHEMA CASCADE, `reset-test-db.sh` DROP DATABASE)는 충돌 없음. `actor_id` FK에 ON DELETE 동작 없음.

교차 일치: 본분석 F-01과 교차 X-F1이 독립적으로 같은 P1을 찾았다(머지 위상). 나머지는 서로 겹치지 않는다.

## Decision ledger

| ID | 지적 | 판정 | 반영 위치(예정) |
|---|---|---|---|
| **R1** | **F-01 · X-F1 — PR-S(07-02·07-07·07-11·07-13)가 W4 끝에야 ready, 무인 PR ~15개가 사용자 머지 뒤 직렬 대기** | **사용자 결정(D-726 변경) — PR #258 [사용자 결정 요청]. 추천: 07-13을 넷째 위험 PR로 떼고 PR-S(07-02·07-07·07-11)를 W3 끝 ready(사용자 머지 3→4회). 대안: 웨이브별 S1~S4 분할, 또는 현행 유지 + 직렬 큐 길이·소요를 07-01 지도에 명시. 답 전까지 현행(D-726) 유지** | 07-01 지도 · ROADMAP |
| R2 | X-F2 — custom SQL 마이그레이션 재생성 시 본문 소실 | 세션 수용: 「본문 보관 → 같은 이름 `--custom` 재생성 → 복원 → `db:generate` No schema changes + 재생성 전후 SQL 본문 diff 비어 있음」 | 07-01 머지 규칙 |
| R3 | X-F3 — NOT VALID/VALIDATE 분리 이점 없음 | 세션 수용: 파일은 유지하고 같은 Job에서 돌아도 되는 이유(표 크기·잠금 시간)를 07-02에 명시 | 07-02 |
| R4 | X-F4 — 정리 금지 종류를 DB가 못 막음 | 세션 수용: 07-13 트리거에 `NEW.action_type NOT IN (UNPRUNABLE)` 조건 + 통합 시험 1건(Deferred 해제, 결정 D-7xx와 무관) | 07-13 |
| R5 | X-F5 — 묶음 PR 변경 시 하류 재반영 절차 | 세션 수용: 묶음 PR이 리뷰 뒤 바뀌면 하류 브랜치 즉시 반영 + `pnpm typecheck`·관련 단위 시험 | 07-01 머지 규칙 |
| R6 | X-F6 — 새 계급 대량 알림 | 세션 수용: tick `max` 상한이 받는 사람별로도 걸리는지 시험 1건(동작 불변) | 07-10 |
| R7 | F-02 — W1 지급 목록 순서 변경이 설명 배지(07-16)보다 먼저 스테이징에 | 세션 수용: 07-01 PR 본문에 중간 상태 한 줄 + E2E 단언 범위 분리 | 07-01 · 07-16 |
| R8 | F-03 — tick 종류 평가가 잠금 tx 밖 풀 연결 사용(`DB_POOL_MAX=5`, 종류 0→14) | 세션 수용: `EvaluateContext`에 선택 `tx` 전달 | 07-10 |
| R9 | F-04 — 평가 실패일 메일 전원 보류, 재시도 0 → D-701 임박 메일 지연 | 세션 수용(일부): 통합 사례 1 + OPERATIONS 재실행 절차. 보류 범위 축소(04.2 규칙 변경)는 채택 안 함 — 필요하면 사용자 결정으로 따로 | 07-10 · OPERATIONS |
| R10 | F-05 — 대표 `/admin/action-log`가 `action_log.detail` 꺼진 계급에서 500(`domain/action-log/index.ts:264-266`, TODOS.md:119 ②) | 세션 수용: 07-25에서 500 수정 + 스모크 200 단언. 「대표 detail 켬」은 D-722 표 범위 안 확인만(권한 부여 변경이면 사용자 결정으로 승격) | 07-05 · 07-25 |
| R11 | F-06 — 퇴직자 잠금 풀기 거부 위치(07-17 액션 층만, `unlockAccount`는 허용) | 세션 수용: 거부 위치를 07-17에 명시 | 07-17 |
| R12 | F-07 — 착지 링크 결재 조인 성능 | 세션 수용: 07-19에 행 50개 성능 사례 | 07-19 |
| R13 | F-08 — 등록부 hot 파일을 4~5플랜이 연달아 수정 | 세션 수용: 07-22·07-23 삽입 위치를 SC-07 표 순서로 명시 | 07-22 · 07-23 |
| R14 | F-09 — TODOS.md:30-41 자동 정산 예약 작업에 맡은 플랜 없음 | 세션 수용(기록): 07-01 「뺌」 표에 한 줄 | 07-01 |
| R15 | F-10 — `resolvePaySchedule` 60주 상한 오류가 목록 전체 500 | 세션 수용: 행 단위 격리 + 단위 시험 | 07-01 · 07-16 |
| C1~C3 | 사실 정정: 시드 위치 `seed/index.ts:205-233` · `lib/auth.ts:70` · `prevBusinessOnOrBefore`는 07-01 신규 | 정정만 | 해당 read_first |

Approval readiness: 사용자 답 0건. 세션 수용 14건(R2–R15)은 계획 내부 수정이며 PR #258에서 거부할 수 있다. 사용자 결정 대기 1건(R1).

## Implementation Tasks
계획 문서 수정만(코드 없음). `/plan-design-review` 뒤 한 번에 반영.

- [ ] **T1 (P1)** — 07-01 — custom 마이그레이션 재생성 절차 + 묶음 PR 변경 시 하류 재반영. Surfaced by: R2 · R5.
- [ ] **T2 (P1)** — 07-01 · ROADMAP — R1 답 반영(답 전에는 현행 유지).
- [ ] **T3 (P2)** — 07-13 — 트리거 정리 금지 조건 + 시험. Surfaced by: R4.
- [ ] **T4 (P2)** — 07-10 — `tx` 전달, 받는 사람별 상한 시험, 평가 실패 사례 + 재실행 절차. Surfaced by: R6 · R8 · R9.
- [ ] **T5 (P2)** — 07-05 · 07-25 — 행동 로그 500 수정 + 스모크. Surfaced by: R10.
- [ ] **T6 (P2)** — 07-01 · 07-16 — 중간 상태 명시, 행 단위 격리. Surfaced by: R7 · R15.
- [ ] **T7 (P3)** — 07-02 · 07-17 · 07-19 · 07-22 · 07-23 — 문구·위치·성능 사례. Surfaced by: R3 · R11 · R12 · R13.
- [ ] **T8 (P3)** — 07-01 뺌 표 · read_first 사실 정정. Surfaced by: R14 · C1~C3.

## Unresolved decisions that may bite you later
- R1 — PR-S 머지 위상(D-726). 답이 없으면 W2~W6 무인 PR이 W4 끝 사용자 머지 뒤 직렬로 몰린다.

## Completion summary
- Step 0: Scope Challenge — 범위 그대로(잠긴 결정 불변)
- Architecture Review: 6 issues found (F-01~F-06)
- Code Quality Review: 2 issues found (F-08 · F-10)
- Test Review: diagram produced(본문 §4), 3 gaps identified (R4 · R6 · R9 시험)
- Performance Review: 2 issues found (F-03 · F-07)
- NOT in scope: written · What already exists: written
- TODOS.md updates: 0 (R14는 07-01 뺌 표에 기록)
- Failure modes: 1 critical gap flagged(R2 — 손 SQL 소리 없는 소실)
- Unresolved decisions: 1 in this review
- Outside voice: codex disabled(CLAUDE.md §6) → Opus 교차 검토 completed(in-host), 6 findings
- Parallelization: 본문 §8
- Lake Score: N/A(사용자 답 0)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — (마일스톤 수준에서만) | — |
| Outside Review | Opus 교차(in-host) · codex disabled | Independent 2nd opinion | 1 | issues_found (outside_status: disabled) | 6 findings |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 15 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (다음 단계) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex · plan-review · disabled. 대체 Opus 교차 검토 완료(in-host, 외부 커버리지 아님).
- **VERDICT:** 아직 CLEAR 아님 — eng review required(지적 반영 뒤 재검토 최대 1회).

**UNRESOLVED DECISIONS:**
- R1 — PR-S 머지 위상(D-726 변경 여부), PR #258 사용자 결정 요청
