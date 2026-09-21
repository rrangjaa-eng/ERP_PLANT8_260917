SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "action_log" ADD COLUMN "pruned_at" timestamp;--> statement-breakpoint
ALTER TABLE "action_log" ADD COLUMN "pruned_by" text;--> statement-breakpoint
CREATE INDEX "action_log_pruned_occurred_idx" ON "action_log" USING btree ("pruned_at","occurred_at");
