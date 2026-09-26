-- 04.3-02 Task 1 ① — 확인증 신규 표 다섯 개 생성. 전부 신규 테이블(FK만
-- 있고 데이터 없음)이라 락 경합이 낮지만 0010 선례와 같은 락 타임아웃
-- 한 쌍을 첫 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"won_on" date NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"closed_reason" text,
	"closed_by" text,
	"created_by" text,
	"contact_phone" text NOT NULL,
	"expense_document_id" uuid,
	"create_request_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cert_events_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "cert_events_create_request_id_unique" UNIQUE("create_request_id"),
	CONSTRAINT "cert_events_closed_reason_check" CHECK ("cert_events"."closed_reason" is null or "cert_events"."closed_reason" in ('all_submitted','manual'))
);
--> statement-breakpoint
CREATE TABLE "cert_signature_uploads" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cert_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"winner_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"cert_no" text NOT NULL,
	"name" text,
	"rrn_encrypted" text,
	"rrn_masked" text,
	"phone" text,
	"address" text,
	"consent_at" timestamp NOT NULL,
	"consent_version" text NOT NULL,
	"retention_years" integer NOT NULL,
	"signature_key" text,
	"idempotency_key_hash" text,
	"submitted_at" timestamp NOT NULL,
	"purged_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cert_submissions_winner_id_unique" UNIQUE("winner_id"),
	CONSTRAINT "cert_submissions_cert_no_unique" UNIQUE("cert_no")
);
--> statement-breakpoint
CREATE TABLE "cert_winners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text,
	"phone" text,
	"distinguish_label" text,
	"prize_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"delivery" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"cumulative_failed_attempts" integer DEFAULT 0 NOT NULL,
	"hard_locked_at" timestamp,
	"verify_idem_outcome" jsonb,
	"verify_proof_hash" text,
	"verified_until" timestamp,
	"offered_consent_version" text,
	"offered_retention_years" integer,
	"submitted_at" timestamp,
	"expense_line_id" uuid,
	"purged_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cert_winners_event_id_name_phone_unique" UNIQUE("event_id","name","phone"),
	CONSTRAINT "cert_winners_quantity_check" CHECK ("cert_winners"."quantity" >= 1),
	CONSTRAINT "cert_winners_delivery_check" CHECK ("cert_winners"."delivery" in ('onsite','parcel'))
);
--> statement-breakpoint
CREATE TABLE "privacy_session_activity" (
	"session_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cert_events" ADD CONSTRAINT "cert_events_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_events" ADD CONSTRAINT "cert_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_winner_id_cert_winners_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."cert_winners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_event_id_cert_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cert_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_winners" ADD CONSTRAINT "cert_winners_event_id_cert_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cert_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_winners" ADD CONSTRAINT "cert_winners_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_session_activity" ADD CONSTRAINT "privacy_session_activity_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cert_winners_event_id_idx" ON "cert_winners" USING btree ("event_id");