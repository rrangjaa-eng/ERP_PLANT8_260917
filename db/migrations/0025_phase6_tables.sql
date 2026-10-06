-- Phase 6(06-27) — 지급 기록 표 expense_payments를 새로 만든다. 재작성 · 백필이 없다. 기존 표(expenses · users)를 참조하는 FK ALTER가
-- 그 표들에 잠금을 잡으므로 잠금 · 문장 시간 상한을 둔다(0024 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
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
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_payments_live_uniq" ON "expense_payments" USING btree ("expense_id") WHERE "expense_payments"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expense_payments_expense_idx" ON "expense_payments" USING btree ("expense_id");