-- F52 — *_phase7_budget_revision_once.sql이 검증을 미뤄 건 FK 하나(project_budget_entries_quote_revision_id_quote_revisions_id_fk)를 검증한다.
-- 0045 선례와 같다: 앞 파일과 같은 migrate() 트랜잭션이면 그 ALTER TABLE의 잠금 아래에서, 앞선 배포에서 이미 적용됐으면 SHARE UPDATE
-- EXCLUSIVE로 검증한다. 기존 행은 모두 통과한다 — 새 칸은 전부 NULL이다. 표가 작아(스테이징 시험 데이터뿐) 5s 안에 끝나고, 실패하면 통째로
-- 되돌아간다. rollback-floor 없음.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "project_budget_entries" VALIDATE CONSTRAINT "project_budget_entries_quote_revision_id_quote_revisions_id_fk";
