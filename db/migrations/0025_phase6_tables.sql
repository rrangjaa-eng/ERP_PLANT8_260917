-- Phase 6(06-27 · 06-26 흡수) — 지급 · 증빙 확인 · 카드 사용 · 구매 요청 · 발행 요청 새 표와 expenses 칸 일곱, files · corp_cards 주인 CHECK 교체.
-- 재작성 · 백필이 없다(새 칸은 null · 상수 기본값). 기존 표(expenses · files · corp_cards · users · projects · quote_lines · teams · vendors ·
-- revenue_entries)에 거는 ALTER · FK가 그 표들에 잠금을 잡으므로 잠금 · 문장 시간 상한을 둔다(0024 선례). 기존 표 제약 여섯은
-- NOT VALID로 걸고 검증은 *_phase6_tables_validate.sql로 나눈다(0003 · 0004 선례 — squawk constraint-missing-not-valid).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "corp_card_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corp_card_id" uuid NOT NULL,
	"used_on" date NOT NULL,
	"merchant_vendor_id" uuid,
	"total_currency" text DEFAULT 'KRW' NOT NULL,
	"total_foreign_amount" numeric(14, 2),
	"total_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"total_amount_krw" bigint NOT NULL,
	"supply_krw" bigint NOT NULL,
	"vat_krw" bigint NOT NULL,
	"evidence_type_code" text NOT NULL,
	"link_kind" text NOT NULL,
	"quote_line_id" uuid,
	"team_id" uuid,
	"used_by_user_id" text NOT NULL,
	"registered_by" text NOT NULL,
	"registered_via" text NOT NULL,
	"purchase_request_id" uuid,
	"memo" text,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "corp_card_usages_amount_sum_check" CHECK ("corp_card_usages"."supply_krw" + "corp_card_usages"."vat_krw" = "corp_card_usages"."total_amount_krw"),
	CONSTRAINT "corp_card_usages_link_kind_check" CHECK ("corp_card_usages"."link_kind" IN ('quote_line','team_cost')),
	CONSTRAINT "corp_card_usages_link_check" CHECK (("corp_card_usages"."link_kind" = 'quote_line' AND "corp_card_usages"."quote_line_id" IS NOT NULL AND "corp_card_usages"."team_id" IS NULL) OR ("corp_card_usages"."link_kind" = 'team_cost' AND "corp_card_usages"."team_id" IS NOT NULL AND "corp_card_usages"."quote_line_id" IS NULL)),
	CONSTRAINT "corp_card_usages_registered_via_check" CHECK ("corp_card_usages"."registered_via" IN ('self','proxy','purchase')),
	CONSTRAINT "corp_card_usages_purchase_link_check" CHECK (("corp_card_usages"."registered_via" = 'purchase') = ("corp_card_usages"."purchase_request_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "expense_evidence_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"status" text NOT NULL,
	"amount_before_krw" bigint,
	"amount_after_krw" bigint,
	"waive_reason" text,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "expense_evidence_reviews_status_check" CHECK ("expense_evidence_reviews"."status" IN ('confirmed','waived')),
	CONSTRAINT "expense_evidence_reviews_waive_reason_check" CHECK ("expense_evidence_reviews"."status" <> 'waived' OR ("expense_evidence_reviews"."waive_reason" IS NOT NULL AND char_length(btrim("expense_evidence_reviews"."waive_reason")) > 0)),
	CONSTRAINT "expense_evidence_reviews_amount_pair_check" CHECK (("expense_evidence_reviews"."amount_before_krw" IS NULL) = ("expense_evidence_reviews"."amount_after_krw" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"pay_date" date NOT NULL,
	"transfer_krw" bigint NOT NULL,
	"payable_krw" bigint NOT NULL,
	"diff_krw" bigint NOT NULL,
	"diff_reason" text,
	"gross_supply_krw" bigint,
	"payment_method" text NOT NULL,
	"processed_by" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_by" text,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	CONSTRAINT "expense_payments_diff_reason_check" CHECK ("expense_payments"."diff_krw" = 0 OR ("expense_payments"."diff_reason" IS NOT NULL AND char_length(btrim("expense_payments"."diff_reason")) > 0)),
	CONSTRAINT "expense_payments_cancel_check" CHECK (("expense_payments"."cancelled_at" IS NULL AND "expense_payments"."cancelled_by" IS NULL AND "expense_payments"."cancel_reason" IS NULL) OR ("expense_payments"."cancelled_at" IS NOT NULL AND "expense_payments"."cancelled_by" IS NOT NULL AND "expense_payments"."cancel_reason" IS NOT NULL AND char_length(btrim("expense_payments"."cancel_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "revenue_issue_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"desired_issue_date" date NOT NULL,
	"amount_currency" text DEFAULT 'KRW' NOT NULL,
	"amount_foreign_amount" numeric(14, 2),
	"amount_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"amount_amount_krw" bigint NOT NULL,
	"memo" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"issued_entry_id" uuid,
	"requested_by" text NOT NULL,
	"cancelled_by" text,
	"cancelled_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_issue_requests_status_check" CHECK ("revenue_issue_requests"."status" IN ('requested','issued','cancelled')),
	CONSTRAINT "revenue_issue_requests_issued_check" CHECK ("revenue_issue_requests"."status" <> 'issued' OR "revenue_issue_requests"."issued_entry_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"link_kind" text NOT NULL,
	"project_id" uuid,
	"quote_line_id" uuid,
	"requested_by" text NOT NULL,
	"item_name" text NOT NULL,
	"link_url" text,
	"estimate_currency" text DEFAULT 'KRW' NOT NULL,
	"estimate_foreign_amount" numeric(14, 2),
	"estimate_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"estimate_amount_krw" bigint NOT NULL,
	"memo" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"completed_by" text,
	"completed_at" timestamp,
	"cancelled_by" text,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requests_link_kind_check" CHECK ("purchase_requests"."link_kind" IN ('quote_line','team_cost')),
	CONSTRAINT "purchase_requests_link_check" CHECK (("purchase_requests"."link_kind" = 'quote_line' AND "purchase_requests"."project_id" IS NOT NULL AND "purchase_requests"."quote_line_id" IS NOT NULL) OR ("purchase_requests"."link_kind" = 'team_cost' AND "purchase_requests"."project_id" IS NULL AND "purchase_requests"."quote_line_id" IS NULL)),
	CONSTRAINT "purchase_requests_link_url_check" CHECK ("purchase_requests"."link_url" IS NULL OR "purchase_requests"."link_url" ~* '^https?://'),
	CONSTRAINT "purchase_requests_status_check" CHECK ("purchase_requests"."status" IN ('requested','purchased','cancelled')),
	CONSTRAINT "purchase_requests_completed_check" CHECK (("purchase_requests"."status" = 'purchased') = ("purchase_requests"."completed_at" IS NOT NULL AND "purchase_requests"."completed_by" IS NOT NULL)),
	CONSTRAINT "purchase_requests_cancelled_check" CHECK (("purchase_requests"."status" = 'cancelled') = ("purchase_requests"."cancelled_at" IS NOT NULL AND "purchase_requests"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "corp_cards" DROP CONSTRAINT "corp_cards_owner_xor_check";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_owner_kind_check";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "prepaid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "prepaid_reason" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "evidence_amount" bigint;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "evidence_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_corp_card_id_corp_cards_id_fk" FOREIGN KEY ("corp_card_id") REFERENCES "public"."corp_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_merchant_vendor_id_vendors_id_fk" FOREIGN KEY ("merchant_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_quote_line_id_quote_lines_id_fk" FOREIGN KEY ("quote_line_id") REFERENCES "public"."quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD CONSTRAINT "corp_card_usages_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_evidence_reviews" ADD CONSTRAINT "expense_evidence_reviews_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_evidence_reviews" ADD CONSTRAINT "expense_evidence_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_issue_requests" ADD CONSTRAINT "revenue_issue_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_issue_requests" ADD CONSTRAINT "revenue_issue_requests_issued_entry_id_revenue_entries_id_fk" FOREIGN KEY ("issued_entry_id") REFERENCES "public"."revenue_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_issue_requests" ADD CONSTRAINT "revenue_issue_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_issue_requests" ADD CONSTRAINT "revenue_issue_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_quote_line_id_quote_lines_id_fk" FOREIGN KEY ("quote_line_id") REFERENCES "public"."quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corp_card_usages_purchase_request_uniq" ON "corp_card_usages" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE INDEX "corp_card_usages_card_used_on_idx" ON "corp_card_usages" USING btree ("corp_card_id","used_on");--> statement-breakpoint
CREATE INDEX "corp_card_usages_quote_line_idx" ON "corp_card_usages" USING btree ("quote_line_id");--> statement-breakpoint
CREATE INDEX "corp_card_usages_registered_by_created_idx" ON "corp_card_usages" USING btree ("registered_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_evidence_reviews_expense_uniq" ON "expense_evidence_reviews" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_payments_live_uniq" ON "expense_payments" USING btree ("expense_id") WHERE "expense_payments"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expense_payments_expense_idx" ON "expense_payments" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_issue_requests_issued_entry_uniq" ON "revenue_issue_requests" USING btree ("issued_entry_id");--> statement-breakpoint
CREATE INDEX "revenue_issue_requests_project_status_idx" ON "revenue_issue_requests" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_number_uniq" ON "purchase_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "purchase_requests_status_created_idx" ON "purchase_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "purchase_requests_quote_line_idx" ON "purchase_requests" USING btree ("quote_line_id");--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "corp_cards" ADD CONSTRAINT "corp_cards_owner_kind_check" CHECK (("corp_cards"."kind" = 'personal' AND "corp_cards"."holder_user_id" IS NOT NULL AND "corp_cards"."team_id" IS NULL) OR ("corp_cards"."kind" = 'team' AND "corp_cards"."team_id" IS NOT NULL AND "corp_cards"."holder_user_id" IS NULL) OR ("corp_cards"."kind" = 'shared' AND "corp_cards"."holder_user_id" IS NULL AND "corp_cards"."team_id" IS NULL)) NOT VALID;--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_prepaid_reason_check" CHECK ("expenses"."prepaid" = false OR ("expenses"."prepaid_reason" IS NOT NULL AND char_length(btrim("expenses"."prepaid_reason")) > 0)) NOT VALID;--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_evidence_amount_check" CHECK ("expenses"."evidence_amount" IS NULL OR "expenses"."evidence_amount" >= 0) NOT VALID;--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_closed_check" CHECK (("expenses"."closed_at" IS NULL AND "expenses"."closed_by" IS NULL AND "expenses"."closed_reason" IS NULL) OR ("expenses"."closed_at" IS NOT NULL AND "expenses"."closed_by" IS NOT NULL AND "expenses"."closed_reason" IS NOT NULL AND char_length(btrim("expenses"."closed_reason")) > 0 AND "expenses"."number" IS NOT NULL)) NOT VALID;--> statement-breakpoint
-- 기존 표 제약 — 기존 행 스캔 없이 새 · 바뀐 행부터 강제하고(NOT VALID), 검증은 *_phase6_tables_validate.sql(별도 트랜잭션).
ALTER TABLE "files" ADD CONSTRAINT "files_owner_kind_check" CHECK ("files"."owner_kind" IN ('expense','quote_revision','reserve_entry','corp_card_usage')) NOT VALID;