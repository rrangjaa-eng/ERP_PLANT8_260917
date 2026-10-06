-- PR #176 후속 — 증빙 종류(evidence_type) 세금 규칙을 이미 만든 DB에서도 시드에 맞춘다. 시드는 기존 행을 덮지 않아
-- (repositories/code-tables.ts onConflictDoNothing) 새 시드 값이 새 DB에만 들어간다. 카드 전표·현금영수증은 세금계산서와
-- 같은 부가세 규칙, 기타소득·사업소득은 원천징수 10원 미만 절사. 옛 시드 값과 jsonb로 정확히 같은 행만 바꿔(키 순서 무관)
-- 관리자가 이미 바꾼 값은 덮지 않고, 다시 돌려도 결과가 같다. 0011·0012 선례대로 action_log는 남기지 않는다
-- (기록 주체가 사람인 화면 변경만 남긴다). 0011 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
UPDATE "code_items"
SET "tax_rule" = '{"ruleKind":"vat_surcharge","roundingUnit":1,"roundingMethod":"round","minWithholdingAmount":0,"basisDate":"evidence_date"}'::jsonb,
    "updated_at" = now()
WHERE "table_key" = 'evidence_type'
  AND "value" IN ('card_receipt', 'cash_receipt')
  AND "tax_rule" = '{"ruleKind":"none"}'::jsonb;
--> statement-breakpoint
UPDATE "code_items"
SET "tax_rule" = '{"ruleKind":"withholding","roundingUnit":10,"roundingMethod":"truncate","minWithholdingAmount":125000,"basisDate":"payment_date"}'::jsonb,
    "updated_at" = now()
WHERE "table_key" = 'evidence_type'
  AND "value" = 'other_income'
  AND "tax_rule" = '{"ruleKind":"withholding","roundingUnit":10,"roundingMethod":"round","minWithholdingAmount":125000,"basisDate":"payment_date"}'::jsonb;
--> statement-breakpoint
UPDATE "code_items"
SET "tax_rule" = '{"ruleKind":"withholding","roundingUnit":10,"roundingMethod":"truncate","minWithholdingAmount":0,"basisDate":"payment_date"}'::jsonb,
    "updated_at" = now()
WHERE "table_key" = 'evidence_type'
  AND "value" = 'business_income'
  AND "tax_rule" = '{"ruleKind":"withholding","roundingUnit":10,"roundingMethod":"round","minWithholdingAmount":0,"basisDate":"payment_date"}'::jsonb;
