-- 261006-biv — 거래처 갈래 칸 vendors.kind(client · supplier · both, 기본 'both')와 CHECK, 기존 거래처를 쓰임대로 채운다.
-- 채우기(D-2): projects.client_id · reserve_entries.client_id에만 쓰인 거래처 = 'client', quote_lines.vendor_id · expenses.vendor_id에만
-- 쓰인 거래처 = 'supplier', 양쪽 다 쓰였거나 아무 데도 안 쓰인 거래처 = 'both' 그대로. 보관 행도 쓰임으로 센다. vendor_id가 nullable이라
-- NOT IN이 아니라 EXISTS/NOT EXISTS 상관 서브쿼리로 쓴다. updated_at은 건드리지 않는다(사용자 수정이 아니다).
-- CHECK는 기존 표라 NOT VALID로 걸고 검증은 *_vendor_kind_validate.sql(별도 트랜잭션, 0025 · 0026 선례 — squawk constraint-missing-not-valid).
-- rollback-floor를 두지 않는다 — 옛 리비전은 kind를 모르고도 넣기(DB 기본 'both') · 읽기가 그대로 돈다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "kind" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_kind_check" CHECK ("vendors"."kind" IN ('client','supplier','both')) NOT VALID;--> statement-breakpoint
UPDATE "vendors" SET "kind" = 'client'
WHERE (
    EXISTS (SELECT 1 FROM "projects" p WHERE p."client_id" = "vendors"."id")
    OR EXISTS (SELECT 1 FROM "reserve_entries" r WHERE r."client_id" = "vendors"."id")
  )
  AND NOT EXISTS (SELECT 1 FROM "quote_lines" q WHERE q."vendor_id" = "vendors"."id")
  AND NOT EXISTS (SELECT 1 FROM "expenses" e WHERE e."vendor_id" = "vendors"."id");--> statement-breakpoint
UPDATE "vendors" SET "kind" = 'supplier'
WHERE (
    EXISTS (SELECT 1 FROM "quote_lines" q WHERE q."vendor_id" = "vendors"."id")
    OR EXISTS (SELECT 1 FROM "expenses" e WHERE e."vendor_id" = "vendors"."id")
  )
  AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."client_id" = "vendors"."id")
  AND NOT EXISTS (SELECT 1 FROM "reserve_entries" r WHERE r."client_id" = "vendors"."id");
