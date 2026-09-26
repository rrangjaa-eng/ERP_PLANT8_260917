SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_login_at" timestamp;--> statement-breakpoint
-- 04.4 D8-07 first_login_at backfill
-- 기존 사용자: action_log login 행(pruned_at 무관)과 login_attempts 성공(이메일 대소문자 무관) 중 더 이른 시각.
UPDATE "users" AS u
SET "first_login_at" = least(
  (SELECT min(a."occurred_at") FROM "action_log" AS a WHERE a."action_type" = 'login' AND a."actor_id" = u."id"),
  (SELECT min(l."attempted_at") FROM "login_attempts" AS l WHERE l."success" = true AND l."email" = lower(u."email"))
)
WHERE u."first_login_at" IS NULL;--> statement-breakpoint
-- 기록이 없어도 임시 비밀번호가 아니면 로그인해 바꾼 사람이다 — 실행 시각으로 채운다. 그 밖은 NULL로 둔다.
UPDATE "users" SET "first_login_at" = now() WHERE "first_login_at" IS NULL AND "password_is_temporary" = false;
