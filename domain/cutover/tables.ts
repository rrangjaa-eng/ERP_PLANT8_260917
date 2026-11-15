// 08-02(D8-05 · 오케스트레이터 C1): 전환 apply가 비울 표는 `source` 칸이 아니라 이 이름 분류로 정한다.
// domain은 db를 import하지 못하므로(eslint 경계) PgTable이 아니라 표 이름이다 — 모든 표가 정확히 한 분류에 드는지는
// test/integration/cutover-tables.test.ts가 information_schema · pg_constraint로 지킨다.

// 삭제 — 자식이 부모보다 앞(FK 순서). 표 하나를 DELETE 한 문장으로 비운다.
export const DELETE_ORDER = [
  "quote_lines",
  "quote_revisions",
  "project_members",
  "project_documents",
  "project_budget_entries",
  "projects",
] as const;

export const RESET_TABLES = ["document_counters"] as const;

// 불변 — 0046 트리거가 행 삭제를 막는다. apply는 1줄(cutover_apply)을 더할 뿐이다.
export const IMMUTABLE_TABLES = ["action_log"] as const;

// `source` 칸이 있지만 demo 표시가 아닌 표.
export const SOURCE_NOT_DEMO = ["restore_rehearsals", "vendor_account_changes"] as const;

// 사용자 카드 2026-11-04 13:38 KST — 번호 초기화 범위는 cert 제외 전부.
export const KEEP_COUNTER_KEYS = ["cert"] as const;

export const DEMO_SOURCE = "demo";
export const LIVE_SOURCE = "live";
