-- 261006-biv — *_vendor_kind.sql이 NOT VALID로 건 vendors_kind_check를 별도 트랜잭션에서 검증한다 — SHARE UPDATE EXCLUSIVE 잠금뿐이라
-- 검증 중 읽기가 막히지 않는다(0026 선례). 어긋난 기존 행이 있으면 여기서 실패하고 migrate() 트랜잭션이 통째로 되돌아간다(부분 적용 없음).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_kind_check";
