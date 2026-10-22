-- 07-02(07 S1) — *_phase7_payment_schedule.sql이 검증을 미뤄 건 CHECK 넷 · FK 하나를 검증한다. 별도 트랜잭션이 아니다 — drizzle migrate()는
-- 밀린 마이그레이션을 같은 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js migrate). 앞 파일과 함께 적용되면 그 ALTER TABLE이 잡은
-- ACCESS EXCLUSIVE 잠금 아래에서 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고
-- 검증한다(0026 · 0028 · 0035 선례). 같은 Job에서 돌아도 되는 이유(R3): (가) 대상 표 expenses · vendors가 작다 — 운영 전환 전이라 스테이징
-- 시험 데이터뿐이고(운영 데이터는 Phase 8 이관) VALIDATE 전체 훑기가 statement_timeout = 5s 안에 끝난다 (나) ACCESS EXCLUSIVE 대기는
-- lock_timeout = 1s로 묶여 길게 막지 않는다 (다) 실패하면 트랜잭션이 통째로 되돌아가 반쯤 걸린 제약이 남지 않는다. 파일을 나눈 이유는 squawk
-- constraint-missing-not-valid 규칙이고, 운영 표가 커진 뒤에도 같은 꼴(앞 파일 먼저 배포 → 이 파일은 SHARE UPDATE EXCLUSIVE)을 쓰려고 유지한다.
-- 어긋난 기존 행이 있으면 여기서 실패하고 migrate() 트랜잭션이 통째로 되돌아간다(부분 적용 없음). 새 칸은 전부 null(version은 기본값 1)이라
-- 기존 행은 모두 통과한다 — 기존 예정일 행은 기록 칸이 비어 기록 CHECK를 통과한다(D-740). rollback-floor를 두지 않는다 — 검증은 옛 리비전의
-- 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_scheduled_payment_set_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_requested_payment_pair_check";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_scheduled_payment_set_check";
--> statement-breakpoint
ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_payment_term_days_range_check";
--> statement-breakpoint
ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_payment_term_days_supplier_check";
