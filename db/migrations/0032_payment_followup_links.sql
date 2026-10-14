-- 06.5-01(D-6502) — 지급 완료 규칙이 만든 「기타소득세 대납」 조정 줄과 그 지출결의를 잇는 quote_lines 칸 둘(source_expense_id ·
-- source_synced_version), 조정 줄만 · 두 칸 짝 CHECK 둘, 지출결의당 살아 있는 연결 줄 하나 부분 유일 색인. source_expense_id에는 FK를
-- 걸지 않는다(db/schema/expenses.ts가 quote-lines를 import해 반대 방향 참조는 순환 — test/unit/import-cycles.test.ts).
-- 재작성 · 백필이 없다(새 칸은 null 허용 · 기본값 없음). CHECK는 기존 표라 검증을 미뤄 걸고 검증은 이 PR의 *_payment_followup_validate.sql
-- (0027 · 0028 선례 — squawk constraint-missing-not-valid). 색인 동시 생성은 drizzle 단일 트랜잭션 안이라 쓸 수 없다(0030 — 행 수가 적어
-- 잠금은 순간이다). rollback-floor를 두지 않는다 — 옛 리비전은 새 칸을 모르고도 넣기 · 읽기가 그대로 돈다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "source_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "source_synced_version" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_lines_source_expense_live_uniq" ON "quote_lines" USING btree ("source_expense_id") WHERE "quote_lines"."source_expense_id" IS NOT NULL AND "quote_lines"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_source_expense_kind_check" CHECK ("quote_lines"."source_expense_id" IS NULL OR "quote_lines"."line_kind" = 'adjustment') NOT VALID;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_source_synced_pair_check" CHECK (("quote_lines"."source_expense_id" IS NULL) = ("quote_lines"."source_synced_version" IS NULL)) NOT VALID;
