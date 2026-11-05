-- rollback-floor: 없음 — 더하기만. 옛 리비전은 새 칸을 읽지 않고, 넣기는 기본값(days = 1)을 받는다.
-- 07.2-01(R1 · PU6 D-7230 · D-7231) — quote_lines.days(일수 · 견적가 = 수량 × 단가 × 일수). numeric(12,2) NOT NULL DEFAULT 1 — 상수 기본값이라
-- pg16은 표를 다시 쓰지 않고 기존 줄은 전부 1로 읽혀 견적가가 바뀌지 않는다. ADD COLUMN은 quote_lines에 ACCESS EXCLUSIVE 잠금을 잡지만
-- 순간이고, 잠금 대기는 lock_timeout = 1s로 묶인다. CHECK days > 0은 검증을 미뤄 걸고(squawk constraint-missing-not-valid) 검증은
-- *_phase72_new_features_validate.sql(0047 · 0048 선례).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "days" numeric(12, 2) DEFAULT '1.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_days_check" CHECK ("quote_lines"."days" > 0) NOT VALID;
