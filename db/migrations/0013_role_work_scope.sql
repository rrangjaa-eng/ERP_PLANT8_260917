-- Phase 4(04-27, D11·D20) — 계급마다 업무 범위(team 자기 팀 · company 전사)를 둔다.
-- 컬럼 추가뿐인 확장 전용이다. 두 값 CHECK는 컬럼 정의 안에 인라인으로 둔다 —
-- 따로 내는 ADD CONSTRAINT … CHECK와 NOT VALID + VALIDATE 쌍은 squawk가 거부한다(B-22).
-- 시드 계급 셋(본부 책임자·대표·시스템 관리자)은 company로 채운다 — 새 DB의 시드
-- (domain/permissions/roles.ts SEED_ROLES)와 같은 값이다.
-- 0003·0004·0009~0012 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "work_scope" text DEFAULT 'team' NOT NULL CONSTRAINT "roles_work_scope_check" CHECK ("work_scope" IN ('team','company'));
--> statement-breakpoint
UPDATE "roles" SET "work_scope" = 'company' WHERE "id" IN ('role-division-head','role-ceo','role-sysadmin');
