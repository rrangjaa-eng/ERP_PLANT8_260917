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