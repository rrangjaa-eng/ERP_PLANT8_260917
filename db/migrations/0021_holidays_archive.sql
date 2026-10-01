-- rollback-floor: 0021 holidays_date_key 제거 — 직전 리비전의 ON CONFLICT (date)가 부분 인덱스를 추론하지 못하고 보관 행을 공휴일로 읽는다
-- quick 261001-hfi(D-01 · ADMN-12) — 공휴일 삭제를 보관함으로. 보관 칸 두 개를 더하고, 날짜 유일 제약을 보관 안 된 행만
-- 보는 부분 유일 인덱스로 바꾼다(보관 행이 날짜를 붙잡으면 대체일 재배치 · 같은 날짜 재추가가 막힌다). ARCHITECTURE §5
-- 「확장 전용(DROP 없음)」의 예외 한 건 — 사용자 승인(2026-10-01, 단일 마이그레이션), docs/design/DECISIONS.md 2026-10-01
-- 261001-hfi 기록 참조. 0015 선례와 같은 락 타임아웃 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "holidays" DROP CONSTRAINT "holidays_date_key";--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN "archived_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_date_active_key" ON "holidays" USING btree ("date") WHERE "holidays"."archived_at" is null;
