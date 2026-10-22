---
phase: 07-schedule-notify-audit
plan: 02
subsystem: database
tags: [postgres, drizzle, migration, check-constraint, squawk]

requires: []
provides:
  - "expenses.requested_payment_date · requested_payment_reason + expenses_requested_payment_pair_check (D-714 · D18)"
  - "expenses.scheduled_payment_set_by(→ users.id) · scheduled_payment_set_at + expenses_scheduled_payment_set_check (C6)"
  - "vendors.payment_term_days + vendors_payment_term_days_range_check · vendors_payment_term_days_supplier_check (J5)"
  - "vendors.version integer NOT NULL DEFAULT 1 (G9 · V3)"
  - "PR-S 묶음 브랜치 claude/07-pr-s-schema + draft PR"
affects: [07-06, 07-07, 07-11, 07-16, 07-20]

actuals:
  tokens: 124800   # chars/4 over `git diff origin/main...HEAD` (499186자 — 그중 스냅숏 둘이 대부분, 생성물)
  tasks: 2
  commits: 2       # git rev-list --count e340782..HEAD, SUMMARY 커밋 전 측정
plan_head_before: e3407821814d715b5d2ad37beaab6767ea7ef37b

tech-stack:
  added: []
  patterns:
    - "기존 표 CHECK · FK는 NOT VALID로 걸고 --custom 검증 마이그레이션에서 VALIDATE(0033 · 0035 꼴 그대로)"

key-files:
  created:
    - db/migrations/0039_phase7_payment_schedule.sql
    - db/migrations/0040_phase7_payment_schedule_validate.sql
    - db/migrations/meta/0039_snapshot.json
    - db/migrations/meta/0040_snapshot.json
    - test/integration/schema/phase7-s1-constraints.test.ts
  modified:
    - db/schema/expenses.ts
    - db/schema/vendors.ts
    - db/migrations/meta/_journal.json

key-decisions:
  - "기록 칸 CHECK 식: (set_by IS NULL AND set_at IS NULL) OR (set_by · set_at · scheduled_payment_date 모두 NOT NULL) — 예정일만 있는 행(D-740 기존 값)은 통과"
  - "희망일 쌍 CHECK 식: (requested_payment_date IS NULL) = (requested_payment_reason IS NULL) — 플랜 식 그대로. 공백 사유는 DB가 막지 않음(액션 zod 몫, 07-16)"
  - "거래처 기한 CHECK는 범위 · 갈래 두 제약으로 나눔(FA-1, 260907도 둘)"

patterns-established: []

requirements-completed: []  # EXP-11은 칸만 — 요구 완료는 소비 플랜(07-06 · 07-16 · 07-20) 뒤 오케스트레이터가 판정

coverage:
  - id: D1
    description: "희망 지급일 · 사유 한쪽만 적으면 DB가 거부(INSERT · UPDATE), 둘 다 · 둘 다 없음은 통과"
    requirement: "EXP-11"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s1-constraints.test.ts#07 S1 — 희망 지급일 · 사유 쌍"
        status: pass
    human_judgment: false
  - id: D2
    description: "수동 지정 기록 칸 — 한쪽만 · 예정일 없는 기록 거부, 없는 사용자 FK 거부, 기록 없는 예정일(D-740) 통과"
    requirement: "EXP-11"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s1-constraints.test.ts#07 S1 — 수동 지정 기록 칸"
        status: pass
    human_judgment: false
  - id: D3
    description: "거래처 지급 기한 1~180 · 협력사 갈래만, version 기본값 1"
    requirement: "EXP-11"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s1-constraints.test.ts#07 S1 — 거래처 지급 기한"
        status: pass
    human_judgment: false
  - id: D4
    description: "스키마 파일 · 마이그레이션 · 저널 · 스냅숏 일치(C2)"
    verification:
      - kind: other
        ref: "pnpm db:dev && pnpm lint:sql && pnpm db:migrate && pnpm db:generate → No schema changes"
        status: pass
      - kind: unit
        ref: "test/unit/db/migration-journal.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-21
status: complete
---

# Phase 07 Plan 02: 스키마 S1 — 희망 지급일 · 수동 지정 기록 칸 · 거래처 지급 기한 · version Summary

**지출결의 희망 지급일 · 사유 쌍 CHECK, 수동 지정 「누가 · 언제」 기록 칸(+ users FK · 예정일 동반 CHECK), 거래처 지급 기한(협력사만 · 1~180) · version 칸을 NOT VALID → VALIDATE 두 마이그레이션으로 추가 — 기존 예정일 값은 그대로(D-740).**

## Performance

- **Duration:** 약 25분
- **Tasks:** 2/2
- **Files modified:** 8 (+ 이 SUMMARY)

## Accomplishments

- `db/schema/expenses.ts` — `requestedPaymentDate` · `requestedPaymentReason` + `expenses_requested_payment_pair_check`, `scheduledPaymentSetBy`(→ users.id) · `scheduledPaymentSetAt`(timestamptz) + `expenses_scheduled_payment_set_check`, `scheduledPaymentDate` 주석을 「지급 권한자 수동 값 — null이면 자동」으로
- `db/schema/vendors.ts` — `paymentTermDays` · `version`(NOT NULL DEFAULT 1) + `vendors_payment_term_days_range_check` · `vendors_payment_term_days_supplier_check`, 표 머리 주석 한 줄
- `0039_phase7_payment_schedule.sql`(생성기 출력 + 머리주석 · SET LOCAL 두 줄 · CHECK 넷 · FK 하나에 ` NOT VALID`) — 데이터 UPDATE 없음
- `0040_phase7_payment_schedule_validate.sql`(`--custom` 생성 + 0035 꼴 머리주석 · R3 같은 Job 이유 · VALIDATE 다섯 줄)
- 통합 시험 16건(behavior 사례 전부 + 「쌍에서 사유만 지우는 UPDATE」 · 「기한 있는 협력사를 client로 바꾸기」 두 건 추가)

## Task Commits

1. **Task 1: 트레이서 — 스키마 칸 · CHECK + 생성 마이그레이션 + 통합 시험** — `739be74` (feat)
2. **Task 2: [BLOCKING] 검증 마이그레이션 · Squawk · 저널 가드 · 반영 일치** — `8cb484b` (feat)

## 검증 (실제로 돌린 명령과 결과)

| 명령 | 결과 |
|---|---|
| RED: 통합 시험(스키마 변경 전) | 16건 중 15 실패(칸 없음 — 의도대로). 「둘 다 · 둘 다 없음」 1건은 drizzle이 모르는 키를 버려 빈 행으로 통과 — 스키마 뒤 의미 있는 시험이 됨 |
| `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts` | Task 1 뒤 7/7 · Task 2 뒤 7/7 녹색 |
| 통합 `phase7-s1-constraints` · `vendors` · `vendor-kind` (Task 1) | 3 files · 70 tests passed |
| 통합 `phase7-s1-constraints` · `vendors` · `vendor-kind` · `phase65-schema` (Task 2 뒤) | 4 files · 90 tests passed |
| `pnpm db:dev && pnpm lint:sql && pnpm db:migrate && pnpm db:generate` | exit 0, 마지막 줄 `No schema changes, nothing to migrate 😴` |
| `pnpm lint:sql` | `Found 0 issues in 41 files` |
| `pnpm lint` · `pnpm typecheck` | 둘 다 exit 0 (lint는 기존 boundaries 설정 경고만) |
| 수락 grep — expenses.ts | `requested_payment_date` ≥1 · `expenses_requested_payment_pair_check` 1 · `scheduled_payment_set_by` ≥1 · `expenses_scheduled_payment_set_check` 1 |
| 수락 grep — vendors.ts | `payment_term_days` ≥1 · `version` ≥1 |
| 수락 grep — 0039 | `NOT VALID` 5줄 · `SET LOCAL lock_timeout = '1s';` 1줄 · `^\s*UPDATE ` 0 |
| 수락 grep — 0040 | `VALIDATE CONSTRAINT` 5줄 · `statement_timeout\|같은 트랜잭션` 3줄(≥2) |
| `git diff --name-only origin/main...HEAD -- .squawk.toml` | 빈 출력 |
| `git diff --name-only origin/main...HEAD` | files_modified 8개만(+ 이 SUMMARY) |

## Deviations from Plan

**1. [환경] 통합 시험을 공유 `erp_test` 대신 격리 DB `erp_test_0702`에서 돌림**
- **Found during:** Task 1 ④
- **Issue:** 플랜 verify의 `flock /tmp/plant8-erp-test.lock … pnpm db:reset:test && vitest …`를 돌렸더니 실패가 쏟아졌다. 원인 조사(`pg_stat_activity` · `ps`): 같은 컨테이너의 다른 워크트리 에이전트(agent-a16d2e48…, agent-a6edc78d…)가 flock 없이 같은 Postgres의 `erp_test`를 `db:reset:test`로 DROP · 재생성하고 있었다(`database "erp_test" does not exist` · 시드 중 TRUNCATE 충돌). 코드 결함이 아님.
- **Fix:** `DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp_test_0702`로 새 DB를 만들어(global-setup이 `??=`라 그대로 따름 — 마이그레이션 0000~0040 전부 적용) 같은 시험 파일을 돌림. 시험 내용 · 명령의 vitest 부분은 플랜과 같다. 스크립트는 저장소 밖(scratchpad).
- **Impact:** 결과 판정에 영향 없음. CI(잡마다 별 Postgres)에서 다시 확인된다.

**2. [기록] 로컬 공유 개발 DB `erp`에 0039 · 0040이 적용됨**
- 플랜의 `[BLOCKING]` 명령(`pnpm db:migrate`)이 `.env.local`의 `erp`에 반영한다. 같은 웨이브의 다른 플랜은 스키마를 바꾸지 않으므로(db.md 「한 웨이브에 스키마 플랜 하나」) 다른 세션에 해는 없다 — 새 칸은 null 허용 · 상수 기본값이라 main 코드가 그대로 돈다. 로컬 개발 DB일 뿐 운영 · 스테이징과 무관.

**Superpowers 스킬:** `test-driven-development` · `systematic-debugging` · `verification-before-completion`은 이 세션 스킬 목록에 없다(skill unavailable) — 규율은 그대로 따랐다(RED 확인 → 구현 → GREEN, 실패 원인을 pg_stat_activity로 확인 뒤 대응, 완료 전 모든 명령 재실행).

## Issues Encountered

위 Deviation 1(공유 시험 DB 경합) 외 없음. Squawk 새 경고 없음 — `.squawk.toml` 변경 없음.

## 다음 플랜 · 오케스트레이터 몫

- **07-07(W2) · 07-11(W3):** 같은 브랜치 `claude/07-pr-s-schema`에 이어 쌓는다. 07-11 ready 직전 origin/main 머지 뒤 번호가 겹치면 「다시 만들 때 손질」①~⑥을 07-02 → 07-07 → 07-11 순서로(이 플랜 몫: 0039 머리주석 · SET LOCAL · NOT VALID 다섯, 0040 본문 보관 → 같은 이름 `--custom` 재생성 → 복원). R2 본문 diff 확인은 재생성 때 수행 — 이번엔 재생성이 없어 해당 없음.
- **07-06:** 기록 칸 쓰기(`saveScheduledPayDate` · 「이번 주로」 · 자동으로 되돌리기 때 예정일 · set_by · set_at 셋 함께 비움), 데모 데이터 스크립트가 `scheduled_payment_date`를 더 쓰지 않게(AQ-02 · D-740).
- **07-16:** 희망 지급일 폼 — 사유 공백은 DB가 막지 않으니 액션 zod에서 trim 검사.
- **07-20:** 거래처 기한 입력 · 갈래를 client로 바꿀 때 기한 비우기(FA-1 — 안 비우면 `vendors_payment_term_days_supplier_check` 23514) · version 비교.
- **게이트:** 이 플랜 몫 `/review` + Opus 독립 검토 1명(오케스트레이터). 머지는 사용자(D-724 · D-726).
- **공유 시험 DB 경합:** 다른 워크트리 에이전트가 flock 없이 `erp_test`를 리셋함 — 병렬 실행자 프롬프트에 flock 또는 격리 DB를 명시하는 것을 권함.

## Self-Check: PASSED

- 파일 8개 존재 확인(`git diff --name-only origin/main...HEAD`)
- 커밋 `739be74` · `8cb484b` 존재(`git log --oneline -3`)
