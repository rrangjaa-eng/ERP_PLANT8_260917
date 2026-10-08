-- Phase 6.2(D6 · D-6201 · D-6203) — 계급마다 보는 범위(company 전사 · org_unit 본부 · team 팀 · own 본인)를 둔다.
-- rowScopeFor(domain/permissions/scope-for.ts)가 읽는 행 범위 입력이다 — 업무 범위(work_scope)는 그대로 쓰기 게이트다(D-6202).
-- 네 값 CHECK는 컬럼 정의 안에 인라인으로 둔다 — 따로 내는 ADD CONSTRAINT … CHECK는 squawk가 거부한다(B-22, 0013 선례).
-- 백필 두 문장: 화면에서 만든 계급(is_seed = false)은 이행 전 업무 범위를 그대로 받고(K1 사용자 답 「쓰기 범위 복사」
-- 2026-10-08), 시드 계급 다섯은 D-6203 값을 받는다 — 새 DB의 시드(domain/permissions/roles.ts SEED_ROLES)와 같은 값이다.
-- 0003·0004·0009~0013 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "view_scope" text DEFAULT 'team' NOT NULL CONSTRAINT "roles_view_scope_check" CHECK ("view_scope" IN ('company','org_unit','team','own'));
--> statement-breakpoint
UPDATE "roles" SET "view_scope" = "work_scope" WHERE "is_seed" = false;
--> statement-breakpoint
UPDATE "roles" SET "view_scope" = CASE "id" WHEN 'role-ceo' THEN 'company' WHEN 'role-sysadmin' THEN 'company' WHEN 'role-division-head' THEN 'org_unit' WHEN 'role-team-lead' THEN 'team' WHEN 'role-pm' THEN 'team' END WHERE "id" IN ('role-ceo','role-sysadmin','role-division-head','role-team-lead','role-pm');
