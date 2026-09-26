-- rollback-floor: 0015 계약 컬럼 삭제 — 묶음 ② 리비전은 없는 컬럼을 읽는다(04-50 · E2-04)
-- Phase 4(04-41) — 0010이 더한 projects.contract_* 네 칸을 지운다. 계약 금액은 고객 승인된 현재 차수
-- 합계에서 파생되는 값 하나다(D-84 · 사용자 D9 「지금 삭제 + 가드」). ARCHITECTURE §5 「확장 전용(DROP
-- 없음)」의 예외 한 건 — docs/design/DECISIONS.md 04-41 기록 참조. 0010 선례와 같은 락 타임아웃 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
-- 업무 데이터(source <> 'demo')에 계약 값(원화 ≠ 0 또는 외화 금액)이 있으면 지우지 않고 멈춘다(0009 가드 선례 ·
-- 엔지 r2 E2-05). 이번에 적용할 마이그레이션 전부가 한 트랜잭션이라 멈추면 그 DB는 한 칸도 바뀌지 않는다.
DO $$
DECLARE
  valued_count integer;
BEGIN
  SELECT count(*) INTO valued_count
    FROM "projects"
    WHERE "source" <> 'demo'
      AND ("contract_amount_krw" <> 0 OR "contract_foreign_amount" IS NOT NULL);
  IF valued_count > 0 THEN
    RAISE EXCEPTION '업무 데이터 %건에 계약 금액이 있습니다 — 파생 계약 금액(고객 승인된 현재 차수 합계)으로 옮길지 먼저 정해야 해 컬럼을 지우지 않고 마이그레이션을 중단합니다 (04-41, 사용자 D9)', valued_count;
  END IF;
END $$;
--> statement-breakpoint
-- 사용자 D9: 계약 금액은 파생값 하나(D-84) — 업무 값(원화·외화)은 위 가드가 막는다, 04-41 DECISIONS
-- squawk-ignore ban-drop-column
ALTER TABLE "projects" DROP COLUMN "contract_currency";--> statement-breakpoint
-- 사용자 D9: 계약 금액은 파생값 하나(D-84) — 업무 값(원화·외화)은 위 가드가 막는다, 04-41 DECISIONS
-- squawk-ignore ban-drop-column
ALTER TABLE "projects" DROP COLUMN "contract_foreign_amount";--> statement-breakpoint
-- 사용자 D9: 계약 금액은 파생값 하나(D-84) — 업무 값(원화·외화)은 위 가드가 막는다, 04-41 DECISIONS
-- squawk-ignore ban-drop-column
ALTER TABLE "projects" DROP COLUMN "contract_fx_rate";--> statement-breakpoint
-- 사용자 D9: 계약 금액은 파생값 하나(D-84) — 업무 값(원화·외화)은 위 가드가 막는다, 04-41 DECISIONS
-- squawk-ignore ban-drop-column
ALTER TABLE "projects" DROP COLUMN "contract_amount_krw";
