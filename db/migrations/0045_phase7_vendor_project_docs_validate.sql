-- 07-11(07 S3) — *_phase7_vendor_project_docs.sql이 검증을 미뤄 건 CHECK 둘 · FK 하나를 검증한다(files_owner_kind_check 값 셋 추가 ·
-- quote_revisions_customer_approval_basis_check · vendors_confirmed_by_users_id_fk). 별도 트랜잭션이 아니다 — drizzle migrate()는 밀린
-- 마이그레이션을 같은 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 앞 파일과 함께 적용되면 그 ALTER TABLE이 잡은
-- ACCESS EXCLUSIVE 잠금 아래에서 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고
-- 검증한다(0026 · 0028 · 0035 · 0040 · 0042 선례). 같은 Job에서 돌아도 되는 이유: (가) 대상 표 files · quote_revisions · vendors가 작다 —
-- 운영 전환 전이라 스테이징 시험 데이터뿐이고(운영 데이터는 Phase 8 이관) VALIDATE 전체 훑기가 statement_timeout = 5s 안에 끝난다 (나) ACCESS
-- EXCLUSIVE 대기는 lock_timeout = 1s로 묶여 길게 막지 않는다 (다) 실패하면 트랜잭션이 통째로 되돌아가 반쯤 걸린 제약이 남지 않는다.
-- 기존 행은 모두 통과한다 — owner_kind 값 목록은 기존 네 값을 그대로 품고, 새 칸 둘은 전부 NULL이다. rollback-floor를 두지 않는다 — 검증은
-- 옛 리비전의 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "files" VALIDATE CONSTRAINT "files_owner_kind_check";
--> statement-breakpoint
ALTER TABLE "quote_revisions" VALIDATE CONSTRAINT "quote_revisions_customer_approval_basis_check";
--> statement-breakpoint
ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_confirmed_by_users_id_fk";
