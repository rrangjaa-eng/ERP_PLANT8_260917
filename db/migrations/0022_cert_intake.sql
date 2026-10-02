-- 04.3-02 Task 1 ① — 확인증 신규 표 다섯 개 생성. 전부 신규 테이블(FK만
-- 있고 데이터 없음)이라 락 경합이 낮지만 0010 선례와 같은 락 타임아웃
-- 한 쌍을 첫 문장 앞에 둔다. origin/main(0017_phase_04_2) 머지 뒤 옛 0017_cert_intake ·
-- 0018(당첨자 지연 UNIQUE 파일)을 지우고 pnpm db:generate로 다시 만든 뒤
-- 두 파일의 손 편집(이 머리 · 끝의 지연 UNIQUE 다시 걸기)을 옮겨 적었다.
-- origin/main(0018_reserve_entries, #85) 머지 뒤 0018_cert_intake를 지우고 다시 생성해 0019로 옮겼다(본문 동일).
-- origin/main(0019_restore_rehearsal_login_status #91 · 0020_hot_maestro #90) 머지 뒤 0019_cert_intake를 지우고 다시 생성해 0021로 옮겼다(본문 동일).
-- origin/main(0021_holidays_archive #137) 머지 뒤 0021_cert_intake를 지우고 다시 생성해 0022로 옮겼다(본문 동일).
-- 04.3-15 — 명단 폐지 · 경품 목록(5909578685)으로 다시 생성했다: 당첨자 표와 그 지연 UNIQUE 절이 없어지고 `cert_prizes` · 제출 경품 칸 · 행사 QR 칸이 생겼다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"won_on" date NOT NULL,
	"token_hash" text,
	"token_encrypted" text,
	"expires_at" timestamp,
	"qr_created_at" timestamp,
	"qr_created_by" text,
	"qr_request_id" uuid,
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
	CONSTRAINT "cert_events_qr_request_id_unique" UNIQUE("qr_request_id"),
	CONSTRAINT "cert_events_closed_reason_check" CHECK ("cert_events"."closed_reason" is null or "cert_events"."closed_reason" = 'manual'),
	CONSTRAINT "cert_events_qr_state_check" CHECK ((("cert_events"."token_hash" is null and "cert_events"."token_encrypted" is null and "cert_events"."qr_created_at" is null) or ("cert_events"."token_hash" is not null and "cert_events"."token_encrypted" is not null and "cert_events"."qr_created_at" is not null)) and ("cert_events"."expires_at" is null or "cert_events"."token_hash" is not null)),
	CONSTRAINT "cert_events_closed_after_qr_check" CHECK ("cert_events"."closed_at" is null or "cert_events"."token_hash" is not null)
);
--> statement-breakpoint
CREATE TABLE "cert_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_value_krw" bigint NOT NULL,
	"delivery" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"expense_line_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cert_prizes_unit_value_krw_check" CHECK ("cert_prizes"."unit_value_krw" >= 1),
	CONSTRAINT "cert_prizes_delivery_check" CHECK ("cert_prizes"."delivery" in ('onsite','parcel')),
	CONSTRAINT "cert_prizes_winner_count_check" CHECK ("cert_prizes"."winner_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cert_signature_uploads" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cert_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"prize_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
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
	"submit_ip_hash" text,
	"excluded_at" timestamp,
	"excluded_by" text,
	"submitted_at" timestamp NOT NULL,
	"purged_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cert_submissions_cert_no_unique" UNIQUE("cert_no"),
	CONSTRAINT "cert_submissions_event_id_idempotency_key_hash_unique" UNIQUE("event_id","idempotency_key_hash"),
	CONSTRAINT "cert_submissions_quantity_check" CHECK ("cert_submissions"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "privacy_session_activity" (
	"session_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cert_events" ADD CONSTRAINT "cert_events_qr_created_by_users_id_fk" FOREIGN KEY ("qr_created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_events" ADD CONSTRAINT "cert_events_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_events" ADD CONSTRAINT "cert_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_prizes" ADD CONSTRAINT "cert_prizes_event_id_cert_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cert_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_prizes" ADD CONSTRAINT "cert_prizes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_event_id_cert_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cert_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_prize_id_cert_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."cert_prizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_excluded_by_users_id_fk" FOREIGN KEY ("excluded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_submissions" ADD CONSTRAINT "cert_submissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_session_activity" ADD CONSTRAINT "privacy_session_activity_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cert_prizes_event_id_idx" ON "cert_prizes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cert_submissions_prize_id_idx" ON "cert_submissions" USING btree ("prize_id");