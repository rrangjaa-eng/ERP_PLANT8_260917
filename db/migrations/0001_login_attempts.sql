CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"success" boolean NOT NULL,
	"ip" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_reason" text
);
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "login_attempts_email_attempted_idx" ON "login_attempts" USING btree ("email","attempted_at");