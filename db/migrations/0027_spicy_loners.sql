-- Phase 5(05-11) — 정산 결재 문서 표. 새 빈 표라 재작성 · 백필이 없다. 기존 표(projects · users)를 참조하는 FK ALTER가
-- 그 표에 잠금을 잡으므로 잠금 · 문장 시간 상한을 둔다(0022 · 0024 · 0025 · 0026 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "settlement_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"drafter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_approvals_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "settlement_approvals" ADD CONSTRAINT "settlement_approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_approvals" ADD CONSTRAINT "settlement_approvals_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;