-- 06.5-01 — 나머지 칸: users 직원 지급 계좌 넷 + 예금주 필수 CHECK(D-6505 · D-6506 — vendors에는 DB CHECK를 두지 않고 서버 검사, 06.5-04),
-- corp_card_usages 번호(D-6503) · 중복 방지 키(D-6509), purchase_requests 중복 방지 키(D-6509), expenses 직원 지급처 payee_user_id + FK +
-- 거래처와 동시에 차지 않는 CHECK(D-6517 · 사용자 카드 10/13 23:34 KST), expenses 받는 인원 recipient_count + 1 이상 CHECK(카드 ① · 10/13 23:29 KST).
-- 재작성 · 백필이 없다 — 새 칸은 null 허용이거나 상수 기본값(recipient_count DEFAULT 1 — PG16은 상수 기본값을 카탈로그에만 적어 표를 다시
-- 쓰지 않는다). 기존 표 CHECK 셋 · FK 하나는 검증을 미뤄 걸고 검증은 이 PR의 *_payment_followup_validate.sql(0025 · 0026 · 0027 선례 —
-- squawk constraint-missing-not-valid). 새 유일 색인은 동시 생성 없이 건다(drizzle 단일 트랜잭션 — 0030 선례, 행 수가 적어 잠금은 순간이다).
-- rollback-floor를 두지 않는다 — 옛 리비전은 새 칸을 모르고도 넣기(null · 기본값 1) · 읽기가 그대로 돈다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_bank" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_holder" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_number_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_number_last4" text;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD COLUMN "number" text;--> statement-breakpoint
ALTER TABLE "corp_card_usages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "payee_user_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "recipient_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payee_user_id_users_id_fk" FOREIGN KEY ("payee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "corp_card_usages_number_uniq" ON "corp_card_usages" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "corp_card_usages_idempotency_key_uniq" ON "corp_card_usages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_idempotency_key_uniq" ON "purchase_requests" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_holder_required_check" CHECK ("users"."account_bank" IS NULL OR "users"."account_number_encrypted" IS NULL OR ("users"."account_holder" IS NOT NULL AND btrim("users"."account_holder") <> '')) NOT VALID;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payee_one_check" CHECK (NOT ("expenses"."vendor_id" IS NOT NULL AND "expenses"."payee_user_id" IS NOT NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recipient_count_check" CHECK ("expenses"."recipient_count" >= 1) NOT VALID;
