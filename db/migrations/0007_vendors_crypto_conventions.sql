CREATE TABLE "document_counters" (
	"counter_key" text NOT NULL,
	"period" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_counter_key_period_pk" PRIMARY KEY("counter_key","period")
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_definitions_entity_key_key" UNIQUE("entity","key")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"business_no" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"default_evidence_type" text,
	"account_bank" text,
	"account_holder" text,
	"account_number_encrypted" text,
	"account_number_last4" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "code_items" ADD COLUMN "tax_rule" jsonb;--> statement-breakpoint
CREATE INDEX "vendors_normalized_name_idx" ON "vendors" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "vendors_custom_fields_idx" ON "vendors" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "code_items_custom_fields_idx" ON "code_items" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "corp_cards_custom_fields_idx" ON "corp_cards" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "roles_custom_fields_idx" ON "roles" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "org_units_custom_fields_idx" ON "org_units" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "teams_custom_fields_idx" ON "teams" USING gin ("custom_fields");