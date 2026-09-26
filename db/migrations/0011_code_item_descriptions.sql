-- Phase 4(04-10, D-93) — code_items.description 컬럼 추가(NULL 허용, 표
-- 재작성 없음) + 기존 DB의 기본 제공 값 설명 채우기. 신규 컬럼 추가라 락
-- 경합이 낮지만 0003·0004·0009·0010 선례와 같은 락 타임아웃 한 쌍을 첫
-- 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "code_items" ADD COLUMN "description" text;
--> statement-breakpoint
-- 기존 DB(이미 돌고 있는 배포)의 기본 제공 값에만 설명을 채운다 — 관리자가
-- 이미 고친 값은 description IS NULL 조건이 걸러 덮지 않는다. 새 DB는
-- domain/seed/index.ts의 같은 문장이 시드로 채운다(대조 검증: Task 2
-- verify). settled(완료·정산)는 04-06이 넣는다 — 여기 없다.
UPDATE "code_items" SET "description" = '제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용' WHERE "table_key" = 'project_status' AND "value" = 'bidding' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '수주 확정 · 종료일 다음 날 자동으로 정산' WHERE "table_key" = 'project_status' AND "value" = 'in_progress' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '수주 실패 · 쌓인 비용은 팀 미수주 비용' WHERE "table_key" = 'project_status' AND "value" = 'lost' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '무대·부스 설치와 철거 공사' WHERE "table_key" = 'quote_subcategory' AND "value" = 'stage_construction' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '현수막·배너·인쇄물·소품 제작' WHERE "table_key" = 'quote_subcategory' AND "value" = 'print_production' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '진행요원·MC·모델 등 사람 비용' WHERE "table_key" = 'quote_subcategory' AND "value" = 'staffing' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '위 분류에 들지 않는 비용' WHERE "table_key" = 'quote_subcategory' AND "value" = 'etc' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '과세 거래 · 부가세가 붙는 세금계산서' WHERE "table_key" = 'evidence_type' AND "value" = 'tax_invoice' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '면세 거래 · 부가세 없는 계산서' WHERE "table_key" = 'evidence_type' AND "value" = 'invoice' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '법인카드 결제 전표' WHERE "table_key" = 'evidence_type' AND "value" = 'card_receipt' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '지출 증빙용 현금영수증' WHERE "table_key" = 'evidence_type' AND "value" = 'cash_receipt' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '강사료·경품 등 일시 소득 · 원천징수 대상' WHERE "table_key" = 'evidence_type' AND "value" = 'other_income' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '프리랜서 용역 대가 · 원천징수 대상' WHERE "table_key" = 'evidence_type' AND "value" = 'business_income' AND "description" IS NULL;
--> statement-breakpoint
UPDATE "code_items" SET "description" = '해외 거래처 인보이스 · 부가세 없음' WHERE "table_key" = 'evidence_type' AND "value" = 'overseas_invoice' AND "description" IS NULL;
