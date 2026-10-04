-- Phase 5(05-01 E4) — 제출 뒤 증빙 변경으로 상태는 그대로 version만 올린 이유. null 허용 컬럼 추가뿐이라
-- 테이블 재작성 · 백필이 없다. 한 값 CHECK는 컬럼 정의 안에 인라인으로 둔다 — 따로 내는 ADD CONSTRAINT … CHECK와
-- NOT VALID + VALIDATE 쌍은 squawk가 거부한다(B-22, 0013 · 0014 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "approval_instances" ADD COLUMN "version_reason" text CONSTRAINT "approval_instances_version_reason_check" CHECK ("version_reason" IS NULL OR "version_reason" IN ('evidence'));
