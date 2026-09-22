-- Phase 4(04-02) — revenue_entries 신규 생성 + projects.contract_* 4컬럼
-- 추가. 신규 표·신규 컬럼(NOT NULL 기본값 있음)이라 락 경합이 낮지만
-- 0003·0004·0009 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "revenue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entry_date" date NOT NULL,
	"amount_currency" text DEFAULT 'KRW' NOT NULL,
	"amount_foreign_amount" numeric(14, 2),
	"amount_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"amount_amount_krw" integer NOT NULL,
	"note" text,
	"source" text DEFAULT 'demo' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_foreign_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_amount_krw" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revenue_entries_project_kind_date_idx" ON "revenue_entries" USING btree ("project_id","kind","entry_date");--> statement-breakpoint
CREATE INDEX "revenue_entries_custom_fields_idx" ON "revenue_entries" USING gin ("custom_fields");