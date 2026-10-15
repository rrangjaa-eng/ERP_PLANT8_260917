-- rollback-floor: 06.5-10 증빙 금액 칸 삭제 — 06.5-10 이전 리비전은 없는 칸을 select한다(D-6520)
-- Phase 06.5(06.5-10) — expenses.evidence_amount 칸과 그 CHECK를 지운다. 사용자 카드 D-6520(10/13 23:44 KST):
-- 금액은 공급가액 하나 — 증빙 금액이 따로 있으면 지급 · 원가 · 확인이 두 금액 사이에서 갈린다. ARCHITECTURE §5
-- 「확장 전용(DROP 없음)」의 두 번째 예외(첫째 0015 · 04-41) — docs/design/DECISIONS.md 06.5-10 기록 참조.
-- 값은 옮기지 않는다 — 확인 기록 금액 전 · 후와 행동 기록 detail에 남아 있다.
-- 가드 있음 — 사용자 결정 체크포인트 a(10/15 「가드 둠」 · 제출된 문서만 · 스테이징 · 운영 수는 사용자가 따로 세지
-- 않았다 — 배포 때 아래 가드가 센다). 0015 선례와 같은 락 타임아웃 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
-- 지급 전(살아 있는 지급 없음) · 삭제 안 됨 · 종결 안 됨인 제출 문서(번호 있음)의 증빙 금액이 공급가와 다르면 지우지 않고
-- 멈춘다 — 경영관리가 공급가액을 맞출 근거가 조용히 사라지지 않게(T-06.5-87). 작성 중 문서는 지급에 쓰이지 않아 세지 않는다.
-- 이번에 적용할 마이그레이션 전부가 한 트랜잭션이라 멈추면 그 DB는 한 칸도 바뀌지 않는다(0015 선례).
DO $$
DECLARE
  mismatched_count integer;
BEGIN
  SELECT count(*) INTO mismatched_count
    FROM "expenses" e
    WHERE e."deleted_at" IS NULL
      AND e."closed_at" IS NULL
      AND e."number" IS NOT NULL
      AND e."evidence_amount" IS NOT NULL
      AND e."evidence_amount" IS DISTINCT FROM e."supply_amount_krw"
      AND NOT EXISTS (
        SELECT 1 FROM "expense_payments" p WHERE p."expense_id" = e."id" AND p."cancelled_at" IS NULL
      );
  IF mismatched_count > 0 THEN
    RAISE EXCEPTION '지급 전 지출결의 %건의 증빙 금액이 공급가액과 다릅니다 — 경영관리가 증빙 확인에서 공급가액을 고치거나 가드 없이 지우기로 정한 뒤 다시 배포합니다 (06.5-10 · D-6520)', mismatched_count;
  END IF;
END $$;
--> statement-breakpoint
-- 06.5 D-6520 사용자 카드 10/13 23:44 KST: 금액은 공급가액 하나 — DECISIONS 06.5-10
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_evidence_amount_check";--> statement-breakpoint
-- 06.5 D-6520 사용자 카드 10/13 23:44 KST: 금액은 공급가액 하나 — DECISIONS 06.5-10
-- squawk-ignore ban-drop-column
ALTER TABLE "expenses" DROP COLUMN "evidence_amount";
