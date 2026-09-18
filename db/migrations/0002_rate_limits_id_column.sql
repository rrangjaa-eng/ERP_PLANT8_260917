SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "rate_limits" ADD COLUMN "id" text NOT NULL;
