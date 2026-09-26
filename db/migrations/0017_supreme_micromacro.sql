CREATE TABLE "approval_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"drafter_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_instances_kind_document_key" UNIQUE("document_kind","document_id"),
	CONSTRAINT "approval_instances_status_check" CHECK ("approval_instances"."status" IN ('draft','submitted','in_review','approved','rejected','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "approval_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"self_approval" text NOT NULL,
	"drafter_team_id" uuid,
	"drafter_org_unit_id" uuid,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_routes_instance_round_key" UNIQUE("instance_id","round"),
	CONSTRAINT "approval_routes_self_approval_check" CHECK ("approval_routes"."self_approval" IN ('skip','self_approve'))
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"label" text NOT NULL,
	"role_id" text,
	"scope_kind" text NOT NULL,
	"scope_target_id" uuid,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"acted_by" text,
	"acted_at" timestamp,
	"action" text,
	"reason" text,
	"self_approved" boolean DEFAULT false NOT NULL,
	CONSTRAINT "approval_steps_route_step_key" UNIQUE("route_id","step_index"),
	CONSTRAINT "approval_steps_scope_kind_check" CHECK ("approval_steps"."scope_kind" IN ('team','org_unit','company')),
	CONSTRAINT "approval_steps_action_check" CHECK ("approval_steps"."action" IS NULL OR "approval_steps"."action" IN ('approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"drafter_id" text NOT NULL,
	"kind" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half" text,
	"days_quarters" integer NOT NULL,
	"fiscal_year" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_number_unique" UNIQUE("number"),
	CONSTRAINT "leave_requests_kind_check" CHECK ("leave_requests"."kind" IN ('full_day','half_day','quarter_day','remote')),
	CONSTRAINT "leave_requests_half_check" CHECK ("leave_requests"."half" IS NULL OR "leave_requests"."half" IN ('am','pm')),
	CONSTRAINT "leave_requests_days_quarters_check" CHECK ("leave_requests"."days_quarters" >= 0)
);
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_routes" ADD CONSTRAINT "approval_routes_instance_id_approval_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."approval_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_route_id_approval_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."approval_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_acted_by_users_id_fk" FOREIGN KEY ("acted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_instances_status_idx" ON "approval_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_steps_acted_by_idx" ON "approval_steps" USING btree ("acted_by");--> statement-breakpoint
CREATE INDEX "leave_requests_drafter_year_idx" ON "leave_requests" USING btree ("drafter_id","fiscal_year");