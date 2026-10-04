-- Phase 5(05-04) — 증빙 파일 · 업로드 의도 표. 새 빈 표라 재작성 · 백필이 없다. 기존 표(users)를 참조하는 FK ALTER가
-- 그 표에 잠금을 잡으므로 잠금 · 문장 시간 상한을 둔다(0022 · 0024 · 0025 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"original_name" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"removed_by" text,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_owner_kind_check" CHECK ("files"."owner_kind" IN ('expense')),
	CONSTRAINT "files_sha256_check" CHECK ("files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_size_bytes_check" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_void_check" CHECK (("files"."voided_at" IS NULL AND "files"."voided_by" IS NULL AND "files"."void_reason" IS NULL) OR ("files"."voided_at" IS NOT NULL AND "files"."voided_by" IS NOT NULL AND "files"."void_reason" IS NOT NULL)),
	CONSTRAINT "files_void_reason_length_check" CHECK ("files"."void_reason" IS NULL OR char_length("files"."void_reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"declared_size" integer NOT NULL,
	"declared_content_type" text NOT NULL,
	"declared_sha256" text NOT NULL,
	"original_name" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upload_intents_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "upload_intents_created_by_idx" ON "upload_intents" USING btree ("created_by");