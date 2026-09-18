---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-09-18T09:14:36.814Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | lint-warning | .squawk.toml |  | prefer-timestamp-tz excluded — better-auth 12개 timestamp 컬럼이 timezone 없음, timestamptz 전환은 스키마 전체 변경 필요(01-04 범위 밖) | open |  | 2026-09-18T09:14:36.211Z |  |
| 2 | 01 | lint-warning | .squawk.toml |  | prefer-bigint-over-int excluded — rate_limits.count(integer)는 better-auth 자체 필드, bigint 전환은 adapter 스키마 검사와 충돌 위험 | open |  | 2026-09-18T09:14:36.412Z |  |
| 3 | 01 | lint-warning | .squawk.toml |  | adding-required-field excluded — rate_limits.id NOT NULL 추가(0002), 마이그레이션 시점에 테이블이 항상 비어 있어 실질 위험 없음 | open |  | 2026-09-18T09:14:36.610Z |  |
| 4 | 01 | lint-warning | .squawk.toml |  | require-concurrent-index-creation excluded — drizzle migrate()의 단일 트랜잭션과 CONCURRENTLY가 근본적으로 양립 불가(현재 SQL엔 미사용, 예방적 배제) | open |  | 2026-09-18T09:14:36.814Z |  |

````json
[
  {
    "id": 1,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "prefer-timestamp-tz excluded — better-auth 12개 timestamp 컬럼이 timezone 없음, timestamptz 전환은 스키마 전체 변경 필요(01-04 범위 밖)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.211Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "prefer-bigint-over-int excluded — rate_limits.count(integer)는 better-auth 자체 필드, bigint 전환은 adapter 스키마 검사와 충돌 위험",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.412Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "adding-required-field excluded — rate_limits.id NOT NULL 추가(0002), 마이그레이션 시점에 테이블이 항상 비어 있어 실질 위험 없음",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.610Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "require-concurrent-index-creation excluded — drizzle migrate()의 단일 트랜잭션과 CONCURRENTLY가 근본적으로 양립 불가(현재 SQL엔 미사용, 예방적 배제)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.814Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
