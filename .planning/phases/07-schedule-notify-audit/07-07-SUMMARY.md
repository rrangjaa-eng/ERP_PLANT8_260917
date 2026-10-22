---
phase: 07-schedule-notify-audit
plan: 07
subsystem: database
tags: [postgres, drizzle, migration, check-constraint, squawk, notifications]

requires:
  - "07-02 S1 마이그레이션 0039 · 0040(같은 PR-S 묶음 브랜치)"
provides:
  - "notification_rules 표(notificationRules — 칸 아홉: kind PK · enabled · days(>= 0 CHECK) · extra_role_ids text[] DEFAULT '{}' · email_enabled · enabled_at · version DEFAULT 1 · updated_by → users.id · updated_at DEFAULT now())"
  - "notification_log.email_status = 'skipped_rule_off'(notification_log_email_status_check 일곱 값)"
affects: [07-10, 07-11, 07-19]

actuals:
  tokens: 123870   # chars/4 over `git diff 800a57b..HEAD`(495481자 — 대부분 스냅숏 둘, 생성물)
  tasks: 2
  commits: 2       # git rev-list --count 800a57b..HEAD, SUMMARY 커밋 전 측정
plan_head_before: 800a57b252d1e80ea0b24796d034af60d3e39886

tech-stack:
  added: []
  patterns:
    - "기존 표 CHECK 값 추가 = 생성기의 DROP + ADD 뒤 ADD에 NOT VALID, --custom 검증 마이그레이션에서 VALIDATE(0033 · 0035 · 0039 · 0040 꼴)"

key-files:
  created:
    - db/migrations/0041_phase7_notification_rules.sql
    - db/migrations/0042_phase7_notification_rules_validate.sql
    - db/migrations/meta/0041_snapshot.json
    - db/migrations/meta/0042_snapshot.json
    - test/integration/schema/phase7-s2-constraints.test.ts
  modified:
    - db/schema/notifications.ts
    - db/migrations/meta/_journal.json

key-decisions:
  - "notification_rules는 FA-1 아홉 칸 그대로 — 범위 칸(D-748) · 사람별 끄기(D-719) · 즉시 경로(D-716) 칸 없음, 칸 이름 목록을 통합 시험이 단언"
  - "enabled_at · updated_at은 notification_log와 같은 timestamp(tz 없음, UTC 저장) — 플랜 FA-1 그대로(07-02의 set_at은 timestamptz였지만 이 표는 같은 파일의 기존 꼴을 따름)"
  - "새 표 FK(updated_by → users)는 NOT VALID 없이 — 새 빈 표라 검증 비용 없음, squawk도 통과"

patterns-established: []

requirements-completed: []  # NOTI-03은 칸만 — 판정 07-10 · 화면 07-19 뒤 오케스트레이터가 판정

coverage:
  - id: D1
    description: "notification_rules 칸이 FA-1 아홉 칸과 정확히 같다(D-717 · D-748 · D-719 · D-716)"
    requirement: "NOTI-03"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s2-constraints.test.ts#07 S2 — 알림 규칙 덮어쓰기 표(D-717 · D-748)"
        status: pass
    human_judgment: false
  - id: D2
    description: "같은 kind 두 행 23505 · days -1 23514 · days 0 · 30 통과 · NULL 칸 행 통과 · 기본값(빈 배열 · version 1) · 없는 사용자 FK 23503"
    requirement: "NOTI-03"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s2-constraints.test.ts#07 S2 — 알림 규칙 덮어쓰기 표(D-717 · D-748)"
        status: pass
    human_judgment: false
  - id: D3
    description: "email_status skipped_rule_off 통과 · skipped_anything 23514 · 기존 여섯 값 통과"
    requirement: "NOTI-03"
    verification:
      - kind: integration
        ref: "test/integration/schema/phase7-s2-constraints.test.ts#07 S2 — notification_log.email_status 이메일 끔 값(P7)"
        status: pass
    human_judgment: false
  - id: D4
    description: "스키마 파일 · 마이그레이션 · 저널 · 스냅숏 일치(C2)"
    verification:
      - kind: other
        ref: "pnpm lint:sql && pnpm db:generate → No schema changes, nothing to migrate"
        status: pass
      - kind: unit
        ref: "test/unit/db/migration-journal.test.ts"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-10-22
status: complete
---

# Phase 07 Plan 07: 스키마 S2 — 알림 규칙 덮어쓰기 표 · 이메일 끔 상태 값 Summary

**조건 종류마다 관리자가 바꾼 칸만 담는 `notification_rules`(NULL = 종류 기본값 · `enabled_at` = 끔 → 켬 마지막 시각 · 범위 칸 없음)와 `notification_log.email_status = 'skipped_rule_off'`를 NOT VALID → VALIDATE 두 마이그레이션(0041 · 0042)으로 추가 — 시드 행 없음.**

## Performance

- **Duration:** 약 50분(병렬 실행 중 메모리 경합으로 lint 재시도 포함)
- **Tasks:** 2/2
- **Files modified:** 7 (+ 이 SUMMARY)

## Accomplishments

- `db/schema/notifications.ts` — `notificationRules`(FA-1 아홉 칸 + `notification_rules_days_check` `days IS NULL OR days >= 0`) · 머리 주석(D-717 · D-748 · D-719 · D-716 · 시드 없음) · `notification_log_email_status_check` 끝에 `'skipped_rule_off'`
- `0041_phase7_notification_rules.sql` — 생성기 출력 + 머리주석 · `SET LOCAL lock_timeout = '1s'` · `statement_timeout = '5s'` · email_status CHECK ADD에 ` NOT VALID`. 데이터 UPDATE · 시드 INSERT 없음
- `0042_phase7_notification_rules_validate.sql` — `--custom` 생성 + 0035 · 0040 꼴 머리주석 · `VALIDATE CONSTRAINT notification_log_email_status_check`
- 통합 시험 9건(behavior 사례 전부)
- `test/integration/setup.ts`는 스키마 배럴 전체를 TRUNCATE해 새 표가 자동 포함 — 변경 불필요. 새 DTO · registerDto 없음 → leak-scan 등록 불필요

## Task Commits

1. **Task 1: 트레이서 — 규칙 표 · 이메일 끔 값 + 생성 마이그레이션 + 통합 시험** — `36616e98` (feat)
2. **Task 2: [BLOCKING] 검증 마이그레이션 · Squawk · 반영 일치 · 저널 가드** — `0db48dce` (feat)

## 마이그레이션 번호

origin/main 마지막 = `0038_phase61_evidence` · 07-02 = `0039` · `0040` → 이 플랜 `0041` · `0042`(플랜 잠정 번호와 같음). 저널 가드 녹색. 재생성은 07-11 실행자 몫(이번엔 하지 않음).

## 검증 (실제로 돌린 명령과 결과 — W2-RULES 전용 DB `erp_w0707_test`)

| 명령 | 결과 |
|---|---|
| RED: 통합 `phase7-s2-constraints`(스키마 변경 전) | 9건 중 7 실패(표 없음 · skipped_rule_off CHECK 23514 — 의도대로). 거부 시험 2건(`skipped_anything` · 기존 값)은 기존 동작이라 통과 |
| 통합 `phase7-s2-constraints` · `notify-tick` · `notify-inbox`(Task 1 뒤, 새 DB) | 3 files · 46 tests passed |
| 통합 `phase7-s2-constraints`(Task 2 뒤, 새 DB — 0000~0042 적용) | 1 file · 9 tests passed |
| `pg_constraint.convalidated`(Task 2 뒤) | `notification_log_email_status_check` · `notification_rules_days_check` · `notification_rules_updated_by_users_id_fk` 모두 `t` |
| `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts` | Task 1 뒤 7/7 · Task 2 뒤 7/7 |
| `pnpm lint:sql` | `Found 0 issues in 43 files` |
| `pnpm db:generate` | 마지막 줄 `No schema changes, nothing to migrate 😴` |
| `pnpm typecheck` | exit 0 |
| `pnpm exec eslint`(브랜치에서 바뀐 TS 다섯 — 07-02 셋 + 이 플랜 둘) | exit 0 |
| `pnpm lint`(전체, `NODE_OPTIONS=--max-old-space-size=4096`) | 세 번째 시도에서 exit 0(앞 두 번은 Deviation 1) |
| 수락 grep — notifications.ts | `notification_rules` ≥1 · `skipped_rule_off` 1 · `enabled_at` ≥1 |
| 수락 grep — 0041 | `NOT VALID` 1줄 · `SET LOCAL lock_timeout = '1s';` 1줄 |
| 수락 grep — 0042 | `VALIDATE CONSTRAINT` 1줄 |
| `git diff --name-only origin/main...HEAD -- domain/ repositories/ app/` · `-- .squawk.toml` | 둘 다 빈 출력 |

## Deviations from Plan

**1. [환경] 전체 `pnpm lint`가 메모리 부족으로 두 번 끊김 — 힙 4096MB로 세 번째에 통과**
- **Found during:** Task 1 verify
- **Issue:** 기본 힙(2096MB)에서 `FATAL ERROR: Reached heap limit`(exit 134), `--max-old-space-size=6144` · `4096`에서는 병렬 작업 트리 여섯 개(eslint · tsc · vitest · next build 동시)의 메모리 경합으로 OOM 킬러(exit 137). 내 변경과 무관(스키마 파일 하나 · 시험 파일 하나).
- **Fix:** 먼저 브랜치에서 바뀐 TS 파일 전부를 `pnpm exec eslint`로 검사(exit 0), 푸시 전 경합이 줄었을 때 `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint` 전체 exit 0.
- **Impact:** 없음 — 코드 변경 없음.

**2. [W2-RULES] verify의 `pnpm db:dev && pnpm db:migrate && pnpm db:reset:test`를 전용 DB 비우기 + 통합 global-setup 마이그레이션으로 대신** — 규칙 §3 그대로. `pnpm db:migrate`(.env.local 개발 DB)는 돌리지 않았다.

## Known Stubs

없음.

## 다음 플랜 · 오케스트레이터 몫

- **07-11(W3, 같은 브랜치):** ready 직전 번호 재생성 때 이 플랜 몫 손질 — 0041 머리주석 · SET LOCAL 두 줄 · `--> statement-breakpoint` · email_status CHECK ADD에 ` NOT VALID`, 0042는 `--custom --name=phase7_notification_rules_validate`로 다시 만들고 본문 복원.
- **07-10:** `notification_rules` 읽기 — 등록부에 없는 kind 행 건너뛰기 · NULL 칸 = 종류 기본값 · `extra_role_ids`의 보관 계급 건너뛰기 · 사건 창 하한 `max(오늘 − 되돌아보기, enabled_at)` · 이메일 끔이면 `skipped_rule_off`. days 종류별 상한은 도메인 몫(DB는 >= 0만).
- **07-19:** 저장 시 version 비교 · 끔 → 켬일 때만 `enabled_at` 갱신 · `updated_by` · `updated_at`.
- **게이트:** PR-S 묶음 `/review` + Opus 독립 검토 1명(W3 끝, 오케스트레이터). 머지는 사용자(D-726).
- **환경:** 병렬 실행자들이 같은 scratchpad 경로를 공유한다 — 로그 파일 이름이 겹치면 서로 덮어쓴다(이번에 lint 로그가 07-05 것으로 덮임). 전체 eslint는 2GB 기본 힙을 넘는다.

## Self-Check: PASSED

- 파일 다섯 존재 · 커밋 `36616e98` · `0db48dce` 존재(`git log`)
