-- 07.3(D-7302 · D-7317) — 계급 role-pm의 표시 이름을 「기획 PM」에서 「사원」으로. 시드는 기존 행을 덮지 않아
-- (repositories/roles.ts seedRole onConflictDoNothing) 새 이름이 새 DB에만 들어간다. 이름이 아직 옛 값일 때만 바꿔
-- 관리자가 이미 바꾼 이름은 덮지 않고, 「사원」 이름 계급이 이미 있으면 이름 unique 때문에 바꾸지 않고 지나간다(배포를
-- 멈추지 않는다). 0029 선례대로 action_log는 남기지 않고(기록 주체가 사람인 화면 변경만 남긴다) 락 타임아웃 한 쌍을 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
UPDATE "roles"
SET "name" = '사원',
    "updated_at" = now()
WHERE "id" = 'role-pm'
  AND "name" = '기획 PM'
  AND NOT EXISTS (SELECT 1 FROM "roles" AS "other" WHERE "other"."name" = '사원');
