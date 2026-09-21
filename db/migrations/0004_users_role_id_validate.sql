-- 0003이 users_role_id_roles_id_fk를 NOT VALID로 걸었다 — 검증을 별도
-- 트랜잭션(별도 마이그레이션 파일)으로 분리해야 SHARE UPDATE EXCLUSIVE
-- 잠금뿐이고 그 사이 읽기가 막히지 않는다(squawk constraint-missing-not-valid
-- 실측: 같은 트랜잭션에서 NOT VALID+VALIDATE를 함께 쓰면 검증 중 모든 읽기가
-- 막힌다는 경고).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" VALIDATE CONSTRAINT "users_role_id_roles_id_fk";
