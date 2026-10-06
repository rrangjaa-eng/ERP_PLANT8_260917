-- 06-27 — *_phase6_tables.sql이 NOT VALID로 건 기존 표 제약 여섯(expenses 넷 · files · corp_cards)을 별도 트랜잭션에서 검증한다 —
-- SHARE UPDATE EXCLUSIVE 잠금뿐이라 검증 중 읽기가 막히지 않는다(0004 선례). 어긋난 기존 행이 있으면 여기서 실패하고 migrate()
-- 트랜잭션이 통째로 되돌아간다(부분 적용 없음 — T-06-278).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_closed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_prepaid_reason_check";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_evidence_amount_check";
--> statement-breakpoint
ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_closed_check";
--> statement-breakpoint
ALTER TABLE "files" VALIDATE CONSTRAINT "files_owner_kind_check";
--> statement-breakpoint
ALTER TABLE "corp_cards" VALIDATE CONSTRAINT "corp_cards_owner_kind_check";
