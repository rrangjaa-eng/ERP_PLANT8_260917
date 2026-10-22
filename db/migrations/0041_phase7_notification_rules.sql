-- 07-07(07 S2) — 알림 규칙 덮어쓰기 표 notification_rules(NOTI-03 · D-717 — 조건 종류마다 관리자가 바꾼 칸만, NULL = 종류 기본값,
-- enabled_at = 끔 → 켬 마지막 시각 · D-748 받는 계급 = 회사 전체라 범위 칸 없음) · 이메일 끔 상태 값 notification_log.email_status
-- 'skipped_rule_off'(P7). 새 표는 비어 있어 잠금 부담 없음 — FK는 users에 순간 SHARE ROW EXCLUSIVE만 잡는다. 시드 행을 넣지 않는다(기본값은
-- domain/notify 조건 종류 코드). email_status CHECK는 DROP 뒤 NOT VALID로 다시 — 검증은 *_phase7_notification_rules_validate.sql(0033 · 0035 ·
-- 0039 선례 — squawk constraint-missing-not-valid). rollback-floor 없음: 더하기만, 앞 이미지가 새 값을 쓰지 않음.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"kind" text PRIMARY KEY NOT NULL,
	"enabled" boolean,
	"days" integer,
	"extra_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"email_enabled" boolean,
	"enabled_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_rules_days_check" CHECK ("notification_rules"."days" IS NULL OR "notification_rules"."days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notification_log" DROP CONSTRAINT "notification_log_email_status_check";--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_email_status_check" CHECK ("notification_log"."email_status" in ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped_no_smtp', 'skipped_rule_off')) NOT VALID;