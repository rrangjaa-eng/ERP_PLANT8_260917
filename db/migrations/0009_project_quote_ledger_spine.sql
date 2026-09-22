-- Phase 4(04-01) 트레이서 — projects·quote_revisions·quote_lines 신규 생성 +
-- project_status 코드표를 D-41 네 값으로 교체. 신규 표라 락 경합이 없지만
-- 기존 표(code_items)를 건드리는 DELETE/INSERT가 뒤에 있어 0003·0004 선례와
-- 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"pm_user_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'bidding' NOT NULL,
	"start_date" date,
	"end_date" date,
	"pre_estimate_currency" text DEFAULT 'KRW' NOT NULL,
	"pre_estimate_foreign_amount" numeric(14, 2),
	"pre_estimate_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"pre_estimate_amount_krw" integer NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_number_key" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "quote_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"customer_approved_at" timestamp,
	"customer_approved_by" text,
	"source" text DEFAULT 'demo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quote_revisions_project_seq_key" UNIQUE("project_id","seq")
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"subcategory" text NOT NULL,
	"item_name" text NOT NULL,
	"vendor_id" uuid,
	"quantity" numeric(12, 2) DEFAULT '1.00' NOT NULL,
	"unit_price_currency" text DEFAULT 'KRW' NOT NULL,
	"unit_price_foreign_amount" numeric(14, 2),
	"unit_price_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"unit_price_amount_krw" integer NOT NULL,
	"execution_currency" text DEFAULT 'KRW' NOT NULL,
	"execution_foreign_amount" numeric(14, 2),
	"execution_fx_rate" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"execution_amount_krw" integer NOT NULL,
	"quote_amount_krw" integer NOT NULL,
	"profit_krw" integer NOT NULL,
	"line_status" text DEFAULT 'not_started' NOT NULL,
	"note" text,
	"copied_from_line_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_vendors_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_user_id_users_id_fk" FOREIGN KEY ("pm_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_customer_approved_by_users_id_fk" FOREIGN KEY ("customer_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_revision_id_quote_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."quote_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_copied_from_line_id_quote_lines_id_fk" FOREIGN KEY ("copied_from_line_id") REFERENCES "public"."quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_end_date_idx" ON "projects" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "projects_client_id_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_team_id_idx" ON "projects" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "projects_custom_fields_idx" ON "projects" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "quote_revisions_project_id_idx" ON "quote_revisions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quote_lines_revision_sort_idx" ON "quote_lines" USING btree ("revision_id","sort_order");--> statement-breakpoint
CREATE INDEX "quote_lines_custom_fields_idx" ON "quote_lines" USING gin ("custom_fields");
--> statement-breakpoint
-- Task 1 ④ · Task 2 ⑬ — project_status 코드표를 D-41 네 값으로 교체한다.
-- 전제("projects 표가 비어 있다" · "code_items의 project_status는 Phase 3
-- 시드 다섯 값 그대로다")를 적용 시점에 대상 DB에서 직접 측정한다. 전제가
-- 깨지면 지우는 대신 RAISE EXCEPTION으로 마이그레이션 전체를 되돌린다 —
-- NOT EXISTS로 조용히 건너뛰는 형태는 쓰지 않는다.
DO $$
DECLARE
  stray_count integer;
  project_count integer;
BEGIN
  SELECT count(*) INTO stray_count
    FROM "code_items"
    WHERE "table_key" = 'project_status'
      AND "value" NOT IN ('planning', 'in_progress', 'on_hold', 'done', 'cancelled');
  IF stray_count > 0 THEN
    RAISE EXCEPTION 'project_status 코드표에 Phase 3 시드 다섯 값 밖의 항목이 %건 있습니다 — 사람이 손으로 더한 값일 수 있어 지우지 않고 마이그레이션을 중단합니다. Task 1 ④ 대안 B(옛 값을 비활성으로 내리기)를 적용하세요.', stray_count;
  END IF;

  SELECT count(*) INTO project_count FROM "projects";
  IF project_count > 0 THEN
    RAISE EXCEPTION 'projects 표에 이미 %건의 행이 있습니다 — "프로젝트 행이 아직 0건" 전제가 깨져 project_status 코드표를 지우지 않고 마이그레이션을 중단합니다. Task 1 ④ 대안 B를 적용하세요.', project_count;
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM "code_items"
  WHERE "table_key" = 'project_status'
    AND "value" IN ('planning', 'on_hold', 'done', 'cancelled');
--> statement-breakpoint
INSERT INTO "code_items" ("table_key", "value", "label", "sort_order") VALUES
  ('project_status', 'bidding', '수주중', 0),
  ('project_status', 'in_progress', '진행', 1),
  ('project_status', 'settled', '완료(정산)', 2),
  ('project_status', 'lost', '미수주', 3)
ON CONFLICT ("table_key", "value") DO NOTHING;