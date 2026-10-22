---
phase: 07-schedule-notify-audit
plan: 13
subsystem: db-schema
status: complete
tags: [schema, migration, trigger, action-log, audit, PR-LOG, risk-migration]
requires: ["07-11"]
provides:
  - action_log 불변 트리거(함수 action_log_immutable · 트리거 action_log_no_delete · action_log_no_truncate · action_log_update_guard)
  - test/integration/setup.ts truncateAll() — beforeEach · resetDatabase 공용 replica 비우기
  - test/support/action-log-backdate.ts backdateActionLog(seq, occurredAt)
affects: ["07-25"]
tech-stack:
  added: []
  patterns: ["행 전체 to_jsonb 비교 UPDATE 가드(칸 목록 없음)", "시험 우회는 SET LOCAL session_replication_role = replica 트랜잭션뿐", "코드 목록 ⊆ 마이그레이션 SQL 표류 가드"]
key-files:
  created:
    - db/migrations/0046_phase7_action_log_immutable.sql
    - db/migrations/meta/0046_snapshot.json
    - test/integration/schema/action-log-immutable.test.ts
    - test/support/action-log-backdate.ts
  modified:
    - db/migrations/meta/_journal.json
    - test/integration/setup.ts
    - test/integration/bank-transfer-export.test.ts
    - test/integration/project-status.test.ts
decisions:
  - "07-13: action_log 불변 트리거 — DELETE · TRUNCATE 거부, UPDATE는 정리 안 된 행에 pruned_at · pruned_by를 함께 찍고 나머지 행 전체가 같고 끌 수 없는 여섯 종류가 아닐 때만 통과(P0001 'action_log is append-only')"
  - "07-13: 마이그레이션 머리에 lock_timeout 1s + statement_timeout 5s(Squawk require-statement-timeout을 배제 없이 SQL로 해결)"
  - "07-13: rollback-floor 없음 — 옛 리비전은 INSERT와 정리 UPDATE만 하고 둘 다 트리거를 통과"
metrics:
  duration: "약 50분"
  completed: 2026-10-22
plan_head_before: 47ac47df3aa09a70ee4ed74ee9154dc18bd3d2e8
actuals:
  tokens: 70675
  tasks: 3
  commits: 3
---

# Phase 7 Plan 13: action_log 불변 트리거(PR-LOG) Summary

행동 로그 `action_log`에 plpgsql 함수 하나 + 트리거 셋을 걸어 DELETE · TRUNCATE(CASCADE로 끌려 들어와도)를 DB가 거부하고, UPDATE는 「정리 안 됨 → 정리됨」 한 방향(정리 두 칸 밖 행 전체 `to_jsonb` 비교 · 끌 수 없는 여섯 종류 제외)만 통과시킨다. 시험 비우기 · 시각 당기기만 replica 트랜잭션으로 건너뛴다.

## 브랜치 · PR 상태(D-726)

- 브랜치 `claude/07-pr-log`(origin/main d8eb84ab에서) — 시작 때 `origin/claude/07-pr-s-schema`(PR #260)를 머지 커밋 `47ac47df`로 품음. origin/main은 그 뒤 새 커밋 없음.
- **PR-S 머지 대기.** PR-S가 아직 main에 없다(`git merge-base --is-ancestor origin/claude/07-pr-s-schema origin/main` 거짓) → Task 3 ④ ready 단계(origin/main 머지 · 번호 겹치면 재생성 · C2 · ready · 게이트 · 「사용자 머지 대기」)는 하지 않았다. PR은 draft로 둔다(오케스트레이터가 연다 — 본문 첫 줄 「위험 경로(db/) — PR-LOG 행동 로그 불변 트리거 · 사용자 머지 · PR-S 머지 뒤 ready」).
- 마이그레이션 번호 **0046(잠정)** · 재생성 안 함. PR-S가 main에 들어간 뒤 번호가 겹치면 이 플랜 파일만 `pnpm db:generate --custom --name=phase7_action_log_immutable`로 다시 만들고 본문을 옮긴다(R2).
- `git diff --name-only origin/claude/07-pr-s-schema...HEAD` = 이 플랜 files_modified 8개 그대로(+ 이 SUMMARY).

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| (시작) | 47ac47df | PR-S 브랜치 머지 커밋 |
| 1 | 53830057 | 트리거 마이그레이션 · setup `truncateAll()` · 트리거 통합 시험 |
| 2 | 3301629c | `backdateActionLog` 헬퍼 · 두 시험 옮김 · 헬퍼 사례 |
| 3 | a258a17a | Squawk — `statement_timeout` 머리 추가 |

## 검증(이 실행에서 직접 돌림 · DB `erp_w0713_test`)

- 통합 9파일 755건 녹색: `schema/action-log-immutable` · `action-log` · `evidence-row-scope` · `expense-visibility` · `evidence-file-only-filter` · `row-scope-entries`(`resetDatabase` 4파일 — 고치지 않음) · `bank-transfer-export` · `project-status` · `evidence-card-attach`.
- 단위 `test/unit/db/migration-journal.test.ts`(C2) · `test/unit/deploy/cli-bundle.test.ts` 11건 녹색.
- `migration-upgrade.test.ts` 24건 녹색(빈 DB 전체 적용).
- `pnpm lint:sql` → `Found 0 issues in 47 files` · `pnpm db:migrate` 0 · `pnpm db:generate` 마지막 줄 **`No schema changes, nothing to migrate 😴`**.
- `pnpm build:cli` 뒤 `node dist/cli/migrate-runner.mjs` 종료 0 · `__drizzle_migrations` 47 → 47(이미 적용 상태에서 0건 추가).
- 트리거 셋 존재 확인: `action_log_no_delete` · `action_log_no_truncate` · `action_log_update_guard`.
- eslint(바뀐 파일) 0 오류 · `pnpm typecheck` 0.
- RED 확인: 트리거 전 시험 11건 실패(DELETE 성공 등) · 트리거 뒤 setup 우회 전 14건 전부 실패(beforeEach TRUNCATE P0001) · 헬퍼 전 두 옮길 시험이 `update "action_log" set "occurred_at"`에서 실패.
- R4 변이 확인(임시 DB `erp_w0713_mut`, 끝나고 삭제): `NEW.action_type NOT IN` 줄을 빼면 「끌 수 없는 종류」 사례 실패 · `'cert_purge'` 하나를 빼면 표류 가드 실패. 파일은 원복(diff 없음).
- 수락 grep: 마이그레이션 파일 1개 · BEFORE TRUNCATE/DELETE/UPDATE · `to_jsonb(NEW)` · `OLD.pruned_at IS NULL` · `NEW.action_type NOT IN` 각 1 · setup `truncateAll()` 3 · `sql.raw(truncateStatement)` 1 · `grep -rln session_replication_role domain repositories app scripts lib` 빈 출력 · 4파일 diff 빈 출력.
- AQ-17: `.github/workflows/ci.yml` 서비스 `postgres:16` · `POSTGRES_USER: erp` 그대로(superuser — replica 설정 가능).

### 정리 취소 · 재귀속 · 다시 정리 `it` 제목(수락 기준 인용)

- 「정리 취소 — 이미 정리된 행의 pruned_at · pruned_by를 NULL로 되돌리면 P0001이고 처음 값 그대로다」
- 「재귀속 — 이미 정리된 행의 pruned_by를 다른 사람으로 바꾸면 P0001이고 처음 값 그대로다」
- 「다시 정리 — 이미 정리된 행에 pruned_at 새 값을 찍으면 P0001이고 처음 값 그대로다」

## 호출한 스킬

- `superpowers:test-driven-development` — 코드 전(RED → GREEN, 위 RED 확인).
- `superpowers:systematic-debugging` — 트리거 뒤 시험이 예상과 다르게 실패했을 때(원인: 두 번째 RED 실행이 그때 빈 0046 자리표시 파일을 적용 기록해 본문이 적용되지 않음 → 시험 DB를 새로 만듦. 코드 수정 없음).
- `superpowers:verification-before-completion` — 커밋 전.

## Deviations from Plan

1. **[Rule 3 - 순서] Task 2 트리거 시험을 Task 1 RED에서 함께 씀.** 플랜이 트리거 셋을 Task 1 마이그레이션 한 파일에 두라고 해, Task 2 시험을 나중에 쓰면 처음부터 녹색(TDD 위반)이 된다. TRUNCATE · UPDATE · R4 · 표류 가드 사례를 마이그레이션 본문 전에 써서 실패를 본 뒤 Task 1 커밋에 넣었다. Task 2 커밋은 헬퍼 · 옮기기 · 헬퍼 사례.
2. **[Rule 1 - 플랜 사실] `project-status.test.ts`의 두 번째 UPDATE(:700→:701)는 `occurredAt`이 아니라 `prunedAt` · `prunedBy`만 바꾼다.** 정리 안 된 행을 한 방향으로 정리하므로 트리거를 통과 — 플랜 지시(「prunedAt만 바꾸는 곳은 그대로」)대로 두었다. `test/` 전체 Grep에서 다른 옮길 곳은 없었다(남은 `update(actionLog)`는 이 줄과 `evidence-card-attach.test.ts:423` — 둘 다 정리 표시).
3. **[Rule 3 - Squawk] `require-statement-timeout`** — 배제 추가 없이 머리에 `SET LOCAL statement_timeout = '5s';`(0045 꼴)를 더해 해결(a258a17a).
4. **`pnpm db:dev` · `pnpm db:reset:test` 대신** W3 규칙대로 `erp_w0713_test`를 psql DROP/CREATE로 만들고 `DATABASE_URL`로 지정(로컬 Postgres는 이미 떠 있었음). `reset-test-db.sh`는 공용 `erp_test`를 지우므로 쓰지 않았다.

## Known Stubs

없음.

## 열린 결정(사용자 확인 필요 — 추천안으로 진행함)

- Phase 8 데모 정리 · 복구 리허설이 action_log 행을 지워야 하는지(플랜 AQ-17 「아침 확인 필요」). 추천: 지우지 않는다 — 필요하면 그 페이즈가 260907처럼 정리 동안만 트리거를 끄는 길을 따로 정한다.

## Self-Check: PASSED

- 파일 8개 존재 · 커밋 47ac47df · 53830057 · 3301629c · a258a17a 존재(`git log`로 확인).
