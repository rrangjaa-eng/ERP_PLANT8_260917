-- 261006-biv — *_vendor_kind.sql이 NOT VALID로 건 vendors_kind_check를 검증한다. 별도 트랜잭션이 아니다 — drizzle migrate()는 밀린 마이그레이션을
-- 한 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 0027과 함께 적용되면 0027의 ALTER TABLE이 잡은 ACCESS EXCLUSIVE
-- 잠금 아래에서 검증하고, 0027이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고 검증한다(0026 선례).
-- 파일을 나눈 이유는 squawk constraint-missing-not-valid 규칙이다. 어긋난 기존 행이 있으면 여기서 실패하고 migrate() 트랜잭션이 통째로
-- 되돌아간다(부분 적용 없음).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_kind_check";
