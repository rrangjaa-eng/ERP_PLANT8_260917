-- 07.1-07(D-7127 · D-7122) — users.division_id(사람의 본부 · org_units 참조 · NULL 허용 · 기본값 없음). 팀 없이 본부에만 속한 사람이 그 본부
-- 공개 증빙을 보도록 증빙 행 범위가 오늘 발령 팀이 없을 때만 읽는다(팀이 있으면 팀의 본부가 이긴다). 칸은 NULL 허용 · 기본값 없음이라
-- 표를 다시 쓰지 않고 기존 행은 전부 NULL이다(이 PR에는 칸 쓰기 길이 없다 — 07.1-14). ADD COLUMN은 users에 ACCESS EXCLUSIVE 잠금을 잡지만
-- 표를 다시 쓰지 않아 순간이고, 잠금 대기는 lock_timeout = 1s로 묶인다. FK는 users에 SHARE ROW EXCLUSIVE를 잡으므로 NOT VALID로 걸어 그
-- 잠금 아래 기존 행을 훑지 않고(squawk constraint-missing-not-valid) 검증은 *_phase71_user_division_validate.sql(0044 · 0045 선례). rollback-floor
-- 없음: 더하기만, 옛 리비전은 새 칸을 읽지 않고 넣기는 NULL을 받는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "division_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_division_id_org_units_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action NOT VALID;
