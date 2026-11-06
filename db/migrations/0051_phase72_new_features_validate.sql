-- 07.2-01(R1) — *_phase72_new_features.sql이 검증을 미뤄 건 CHECK 여섯 · FK 둘을 검증한다(quote_lines_days_check ·
-- quote_lines_client_remark_length_check · quote_lines_adjustment_pair_check · quote_lines_line_kind_check(commission 추가) ·
-- files_owner_kind_check(company_logo 추가) · leave_requests_start_time_kind_check · quote_revisions_printed_by_users_id_fk ·
-- quote_lines_counterpart_project_id_projects_id_fk). 별도 트랜잭션이 아니다 — drizzle migrate()는 밀린 마이그레이션을 같은 트랜잭션에서
-- 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 앞 파일과 함께 적용되면 그 ALTER TABLE이 잡은 ACCESS EXCLUSIVE 잠금 아래에서
-- 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고 검증한다(0045 · 0048 선례). 같은
-- Job에서 돌아도 되는 이유: (가) 대상 표 quote_lines · quote_revisions · leave_requests · files가 작다 — 운영 전환 전이라 스테이징 시험
-- 데이터뿐이고 VALIDATE 전체 훑기가 statement_timeout = 5s 안에 끝난다 (나) 잠금 대기는 lock_timeout = 1s로 묶인다 (다) 실패하면
-- 트랜잭션이 통째로 되돌아가 반쯤 걸린 제약이 남지 않는다. 기존 행은 모두 통과한다 — days는 전부 1, 새 칸은 전부 NULL, 두 값 목록은 옛
-- 값을 그대로 품는다. rollback-floor를 두지 않는다 — 검증은 옛 리비전의 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_days_check";
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_client_remark_length_check";
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_adjustment_pair_check";
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_line_kind_check";
--> statement-breakpoint
ALTER TABLE "quote_lines" VALIDATE CONSTRAINT "quote_lines_counterpart_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "quote_revisions" VALIDATE CONSTRAINT "quote_revisions_printed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "leave_requests" VALIDATE CONSTRAINT "leave_requests_start_time_kind_check";
--> statement-breakpoint
ALTER TABLE "files" VALIDATE CONSTRAINT "files_owner_kind_check";
