-- 버그 수정 — 원화 금액 열 7개를 int4에서 bigint로 넓힌다. int4 상한
-- (2,147,483,647원, 약 21.4억)을 넘는 견적·계약·매출이 저장 실패했다
-- (test/integration/large-amount.test.ts). int4→int8은 표 재작성과
-- ACCESS EXCLUSIVE 락이 필요하지만, 세 표 모두 사내 장부(수십 명 규모)라
-- 행 수가 작아 재작성이 짧다 — 0003·0004·0009 선례와 같은 락 타임아웃
-- 한 쌍을 두어 경합 시 기다리지 않고 실패하게 한다. 읽는 쪽은 drizzle
-- bigint(mode: "number")라 코드의 number 타입이 그대로다.
-- squawk-ignore-file changing-column-type
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "pre_estimate_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "contract_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "unit_price_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "execution_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "quote_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "profit_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "revenue_entries" ALTER COLUMN "amount_amount_krw" SET DATA TYPE bigint;
