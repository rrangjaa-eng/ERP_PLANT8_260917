-- Phase 04.2 — 공휴일 표·연도 확정. 머지 직전 origin/main 머지 → 이 페이즈의 마이그레이션·스냅숏·journal 항목 삭제 → pnpm db:generate 재실행. 번호나 _journal.json을 손으로 고치지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "holiday_year_confirmations" (
	"year" integer PRIMARY KEY NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holiday_year_generations" (
	"year" integer PRIMARY KEY NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"origin_year" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_key" UNIQUE("date"),
	CONSTRAINT "holidays_kind_check" CHECK ("holidays"."kind" in ('statutory', 'substitute', 'temporary', 'election')),
	CONSTRAINT "holidays_origin_year_check" CHECK (("holidays"."kind" = 'substitute') = ("holidays"."origin_year" is not null))
);
--> statement-breakpoint
ALTER TABLE "holiday_year_confirmations" ADD CONSTRAINT "holiday_year_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;