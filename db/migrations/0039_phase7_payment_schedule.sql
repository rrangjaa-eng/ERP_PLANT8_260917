-- 07-02(07 S1) — 희망 지급일 · 사유 쌍(D-714 · D18) · 수동 지정 기록 칸 scheduled_payment_set_by · _set_at(C6) · 거래처 지급 기한
-- payment_term_days(J5 — 260907 payment_due_days, 협력사 갈래만 · 1~180) · 거래처 version(G9 — 동시 수정 검사 칸, 비교는 07-20).
-- 칸은 null 허용이거나 상수 기본값(vendors.version DEFAULT 1 — PG16은 상수 기본값을 카탈로그에만 적어 표를 다시 쓰지 않는다)이라 기존 행을
-- 다시 쓰지 않는다. 기존 expenses.scheduled_payment_date 값은 지우지 않고 기록 칸이 빈 「수동 지정」으로 그대로 둔다(D-740 — 데이터 UPDATE 없음).
-- 기존 표에 거는 CHECK 넷 · FK 하나는 검증을 미뤄 걸고 검증은 *_phase7_payment_schedule_validate.sql(0033 · 0035 선례 — squawk
-- constraint-missing-not-valid). rollback-floor를 두지 않는다 — 칸 · 제약을 더하기만 해서 옛 리비전의 넣기(null · 기본값 1) · 읽기가 그대로 돈다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "scheduled_payment_set_by" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "scheduled_payment_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "requested_payment_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "requested_payment_reason" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "payment_term_days" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_scheduled_payment_set_by_users_id_fk" FOREIGN KEY ("scheduled_payment_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_requested_payment_pair_check" CHECK (("expenses"."requested_payment_date" IS NULL) = ("expenses"."requested_payment_reason" IS NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_scheduled_payment_set_check" CHECK (("expenses"."scheduled_payment_set_by" IS NULL AND "expenses"."scheduled_payment_set_at" IS NULL) OR ("expenses"."scheduled_payment_set_by" IS NOT NULL AND "expenses"."scheduled_payment_set_at" IS NOT NULL AND "expenses"."scheduled_payment_date" IS NOT NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_payment_term_days_range_check" CHECK ("vendors"."payment_term_days" IS NULL OR "vendors"."payment_term_days" BETWEEN 1 AND 180) NOT VALID;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_payment_term_days_supplier_check" CHECK ("vendors"."payment_term_days" IS NULL OR "vendors"."kind" IN ('supplier','both')) NOT VALID;