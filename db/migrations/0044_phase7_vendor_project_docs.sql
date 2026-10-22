-- 07-11(07 S3) — 거래처 묶음 표 셋 vendor_contacts(V7 담당자) · vendor_documents(V8 사업자등록증 · 통장 사본) · vendor_account_changes(P9 · V4
-- 계좌 변경 기록 — 원값 없음 · 뒤 4자리만, action_log 파생 아님) · 프로젝트 묶음 표 둘 project_documents(W3 발주서 · 기타) ·
-- project_budget_entries(W4 예산 이력 — D-729 직접 수정 manual + 메모 필수 · D-730 자동 줄 양수만) · 칸 vendors.confirmed_at/by(V9) ·
-- projects.po_number(W2 · D-737 유일 제약 없음) · quote_revisions.customer_approval_basis/memo(W6) · files.owner_kind 값 셋(V8 · W3 · W7).
-- 새 표는 비어 있어 잠금 부담 없음(새 표의 CHECK는 NOT VALID 불필요) — FK는 vendors · projects · users에 순간 SHARE ROW EXCLUSIVE만 잡는다.
-- 기존 표 칸은 NULL 허용(기본값 없음)이라 표를 다시 쓰지 않는다. 기존 표에 거는 CHECK 둘 · FK 하나는 검증을 미뤄 걸고 검증은
-- *_phase7_vendor_project_docs_validate.sql(0033 · 0035 · 0039 선례 — squawk constraint-missing-not-valid). files_owner_kind_check는 DROP 뒤
-- 값 셋을 더해 다시 건다(기존 네 값 그대로 품음). 백필: 기존 거래처는 모두 확인됨 — confirmed_at = created_at(운영 전환 전이라 06.1 자동 등록분도
-- 확인됨, 이후 자동 · 일하는 자리 등록만 확인 전 — 07-23). 대상은 스테이징 시험 데이터뿐(운영 거래처 0 · Phase 8 이관)이라 행 잠금(ROW EXCLUSIVE)
-- UPDATE가 statement_timeout = 5s 안에 끝난다 · 이미 채워진 행은 건드리지 않는다(멱등). rollback-floor 없음: 더하기만, 옛 리비전은 새 칸을
-- 읽지 않고 넣기는 NULL을 받는다(새 거래처가 「확인 전」으로 남는 것은 07-23 화면 전까지 보이지 않음).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "vendor_account_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"before_last4" text,
	"after_last4" text,
	"changed_by" text NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "vendor_account_changes_before_last4_check" CHECK ("vendor_account_changes"."before_last4" IS NULL OR "vendor_account_changes"."before_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "vendor_account_changes_after_last4_check" CHECK ("vendor_account_changes"."after_last4" IS NULL OR "vendor_account_changes"."after_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "vendor_account_changes_source_check" CHECK ("vendor_account_changes"."source" IN ('admin','workplace','evidence'))
);
--> statement-breakpoint
CREATE TABLE "vendor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"removed_by" text,
	CONSTRAINT "vendor_documents_kind_check" CHECK ("vendor_documents"."kind" IN ('registration','bankbook'))
);
--> statement-breakpoint
CREATE TABLE "project_budget_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"base_amount_krw" bigint,
	"cost_rate_pct" numeric(4, 1),
	"delta_krw" bigint NOT NULL,
	"memo" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_budget_entries_reason_check" CHECK ("project_budget_entries"."reason" IN ('initial','po_amount_change','new_approved_revision','manual')),
	CONSTRAINT "project_budget_entries_cost_rate_pct_check" CHECK ("project_budget_entries"."cost_rate_pct" IS NULL OR "project_budget_entries"."cost_rate_pct" BETWEEN 0 AND 100),
	CONSTRAINT "project_budget_entries_manual_memo_check" CHECK ("project_budget_entries"."reason" <> 'manual' OR ("project_budget_entries"."memo" IS NOT NULL AND btrim("project_budget_entries"."memo") <> '')),
	CONSTRAINT "project_budget_entries_auto_base_check" CHECK ("project_budget_entries"."reason" = 'manual' OR ("project_budget_entries"."base_amount_krw" IS NOT NULL AND "project_budget_entries"."cost_rate_pct" IS NOT NULL)),
	CONSTRAINT "project_budget_entries_delta_check" CHECK ("project_budget_entries"."delta_krw" > 0 OR ("project_budget_entries"."reason" = 'manual' AND "project_budget_entries"."delta_krw" <> 0))
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"removed_by" text,
	CONSTRAINT "project_documents_kind_check" CHECK ("project_documents"."kind" IN ('purchase_order','other'))
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_owner_kind_check";--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
UPDATE vendors SET confirmed_at = created_at WHERE confirmed_at IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD COLUMN "customer_approval_basis" text;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD COLUMN "customer_approval_memo" text;--> statement-breakpoint
ALTER TABLE "vendor_account_changes" ADD CONSTRAINT "vendor_account_changes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_account_changes" ADD CONSTRAINT "vendor_account_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_entries" ADD CONSTRAINT "project_budget_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_entries" ADD CONSTRAINT "project_budget_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_account_changes_vendor_changed_idx" ON "vendor_account_changes" USING btree ("vendor_id","changed_at");--> statement-breakpoint
CREATE INDEX "vendor_contacts_vendor_id_idx" ON "vendor_contacts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_vendor_id_idx" ON "vendor_documents" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "project_budget_entries_project_id_idx" ON "project_budget_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_id_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_kind_check" CHECK ("files"."owner_kind" IN ('expense','quote_revision','reserve_entry','corp_card_usage','vendor_document','project_document','revenue_entry')) NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_customer_approval_basis_check" CHECK ("quote_revisions"."customer_approval_basis" IS NULL OR "quote_revisions"."customer_approval_basis" IN ('purchase_order','email','verbal')) NOT VALID;