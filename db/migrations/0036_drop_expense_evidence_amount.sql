-- rollback-floor: 06.5-10 증빙 금액 칸 삭제 — 06.5-10 이전 리비전은 없는 칸을 select한다(D-6520)
-- Phase 06.5(06.5-10) — expenses.evidence_amount 칸과 그 CHECK를 지운다. 사용자 카드 D-6520(10/13 23:44 KST):
-- 금액은 공급가액 하나 — 증빙 금액이 따로 있으면 지급 · 원가 · 확인이 두 금액 사이에서 갈린다. ARCHITECTURE §5
-- 「확장 전용(DROP 없음)」의 두 번째 예외(첫째 0015 · 04-41) — docs/design/DECISIONS.md 06.5-10 기록 참조.
-- 값은 옮기지 않는다 — 확인 기록 금액 전 · 후와 행동 기록 detail에 남아 있다.
-- 가드는 결정 체크포인트 뒤 Task 2가 더한다. 0015 선례와 같은 락 타임아웃 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
-- 06.5 D-6520 사용자 카드 10/13 23:44 KST: 금액은 공급가액 하나 — DECISIONS 06.5-10
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_evidence_amount_check";--> statement-breakpoint
-- 06.5 D-6520 사용자 카드 10/13 23:44 KST: 금액은 공급가액 하나 — DECISIONS 06.5-10
-- squawk-ignore ban-drop-column
ALTER TABLE "expenses" DROP COLUMN "evidence_amount";
