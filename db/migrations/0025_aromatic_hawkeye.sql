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
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_quote_line_id_quote_lines_id_fk" FOREIGN KEY ("quote_line_id") REFERENCES "public"."quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_attributed_team_id_teams_id_fk" FOREIGN KEY ("attributed_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_line_drafter_draft_uniq" ON "expenses" USING btree ("quote_line_id","drafter_id") WHERE "expenses"."number" is null and "expenses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_quote_line_idx" ON "expenses" USING btree ("quote_line_id");--> statement-breakpoint
CREATE INDEX "expenses_drafter_idx" ON "expenses" USING btree ("drafter_id");--> statement-breakpoint
CREATE INDEX "expenses_attributed_team_idx" ON "expenses" USING btree ("attributed_team_id");