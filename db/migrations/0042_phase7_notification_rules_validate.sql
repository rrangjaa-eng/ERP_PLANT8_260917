-- 07-07(07 S2) — *_phase7_notification_rules.sql이 검증을 미뤄 다시 건 notification_log_email_status_check(값 'skipped_rule_off' 추가)를
-- 검증한다. 별도 트랜잭션이 아니다 — drizzle migrate()는 밀린 마이그레이션을 같은 트랜잭션에서 차례로 돌린다(drizzle-orm pg-core dialect.js
-- migrate). 앞 파일과 함께 적용되면 그 ALTER TABLE이 잡은 ACCESS EXCLUSIVE 잠금 아래에서 검증하고, 앞 파일이 앞선 배포에서 이미 적용됐을
-- 때만 SHARE UPDATE EXCLUSIVE 잠금으로 읽기를 막지 않고 검증한다(0026 · 0028 · 0035 · 0040 선례). 같은 Job에서 돌아도 되는 이유: (가)
-- notification_log가 작다 — 운영 전환 전이라 스테이징 시험 데이터뿐이고 VALIDATE 전체 훑기가 statement_timeout = 5s 안에 끝난다 (나)
-- ACCESS EXCLUSIVE 대기는 lock_timeout = 1s로 묶여 길게 막지 않는다 (다) 실패하면 트랜잭션이 통째로 되돌아가 반쯤 걸린 제약이 남지 않는다.
-- 값 목록은 기존 여섯 값을 그대로 품어 기존 행은 모두 통과한다. rollback-floor를 두지 않는다 — 검증은 옛 리비전의 넣기 · 읽기를 바꾸지 않는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "notification_log" VALIDATE CONSTRAINT "notification_log_email_status_check";
