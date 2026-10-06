-- Phase 5(05-01 · 05-03 · 05-04 · 05-11 — 05-13 병합 직전 재생성) — 지출결의 · 증빙 파일 · 업로드 의도 · 정산 결재 문서의 새 빈 표와
-- approval_instances.version_reason null 허용 컬럼. 재작성 · 백필이 없다. 기존 표(users · projects · quote_lines · teams · vendors)를
-- 참조하는 FK ALTER가 그 표들에 잠금을 잡으므로 잠금 · 문장 시간 상한을 둔다(0022 선례). 한 값 CHECK는 컬럼 정의 안에 인라인으로
-- 둔다 — 따로 내는 ADD CONSTRAINT … CHECK와 NOT VALID + VALIDATE 쌍은 squawk가 거부한다(B-22, 0013 · 0014 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drafter_id" text NOT NULL,
	"number" text,
	"project_id" uuid,
	"quote_line_id" uuid,
	"team_expense_kind" text,
	"usage_date" date,
	"content" text,
	"attributed_team_id" uuid,
	"vendor_id" uuid,
	"evidence_type" text,
	"payment_method" text,
	"supply_currency" text DEFAULT 'KRW' NOT NULL,
	"supply_foreign_amount" numeric(14, 2),
	"supply_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"supply_amount_krw" bigint,
	"installment" boolean DEFAULT false NOT NULL,
	"installment_seq" integer,
	"scheduled_payment_date" date,
	"note" text,
	"tax_rule_kind" text,
	"tax_rate" numeric(7, 6),
	"tax_rate_setting_id" uuid,
	"tax_rate_effective_from" date,
	"tax_company_borne_method" text,
	"tax_basis_date" date,
	"vat_krw" bigint,
	"withholding_krw" bigint,
	"company_borne_krw" bigint,
	"payable_krw" bigint,
	"idempotency_key" text,
	"submitted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_number_unique" UNIQUE("number"),
	CONSTRAINT "expenses_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "expenses_team_expense_kind_check" CHECK ("expenses"."team_expense_kind" IS NULL OR "expenses"."team_expense_kind" IN ('lost_bid','team_overhead')),
	CONSTRAINT "expenses_supply_amount_krw_check" CHECK ("expenses"."supply_amount_krw" IS NULL OR "expenses"."supply_amount_krw" >= 0),
	CONSTRAINT "expenses_supply_foreign_amount_check" CHECK ("expenses"."supply_foreign_amount" IS NULL OR "expenses"."supply_foreign_amount" >= 0),
	CONSTRAINT "expenses_submitted_amount_check" CHECK ("expenses"."number" IS NULL OR ("expenses"."supply_amount_krw" IS NOT NULL AND "expenses"."supply_amount_krw" > 0)),
	CONSTRAINT "expenses_line_or_team_check" CHECK (NOT ("expenses"."quote_line_id" IS NOT NULL AND "expenses"."team_expense_kind" IS NOT NULL)),
	CONSTRAINT "expenses_installment_seq_check" CHECK ("expenses"."installment_seq" IS NULL OR "expenses"."installment_seq" >= 1),
	CONSTRAINT "expenses_tax_rule_kind_check" CHECK ("expenses"."tax_rule_kind" IS NULL OR "expenses"."tax_rule_kind" IN ('none','vat_surcharge','withholding','company_borne'))
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"original_name" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"removed_by" text,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_owner_kind_check" CHECK ("files"."owner_kind" IN ('expense')),
	CONSTRAINT "files_sha256_check" CHECK ("files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_size_bytes_check" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_void_check" CHECK (("files"."voided_at" IS NULL AND "files"."voided_by" IS NULL AND "files"."void_reason" IS NULL) OR ("files"."voided_at" IS NOT NULL AND "files"."voided_by" IS NOT NULL AND "files"."void_reason" IS NOT NULL)),
	CONSTRAINT "files_void_reason_length_check" CHECK ("files"."void_reason" IS NULL OR char_length("files"."void_reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"declared_size" integer NOT NULL,
	"declared_content_type" text NOT NULL,
	"declared_sha256" text NOT NULL,
	"original_name" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upload_intents_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "settlement_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"drafter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_approvals_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "approval_instances" ADD COLUMN "version_reason" text CONSTRAINT "approval_instances_version_reason_check" CHECK ("version_reason" IS NULL OR "version_reason" IN ('evidence'));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_quote_line_id_quote_lines_id_fk" FOREIGN KEY ("quote_line_id") REFERENCES "public"."quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_attributed_team_id_teams_id_fk" FOREIGN KEY ("attributed_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_approvals" ADD CONSTRAINT "settlement_approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_approvals" ADD CONSTRAINT "settlement_approvals_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_line_drafter_draft_uniq" ON "expenses" USING btree ("quote_line_id","drafter_id") WHERE "expenses"."number" is null and "expenses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_quote_line_idx" ON "expenses" USING btree ("quote_line_id");--> statement-breakpoint
CREATE INDEX "expenses_drafter_idx" ON "expenses" USING btree ("drafter_id");--> statement-breakpoint
CREATE INDEX "expenses_attributed_team_idx" ON "expenses" USING btree ("attributed_team_id");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "upload_intents_created_by_idx" ON "upload_intents" USING btree ("created_by");