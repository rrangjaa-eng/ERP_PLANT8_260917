-- 06.5 D-6501(사용자 카드 10/13 19:50 KST · REPORT.md §9 D1): 기타소득은 회사 대납 22% 역산 한 가지다 — 받는 사람이 세금을 내는
-- 현금 기타소득이 없어 8.8% 원천징수 경로를 없앤다(06.5-02). 이미 만든 DB의 증빙 종류 코드표를 맞춘다(시드는 기존 행을 덮지 않는다).
-- 0029와 달리 정확한 옛 jsonb가 아니라 세금 규칙 종류가 원천징수인 other_income 행을 바꾼다(범위 결정 a — 사용자 카드 10/14 13:33 KST):
-- 8.8% 계산 경로가 코드에서 사라지므로 관리자가 절사만 바꾼 원천징수 행을 남기면 다른 세율로 계산되는 조용한 오류가 된다
-- (N: domain/expenses/tax.ts:65-67 incomeTypeFor). 관리자가 다른 종류로 바꾼 값 · 다른 증빙 종류는 건드리지 않는다. 설명 글자는
-- 회사 대납 행이고 정확한 옛 시드 글자일 때만 바꾼다(다른 종류로 바꾼 행은 설명도 그대로). jsonb의 roundingUnit은 장식이다 — 회사 대납 갈래는 설정 tax.rounding.withholding_unit을 쓴다
-- (N: domain/money/tax.ts:117). 0011 · 0029 선례대로 작업 기록을 남기지 않는다(기록 주체가 사람인 화면 변경만 남긴다).
-- 다시 돌려도 결과가 같다(첫 문장 뒤에는 원천징수 행이 없고, 둘째 문장 뒤에는 옛 설명이 없다). 덮인 옛 값은 남지 않는다(one-way).
-- 검증 파일은 *_payment_followup_validate.sql. rollback-floor를 두지 않는다 — 옛 리비전도 회사 대납 갈래를 읽는다(domain/money/tax.ts).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
UPDATE "code_items"
SET "tax_rule" = '{"ruleKind":"company_borne","roundingUnit":10,"roundingMethod":"truncate","minWithholdingAmount":0,"basisDate":"payment_date"}'::jsonb,
    "updated_at" = now()
WHERE "table_key" = 'evidence_type'
  AND "value" = 'other_income'
  AND "tax_rule"->>'ruleKind' = 'withholding';
--> statement-breakpoint
UPDATE "code_items"
SET "description" = '경품 등 일시 소득 · 회사 대납',
    "updated_at" = now()
WHERE "table_key" = 'evidence_type'
  AND "value" = 'other_income'
  AND "tax_rule"->>'ruleKind' = 'company_borne'
  AND "description" = '강사료·경품 등 일시 소득 · 원천징수 대상';
