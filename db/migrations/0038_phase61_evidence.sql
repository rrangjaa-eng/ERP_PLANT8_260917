-- 06.1-01(D-6107 · D-6112 · RP-15) — 증빙 기록 표 셋 + corp_card_usages.approval_no(EVID-10) + code_items.private_to_owner(G15).
-- 기존 표 corp_card_usages · code_items에 칸 · 색인을 더하므로 0010 · 0030 선례와 같은 잠금 시간 한 쌍을 첫 락 요구 문장 앞에 둔다.
-- approval_no는 null 허용 · 기본값 없음, private_to_owner는 상수 기본값 false라 기존 행을 다시 쓰지 않는다(PostgreSQL 11+).
-- rollback-floor를 두지 않는다 — 표 · 칸 · 색인을 더하기만 해서 옛 리비전도 이 스키마 위에서 돈다. 옛 리비전으로 되돌려도 personal_card_receipt는 꺼진 종류라 노출되지 않는다(R6).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "evidence_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" text NOT NULL,
	"original_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"registered_count" integer NOT NULL,
	"skipped_duplicate_count" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_import_batches_file_sha256_check" CHECK ("evidence_import_batches"."file_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "evidence_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_record_id" uuid NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"attach_mode" text NOT NULL,
	"attached_by" text NOT NULL,
	"attached_at" timestamp DEFAULT now() NOT NULL,
	"detached_at" timestamp,
	"detached_by" text,
	"detach_reason" text,
	CONSTRAINT "evidence_record_links_owner_kind_check" CHECK ("evidence_record_links"."owner_kind" IN ('expense','purchase_request','corp_card_usage')),
	CONSTRAINT "evidence_record_links_attach_mode_check" CHECK ("evidence_record_links"."attach_mode" IN ('registrar','author','reconcile')),
	CONSTRAINT "evidence_record_links_detached_check" CHECK (("evidence_record_links"."detached_at" IS NULL AND "evidence_record_links"."detached_by" IS NULL AND "evidence_record_links"."detach_reason" IS NULL) OR ("evidence_record_links"."detached_at" IS NOT NULL AND "evidence_record_links"."detached_by" IS NOT NULL AND "evidence_record_links"."detach_reason" IS NOT NULL AND char_length("evidence_record_links"."detach_reason") > 0))
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"format" text NOT NULL,
	"evidence_type" text NOT NULL,
	"approval_no" text,
	"dedupe_key" text NOT NULL,
	"issued_on" date NOT NULL,
	"supply_krw" bigint NOT NULL,
	"vat_krw" bigint NOT NULL,
	"total_krw" bigint NOT NULL,
	"vendor_id" uuid,
	"business_no_digits" text,
	"name_on_document" text,
	"merchant" text,
	"corp_card_id" uuid,
	"card_last4" text,
	"needs_check" text,
	"original_approval_no" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"visible_team_id" uuid,
	"visible_org_unit_id" uuid,
	"visibility_saved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_records_amount_sum_check" CHECK ("evidence_records"."total_krw" = "evidence_records"."supply_krw" + "evidence_records"."vat_krw"),
	CONSTRAINT "evidence_records_business_no_digits_check" CHECK ("evidence_records"."business_no_digits" IS NULL OR "evidence_records"."business_no_digits" ~ '^[0-9]{10}$'),
	CONSTRAINT "evidence_records_card_last4_check" CHECK ("evidence_records"."card_last4" IS NULL OR "evidence_records"."card_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "evidence_records_visibility_check" CHECK ("evidence_records"."visibility" IN ('private','team','division')),
	CONSTRAINT "evidence_records_visibility_target_check" CHECK (("evidence_records"."visibility" = 'private' AND "evidence_records"."visible_team_id" IS NULL AND "evidence_records"."visible_org_unit_id" IS NULL) OR ("evidence_records"."visibility" = 'team' AND "evidence_records"."visible_team_id" IS NOT NULL AND "evidence_records"."visible_org_unit_id" IS NULL) OR ("evidence_records"."visibility" = 'division' AND "evidence_records"."visible_org_unit_id" IS NOT NULL AND "evidence_records"."visible_team_id" IS NULL)),
	CONSTRAINT "evidence_records_archived_pair_check" CHECK (("evidence_records"."archived_at" IS NULL AND "evidence_records"."archived_by" IS NULL) OR ("evidence_records"."archived_at" IS NOT NULL AND "evidence_records"."archived_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "code_items" ADD COLUMN "private_to_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD COLUMN "approval_no" text;--> statement-breakpoint
ALTER TABLE "evidence_import_batches" ADD CONSTRAINT "evidence_import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record_links" ADD CONSTRAINT "evidence_record_links_evidence_record_id_evidence_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."evidence_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record_links" ADD CONSTRAINT "evidence_record_links_attached_by_users_id_fk" FOREIGN KEY ("attached_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record_links" ADD CONSTRAINT "evidence_record_links_detached_by_users_id_fk" FOREIGN KEY ("detached_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_batch_id_evidence_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."evidence_import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_corp_card_id_corp_cards_id_fk" FOREIGN KEY ("corp_card_id") REFERENCES "public"."corp_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_visible_team_id_teams_id_fk" FOREIGN KEY ("visible_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_visible_org_unit_id_org_units_id_fk" FOREIGN KEY ("visible_org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_import_batches_file_sha256_idx" ON "evidence_import_batches" USING btree ("file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_record_links_live_uniq" ON "evidence_record_links" USING btree ("evidence_record_id") WHERE "evidence_record_links"."detached_at" IS NULL;--> statement-breakpoint
CREATE INDEX "evidence_record_links_owner_live_idx" ON "evidence_record_links" USING btree ("owner_kind","owner_id") WHERE "evidence_record_links"."detached_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_records_dedupe_key_uniq" ON "evidence_records" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "evidence_records_visibility_idx" ON "evidence_records" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "evidence_records_batch_idx" ON "evidence_records" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "evidence_records_card_issued_idx" ON "evidence_records" USING btree ("corp_card_id","issued_on");--> statement-breakpoint
CREATE INDEX "evidence_records_format_issued_idx" ON "evidence_records" USING btree ("format","issued_on");--> statement-breakpoint
CREATE INDEX "evidence_records_visible_team_idx" ON "evidence_records" USING btree ("visible_team_id") WHERE "evidence_records"."visibility" = 'team';--> statement-breakpoint
CREATE INDEX "evidence_records_visible_org_unit_idx" ON "evidence_records" USING btree ("visible_org_unit_id") WHERE "evidence_records"."visibility" = 'division';--> statement-breakpoint
CREATE INDEX "corp_card_usages_card_approval_idx" ON "corp_card_usages" USING btree ("corp_card_id","approval_no");