-- 버그 수정 — 원화 금액 열 6개를 int4에서 bigint로 넓힌다. int4 상한(2,147,483,647원, 약 21.4억)에
-- 막혀 99억 같은 실제 견적·매출을 저장하지 못했다(test/integration/large-amount.test.ts). 입력 상한은
-- domain/money의 KRW_COLUMN_MIN/MAX(1조 원 미만)가 맡는다. int4→int8은 표 재작성과 ACCESS EXCLUSIVE
-- 락이 필요하지만 세 표 모두 사내 장부라 행 수가 작다 — 0010·0015 선례와 같은 락 타임아웃 한 쌍을 두고,
-- 표마다 ALTER 한 번으로 묶어 재작성·인덱스 재생성이 표당 한 번만 일어나게 한다. 옛 리비전의 integer
-- 매퍼도 int8 값을 그대로 읽으므로 롤백 하한(rollback-floor)은 두지 않는다.
-- squawk-ignore-file changing-column-type
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "pre_estimate_amount_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "unit_price_amount_krw" SET DATA TYPE bigint, ALTER COLUMN "execution_amount_krw" SET DATA TYPE bigint, ALTER COLUMN "quote_amount_krw" SET DATA TYPE bigint, ALTER COLUMN "profit_krw" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "revenue_entries" ALTER COLUMN "amount_amount_krw" SET DATA TYPE bigint;
