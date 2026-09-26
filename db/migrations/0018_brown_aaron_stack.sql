CREATE TABLE "leave_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"bucket" text NOT NULL,
	"fiscal_year" integer,
	"amount_quarters" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_adjustments_bucket_check" CHECK ("leave_adjustments"."bucket" IN ('annual','monthly')),
	CONSTRAINT "leave_adjustments_amount_quarters_check" CHECK ("leave_adjustments"."amount_quarters" <> 0),
	CONSTRAINT "leave_adjustments_fiscal_year_check" CHECK (("leave_adjustments"."bucket" = 'annual') = ("leave_adjustments"."fiscal_year" IS NOT NULL))
);
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hire_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "resignation_date" date;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_adjustments_user_idx" ON "leave_adjustments" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_resignation_on_or_after_hire_check" CHECK ("users"."resignation_date" IS NULL OR "users"."hire_date" IS NULL OR "users"."resignation_date" >= "users"."hire_date") NOT VALID;