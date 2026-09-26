-- 04.3-02 Task 1 ②-b(codex final3 A1 · C2) — cert_winners_event_id_name_phone_unique의
-- 지연 여부를 마지막 문장에서 바꾼다. drizzle-kit이 이 절을 내지 못해
-- (unique() 빌더에 nullsNotDistinct()만 있음, drizzle-kit 0.31.10의
-- 지연 옵션은 트랜잭션 쪽뿐) custom SQL로 만든다. Postgres 16의
-- ALTER CONSTRAINT는 UNIQUE의 지연 여부를 바꾸지 못하므로 DROP → 인덱스로
-- 다시 걸기다 — 표가 같은 migrate() 트랜잭션에서 방금 생긴 빈 표라 잠금
-- 부담이 없다. 칸을 괄호로 적는 `ADD CONSTRAINT ... UNIQUE (...) DEFERRABLE`
-- 형태는 squawk(.squawk.toml)가 constraint-missing-not-valid ·
-- disallowed-unique-constraint로 막는다 — USING INDEX 형태를 쓴다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "cert_winners" DROP CONSTRAINT "cert_winners_event_id_name_phone_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "cert_winners_event_id_name_phone_unique" ON "cert_winners" ("event_id", "name", "phone");
--> statement-breakpoint
ALTER TABLE "cert_winners" ADD CONSTRAINT "cert_winners_event_id_name_phone_unique" UNIQUE USING INDEX "cert_winners_event_id_name_phone_unique" DEFERRABLE INITIALLY IMMEDIATE;
