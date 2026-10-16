-- 06-37(G-06-A · 사용자 카드 20:42) — 법인카드 유일을 보관 안 된 행만으로. ARCHITECTURE §5 「확장 전용(DROP 없음)」의
-- 예외 한 건 — docs/design/DECISIONS.md 06-37 기록 참조. 같은 이름의 부분 유일 색인이라 등록 오류 변환 · 옛 리비전이
-- 그대로 돈다. 지금 제약이 모든 행의 중복을 막고 있어 색인 생성은 실패하지 않는다(가드 없음). ON CONFLICT 사용처가 없어
-- 롤백 하한을 두지 않는다. 0015 · 0021 선례와 같은 잠금 시간 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "corp_cards" DROP CONSTRAINT "corp_cards_issuer_last4_key";--> statement-breakpoint
CREATE UNIQUE INDEX "corp_cards_issuer_last4_key" ON "corp_cards" USING btree ("issuer","number_last4") WHERE "corp_cards"."archived_at" IS NULL;