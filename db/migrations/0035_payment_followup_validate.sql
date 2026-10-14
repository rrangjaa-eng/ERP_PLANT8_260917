-- 06.5-01 — *_payment_followup_links.sql · *_payment_followup_columns.sql이 검증을 미뤄 건 CHECK 다섯 · FK 하나를 검증한다. 별도 트랜잭션이
-- 아니다 — drizzle migrate()는 밀린 마이그레이션을 한 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 앞 두 파일과 함께
-- 적용되면 그 ALTER TABLE이 잡은 ACCESS EXCLUSIVE 잠금 아래에서 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE
-- EXCLUSIVE 잠금으로 읽기를 막지 않고 검증한다(0026 · 0028 선례). 파일을 나눈 이유는 squawk constraint-missing-not-valid 규칙이다.
-- 어긋난 기존 행이 있으면 여기서 실패하고 migrate() 트랜잭션이 통째로 되돌아간다(부분 적용 없음). 새 칸은 전부 null · 기본값 1이라
-- 기존 행은 모두 통과한다. rollback-floor를 두지 않는다 — 검증은 옛 리비전의 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_source_expense_kind_check";
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_source_synced_pair_check";
--> statement-breakpoint
ALTER TABLE "users" VALIDATE CONSTRAINT "users_account_holder_required_check";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_payee_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_payee_one_check";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_recipient_count_check";
