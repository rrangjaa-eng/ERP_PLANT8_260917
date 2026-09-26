-- Phase 4(04-13, D-48·D-83) — 견적 줄 종류(quote · out_of_quote · adjustment). 기본값이 있는 컬럼 추가뿐인
-- 확장 전용이라 기존 줄은 전부 quote가 된다. 세 값 CHECK는 컬럼 정의 안에 인라인으로 둔다 — 따로 내는
-- ADD CONSTRAINT … CHECK와 NOT VALID + VALIDATE 쌍은 squawk가 거부한다(B-22, 0013 선례).
-- 0003·0004·0009~0013 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "line_kind" text DEFAULT 'quote' NOT NULL CONSTRAINT "quote_lines_line_kind_check" CHECK ("line_kind" IN ('quote','out_of_quote','adjustment'));
