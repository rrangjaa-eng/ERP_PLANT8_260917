-- 07.1-07(D-7127) — *_phase71_user_division.sql이 검증을 미뤄 건 FK users_division_id_org_units_id_fk를 검증한다. 별도 트랜잭션이 아니다 —
-- drizzle migrate()는 밀린 마이그레이션을 같은 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 앞 파일과 함께 적용되면 그
-- ALTER TABLE이 잡은 잠금 아래에서 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고
-- 검증한다(0045 선례). 같은 Job에서 돌아도 되는 이유: (가) users가 작다 — 운영 전환 전이라 스테이징 시험 데이터뿐이고 VALIDATE 전체 훑기가
-- statement_timeout = 5s 안에 끝난다 (나) 잠금 대기는 lock_timeout = 1s로 묶인다 (다) 실패하면 트랜잭션이 통째로 되돌아간다. 기존 행은 모두
-- 통과한다 — 새 칸은 전부 NULL이다. rollback-floor를 두지 않는다 — 검증은 옛 리비전의 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" VALIDATE CONSTRAINT "users_division_id_org_units_id_fk";
