-- 04-07 — reserve_entries 신규 생성(리저브 대장 · RSV-01). 신규 표라 락 경합이 낮지만 0010 선례와 같은
-- 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다. 번호는 생성기 출력 그대로(0016 bigint · 0017 04.2 뒤).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "reserve_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"direction" text NOT NULL,
	"amount_currency" text DEFAULT 'KRW' NOT NULL,
	"amount_foreign_amount" numeric(14, 2),
	"amount_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"amount_amount_krw" bigint NOT NULL,
	"project_id" uuid,
	"evidence_type" text,
	"tax_invoice_number" text,
	"note" text,
	"source" text DEFAULT 'demo' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reserve_entries_direction_check" CHECK ("reserve_entries"."direction" in ('deposit', 'withdrawal'))
);
--> statement-breakpoint
ALTER TABLE "reserve_entries" ADD CONSTRAINT "reserve_entries_client_id_vendors_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_entries" ADD CONSTRAINT "reserve_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserve_entries_client_date_idx" ON "reserve_entries" USING btree ("client_id","entry_date");--> statement-breakpoint
CREATE INDEX "reserve_entries_custom_fields_idx" ON "reserve_entries" USING gin ("custom_fields");