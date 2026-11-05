-- rollback-floor를 두지 않는다 — 더하기만. 옛 리비전은 새 칸 · 새 표를 읽지 않고, 넣기는 기본값(days = 1)과 NULL을 받으며, 바뀐 CHECK 둘(line_kind ·
-- files owner_kind)은 옛 값을 그대로 품는다.
-- 07.2-01(R1) — 07.2 새 기능이 저장할 칸 · 표 · 줄 종류를 한 번에 만든다. 쓰는 길은 뒤 플랜이 만들고 칸이 비어 있어도 지금 동작은 그대로다.
-- quote_lines: days(PU6 D-7230 · D-7231 · numeric(12,2) NOT NULL DEFAULT 1 — 상수 기본값이라 pg16은 표를 다시 쓰지 않고 기존 줄은 1로 읽혀
-- 견적가가 바뀌지 않는다) · client_remark(D-7232 · 500자) · major_category · mid_category(X2 D-7240) · adjustment_pair_id ·
-- counterpart_project_id(D7298-B D-7300 — 두 조정 줄이 공유 키 하나로 묶여 순환 FK가 없다) · line_kind에 commission(PU3 D-7222).
-- quote_revisions: printed_at · printed_by(PU4 D-7228). leave_requests: start_time(PU11 D-7258 — 반반차에만, 기존 행은 NULL).
-- files: owner_kind에 company_logo(PU3 D-7225). 새 표 expense_date_change_requests(X4 D-7291 — 대기 요청은 문서당 하나, 부분 유일 인덱스).
-- 잠금: 기존 표 ADD COLUMN은 ACCESS EXCLUSIVE를 순간 잡고 표를 다시 쓰지 않는다. 기존 표에 거는 CHECK 여섯 · FK 둘은 검증을 미뤄 걸고
-- (squawk constraint-missing-not-valid) 검증은 *_phase72_new_features_validate.sql(0044 · 0045 · 0047 · 0048 선례). line_kind · files
-- owner_kind CHECK는 DROP 뒤 값 하나를 더해 다시 건다. quote_lines_adjustment_pair_idx 인덱스 생성 = quote_lines에 SHARE 잠금(쓰기 막힘)이지만
-- 표가 작아(운영 전환 전 스테이징 시험 데이터뿐) statement_timeout = 5s 안에 끝난다. 새 표는 비어 있어 CHECK · FK에 검증 미룸이 필요 없다.
-- 잠금 대기는 lock_timeout = 1s로 묶인다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "expense_date_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"new_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp,
	"reject_memo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_date_change_requests_status_check" CHECK ("expense_date_change_requests"."status" IN ('pending','approved','rejected','withdrawn')),
	CONSTRAINT "expense_date_change_requests_reason_length_check" CHECK (char_length("expense_date_change_requests"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "expense_date_change_requests_decided_check" CHECK (("expense_date_change_requests"."status" = 'pending') = ("expense_date_change_requests"."decided_at" IS NULL) AND ("expense_date_change_requests"."decided_at" IS NULL) = ("expense_date_change_requests"."decided_by" IS NULL)),
	CONSTRAINT "expense_date_change_requests_reject_memo_check" CHECK (("expense_date_change_requests"."status" = 'rejected') = ("expense_date_change_requests"."reject_memo" IS NOT NULL)),
	CONSTRAINT "expense_date_change_requests_reject_memo_length_check" CHECK ("expense_date_change_requests"."reject_memo" IS NULL OR char_length("expense_date_change_requests"."reject_memo") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_owner_kind_check";--> statement-breakpoint
ALTER TABLE "quote_lines" DROP CONSTRAINT "quote_lines_line_kind_check";--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD COLUMN "printed_at" timestamp;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD COLUMN "printed_by" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "days" numeric(12, 2) DEFAULT '1.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "client_remark" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "major_category" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "mid_category" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "adjustment_pair_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "counterpart_project_id" uuid;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "expense_date_change_requests" ADD CONSTRAINT "expense_date_change_requests_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_date_change_requests" ADD CONSTRAINT "expense_date_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_date_change_requests" ADD CONSTRAINT "expense_date_change_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_date_change_requests_expense_idx" ON "expense_date_change_requests" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_date_change_requests_pending_uniq" ON "expense_date_change_requests" USING btree ("expense_id") WHERE "expense_date_change_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_printed_by_users_id_fk" FOREIGN KEY ("printed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_counterpart_project_id_projects_id_fk" FOREIGN KEY ("counterpart_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "quote_lines_adjustment_pair_idx" ON "quote_lines" USING btree ("adjustment_pair_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_kind_check" CHECK ("files"."owner_kind" IN ('expense','quote_revision','reserve_entry','corp_card_usage','vendor_document','project_document','revenue_entry','company_logo')) NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_days_check" CHECK ("quote_lines"."days" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_client_remark_length_check" CHECK ("quote_lines"."client_remark" IS NULL OR char_length("quote_lines"."client_remark") <= 500) NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_adjustment_pair_check" CHECK (("quote_lines"."adjustment_pair_id" IS NULL) = ("quote_lines"."counterpart_project_id" IS NULL) AND ("quote_lines"."adjustment_pair_id" IS NULL OR "quote_lines"."line_kind" = 'adjustment')) NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_line_kind_check" CHECK ("quote_lines"."line_kind" IN ('quote','out_of_quote','adjustment','commission')) NOT VALID;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_start_time_kind_check" CHECK ("leave_requests"."start_time" IS NULL OR "leave_requests"."kind" = 'quarter_day') NOT VALID;