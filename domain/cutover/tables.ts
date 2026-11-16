// 08-02(D8-05 · 오케스트레이터 C1): 전환 apply가 비울 표는 `source` 칸이 아니라 이 이름 분류로 정한다.
// domain은 db를 import하지 못하므로(eslint 경계) PgTable이 아니라 표 이름이다 — 모든 표가 정확히 한 분류에 드는지는
// test/integration/cutover-tables.test.ts가 information_schema · pg_constraint로 지킨다. 새 표를 더하면 여기 한 분류에 넣는다.

// 삭제 — 자식이 부모보다 앞(FK 순서). 표 하나를 DELETE 한 문장으로 비운다(자기 참조 FK는 문장 끝 검사라 미리 끊지 않는다).
export const DELETE_ORDER = [
  "approval_steps",
  "approval_routes",
  "approval_instances",
  "evidence_record_links",
  "expense_date_change_requests",
  "expense_payments",
  "expense_evidence_reviews",
  "expenses",
  "corp_card_usages",
  "purchase_requests",
  "revenue_issue_requests",
  "revenue_entries",
  "reserve_entries",
  "settlement_approvals",
  "quote_lines",
  "quote_revisions",
  "project_members",
  "project_documents",
  "project_budget_entries",
  "projects",
  "leave_requests",
  "notification_log",
] as const;

// 소유 종류별 삭제 — FK가 없어 DELETE_ORDER보다 먼저, 아래 지울 종류의 행만 비운다.
export const FILE_TABLES = ["files", "upload_intents"] as const;
export const DELETE_FILE_OWNER_KINDS = ["expense", "quote_revision", "reserve_entry", "corp_card_usage", "project_document", "revenue_entry"] as const;
// C2: 거래처 서류 · 견적서 회사 로고는 업무 기록이 아니다.
export const KEEP_FILE_OWNER_KINDS = ["vendor_document", "company_logo"] as const;

export const KEEP_TABLES = [
  // 계정
  "users",
  "accounts",
  "sessions",
  "verifications",
  "rate_limits",
  "login_attempts",
  "privacy_session_activity",
  // 권한
  "roles",
  "permission_matrix",
  "visibility_matrix",
  // 조직
  "org_units",
  "teams",
  "team_memberships",
  // 마스터
  "vendors",
  "vendor_contacts",
  "vendor_documents",
  "vendor_account_changes",
  "corp_cards",
  "code_items",
  "field_definitions",
  // 규칙 · 설정
  "holidays",
  "holiday_year_confirmations",
  "holiday_year_generations",
  "notification_rules",
  "settings_simple",
  "settings_historized",
  // 실데이터(C2)
  "leave_adjustments",
  "evidence_import_batches",
  "evidence_records",
  // 확인증
  "cert_events",
  "cert_prizes",
  "cert_submissions",
  "cert_signature_uploads",
  // 기록
  "restore_rehearsals",
  "notify_tick_runs",
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
