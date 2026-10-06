---
phase: 05-expense-approval-leave
plan: 14
subsystem: database
tags: [expenses, concurrency, idempotency, installments, money, postgres, tdd]

requires:
  - phase: 05-03
    provides: "createExpenseFromLines · saveExpenseDraft · submitExpense(already_submitted) · expenseLineDoor · remainingForInstallments · 부분 UNIQUE · 번호 CHECK · fixtures/expenses"
provides:
  - "생성 가장자리 12사례(두 번 · 동시 · 다른 기안자 · 여러 줄 · 이전 차수 · 닫힌 줄 · 표 전체 게이트 · 권리 없음)"
  - "createExpenseFromLines 프로젝트 쓰기 권리 판정(담당 PM 또는 업무 범위가 프로젝트 팀을 덮음) — 행 쓰기 전 첫 바퀴"
  - "submitExpense(viewer, input, deps?) — deps.afterLock(두 잠금 직후)"
  - "remainingForInstallments 원래 통화 갈래의 남은 원화 = 남은 외화 × 줄 실행가 환율"
  - "픽스처 submitReadyDraft(viewer, id, deps?) · addApprovedRevision(fx, rows)"
affects: [05-04, 05-05, 05-06, 05-09, 06-02]

actuals:
  tokens: 11500
  tasks: 2
  commits: 6

plan_head_before: f10b2513bdadbc42a911505a524ff5081cc3cf2e
commits: 6

tech-stack:
  added: []
  patterns:
    - "경합 사례: afterLock에 닿았는지 Promise.race로 단언한 뒤 waitForLockWaiter — 훅이 없으면 시간 초과가 아니라 단언 실패"
    - "승인된 차수에 줄이 필요하면 2차를 만들어 줄을 더하고 2차를 승인(addApprovedRevision)"

key-files:
  created:
    - test/integration/expense-create-idempotency.test.ts
    - test/integration/expense-submit-concurrency.test.ts
    - test/integration/expense-installment-cap.test.ts
    - test/unit/domain/expenses/installment-cap.test.ts
  modified:
    - domain/expenses/index.ts
    - domain/money/index.ts
    - test/integration/fixtures/expenses.ts

key-decisions:
  - "지출결의 생성의 프로젝트 쓰기 권리 = projects 쓰기 + (담당 PM 또는 업무 범위가 프로젝트 팀을 덮음) — Phase 4 periodEditRights와 같은 축. 여러 줄 중 하나라도 권리 밖이면 행을 하나도 만들지 않고 ForbiddenError"
  - "원래 통화 비교의 남은 실행가 원화는 남은 외화 × 줄 실행가 환율 — 문 닫힘(amountKrw <= 0)이 환율 변동에 흔들리지 않는다"
  - "afterLock은 프로젝트 · 지출결의 두 잠금을 잡은 직후, 이미 제출됨 판정 전"

patterns-established:
  - "제출 경합 사례는 submitReadyDraft(…, { afterLock })로만 — 05-04 · 05-09가 같은 모양을 쓴다"

requirements-completed: [EXP-01, EXP-14]

coverage:
  - id: D1
    description: "같은 줄 · 같은 기안자 두 번 · 동시 두 번 → 작성 중 하나, 다른 기안자는 자기 몫 하나"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-create-idempotency.test.ts#두 번 눌러도 하나"
        status: pass
    human_judgment: false
  - id: D2
    description: "여러 줄 · 이전 차수 · 닫힌 줄 · 표 전체 게이트(고객 승인 · 설정 끔 · 수주중 · 완료) · 권리 없음(권한 행 · 다른 팀 PM) — 막힌 줄은 {lineId, reason}, 권리 없음은 행 0"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-create-idempotency.test.ts#여러 줄 · 표 전체 게이트 · 권리 없음"
        status: pass
    human_judgment: false
  - id: D3
    description: "동시 제출 6건(풀 5) 번호 26001-0001~0006 · 다른 프로젝트 26002-0001 · 같은 줄 경합 두 순서 · 같은 문서 두 번 제출(차례 · 동시) already_submitted · 카운터 1"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-submit-concurrency.test.ts#동시 제출 번호 · 다른 프로젝트 카운터 · 같은 줄 경합 · 같은 문서 두 번 제출"
        status: pass
    human_judgment: false
  - id: D4
    description: "공급가액 빈 칸 · 0 거부 · 음수 저장 거부 · 번호 있는 행 0 UPDATE 23514 · 두 창 저장 충돌"
    requirement: EXP-14
    verification:
      - kind: integration
        ref: "test/integration/expense-submit-concurrency.test.ts#금액 0과 빈 칸 · 두 창"
        status: pass
    human_judgment: false
  - id: D5
    description: "회차 · 상한(원화 · 외화) · 강제 분할 · 닫힘, remainingForInstallments Q4 갈래"
    requirement: EXP-01
    verification:
      - kind: integration
        ref: "test/integration/expense-installment-cap.test.ts"
        status: pass
      - kind: unit
        ref: "test/unit/domain/expenses/installment-cap.test.ts"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 14: 지출결의 생성 · 제출 가장자리 Summary

**견적 줄 → 지출결의의 경계 사례 25개(통합 22 · 단위 7 중 새 사례)를 부분 UNIQUE · 프로젝트 행 잠금 · 번호 CHECK로 증명했고, 그 과정에서 드러난 틈 셋(다른 팀 PM 생성 허용 · 외화 회차 문 판정이 환율에 흔들림 · 제출 경합 훅 없음)을 고쳤다.**

## Performance
- **Started:** 2026-10-04T09:10:51Z · **Completed:** 2026-10-04T09:30Z (19 min)
- **Tasks:** 2/2 · **Files:** 7 changed(새 테스트 4 · 도메인 2 · 픽스처 1)

## Task Commits
| 단위 | 커밋 | 내용 |
|---|---|---|
| T1 RED | `fe71fb8c` | test — 생성 가장자리 12사례, 다른 팀 PM 사례 실패(RED_EVIDENCE_OK) |
| T1 GREEN | `a975bf05` | feat — 프로젝트 쓰기 권리 판정 |
| T2 RED(단위) | `49cfed46` | test — 회차 상한 Q4, 환율 변동 문 판정 실패(RED_EVIDENCE_OK) |
| T2 GREEN(단위) | `791757fd` | fix — 원래 통화 갈래 남은 원화 |
| T2 RED(통합) | `7b5846aa` | test — 제출 동시성 · 회차 통합 13사례 + 픽스처, 같은 줄 경합 실패(RED_EVIDENCE_OK) |
| T2 GREEN(통합) | `2350e62c` | feat — submitExpense deps.afterLock |

## 사례가 드러낸 틈과 수정
| 자리 | 틈 | 수정 |
|---|---|---|
| `domain/expenses/index.ts` `createExpenseFromLines` | `can(expenses/projects, write)`만 봐서 다른 팀 PM(같은 계급)이 남의 프로젝트 줄로 작성 중 문서를 만들 수 있었다(T-05-1401) | 줄 → 프로젝트를 먼저 다 읽고 `pmUserId === viewer.id \|\| coversProjectTeam(loadActorTeamScope(…, seoulToday()), teamId)`, 아니면 행 쓰기 전에 `ForbiddenError`. 트랜잭션 없음(전부 풀 읽기) |
| `domain/money/index.ts` `remainingForInstallments` | 원래 통화 갈래의 `remaining.amountKrw`가 실행가 원화 − 앞 문서 원화 합이라, 환율이 오르면 USD가 남아도 `expenseLineDoor`가 닫고 내리면 USD 0이어도 열었다 | 남은 원화 = `toKrw(남은 외화, 줄 실행가 환율)`. `exceeds` 판정 · 원화 갈래 불변 |
| `domain/expenses/index.ts` `submitExpense` | `deps.afterLock`이 없어 같은 줄 경합을 순서 고정으로 재현할 수 없었다 | 세 번째 인자 `deps?: { afterLock }` — 두 잠금 직후 호출 |

틈 없음(첫 실행부터 초록 — 기대값을 틀린 사본으로 Task 1 사례마다 빨강 확인): ON CONFLICT 뒤 재조회 · 여러 줄 줄마다 판정 · 게이트 문자열 · 닫힌 줄 최신 번호 · 동시 제출 6건(풀 5, 트랜잭션 안 풀 읽기 없음) · 카운터 period = 프로젝트 번호 · tx 안 재판정 · 회차 = tx 안 개수 + 1 · already_submitted · 금액 0/빈 칸 · 두 창.

## Deviations from Plan
1. **[Rule 3] 픽스처 `test/integration/fixtures/expenses.ts` 수정**(plan files 목록 밖) — `submitReadyDraft`에 `deps` 통과(경합 사례가 픽스처로만 제출하게) · `addApprovedRevision`(1차가 승인 잠금이라 6줄 · USD 줄을 2차에 더하고 2차 승인). 도메인 함수만 씀. `7b5846aa`.
2. **[Rule 1] 외화 회차 문 판정**(위 표 둘째 줄) — plan 단위 사례 셋 밖에 환율 오름 · 내림 사례 둘을 더해 드러냄. `domain/money` 안에서만 고침. `791757fd`.
3. **번호 있는 행 0 UPDATE** — 번호 있는 행의 공급가액을 바꾸는 리포지토리 함수가 없어(`updateDraftIfVersion`은 `number IS NULL` 조건) 테스트가 drizzle `db.update`로 직접 UPDATE(people.test.ts 23514 선례).
4. **T2 GREEN 커밋 하나가 `fix(05-14)`** — 돈 계산 틈 수정이라 fix 접두어. RED → GREEN 순서는 지킴.

**Total deviations:** 2 auto-fixed(Rule 1 · Rule 3) + 표기 2. **Impact:** 스키마 · 의존성 · 위험 경로 변경 0.

## Notes for later plans
- 05-04: `submitReadyDraft`에 증빙 첨부를 더하면 「같은 문서 두 번 제출 — 동시」 사례는 두 호출이 동시에 첨부한다(지금은 두 호출이 같은 version을 읽음). 첨부가 version을 올리면 그 사례를 확인할 것. 「차례」 사례는 두 번째를 `submitExpense`(옛 version)로 직접 부른다 — 번호 있는 문서는 version 판정 전에 already_submitted라 증빙과 무관.
- 05-05: `createExpenseFromLines`는 이제 권리 밖 프로젝트 줄이 하나라도 섞이면 전체 `ForbiddenError` — 줄 고르기 목록이 쓰기 권리 있는 프로젝트만 보여야 한다(UI-SPEC 701행과 같음). 막힌 줄의 `blocked` 순서는 「알 수 없는 줄」이 먼저, 그다음 입력 순.
- 경합 사례 모양: `raceSubmits`(expense-submit-concurrency.test.ts) — 05-04 Task 3 · 05-09 Task 3이 따라 쓴다.

## TDD Gate Compliance
RED 3건 모두 `RED_EVIDENCE_OK`(t1 · t2-unit · t2-int), 각 RED 커밋이 GREEN 커밋보다 앞섬.

## Verification
- unit: installment-cap · money 2 files 50 passed · import-cycles 2 passed.
- integration(Task 2 verify 명령 그대로): expense-submit-concurrency · installment-cap · create-idempotency · approval-lifecycle · document-counters-concurrency · projects-create-concurrency 6 files 32 passed.
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues · `pnpm build` 0 · `pnpm db:generate` "No schema changes".
- `git diff --stat f10b2513..HEAD -- db package.json pnpm-lock.yaml domain/quotes domain/projects` 비어 있음.
- 화면 없음 — E2E 해당 없음, next-server 띄우지 않음.
- requirements: `requirements.ready-ids` 0/2(형제 플랜이 EXP-01 · EXP-14를 아직 선언 중) — 표시하지 않음.

## Self-Check: PASSED
- 파일: 새 테스트 4개 · domain/expenses/index.ts · domain/money/index.ts · fixtures/expenses.ts 존재.
- 커밋: fe71fb8c · a975bf05 · 49cfed46 · 791757fd · 7b5846aa · 2350e62c 존재(`git rev-list --count f10b2513..HEAD` = 6).
