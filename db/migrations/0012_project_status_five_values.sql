-- rollback-floor: 0012 상태 재매핑 — 옛 리비전은 다섯 값 DB에서 완료를 잠그지 못한다(04-50 · E2-04)
-- Phase 4(04-06, D-75) — 프로젝트 상태를 수주중·진행·정산·완료·미수주 다섯
-- 값으로 바꾼다. 옛 잠금 값 settled 행은 completed로 옮기고(UPDATE, 지우지
-- 않는다), 코드표는 settled를 지우고 settling·completed를 더한다. 전진 전용 —
-- 되돌리는 마이그레이션은 없다(손실 있는 역 SQL은 04-06-SUMMARY.md).
-- 0003·0004·0009·0010·0011 선례와 같은 락 타임아웃 한 쌍을 첫 락 요구 문장 앞에 둔다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
-- 전제(코드표와 프로젝트 행의 상태가 D-41 네 값 안이다)를 적용 시점에 대상 DB에서
-- 직접 측정한다. 0009의 「projects 표가 비어 있다」 전제는 쓰지 않는다 — 행이
-- 있어도 옮긴다. 네 값 밖의 값은 이미 다섯 값으로 옮겨졌거나 사람이 손으로 더한
-- 값일 수 있어 지우지 않고 RAISE EXCEPTION으로 마이그레이션 전체를 되돌린다.
DO $$
DECLARE
  stray_code_count integer;
  stray_project_count integer;
BEGIN
  SELECT count(*) INTO stray_code_count
    FROM "code_items"
    WHERE "table_key" = 'project_status'
      AND "value" NOT IN ('bidding', 'in_progress', 'settled', 'lost');
  IF stray_code_count > 0 THEN
    RAISE EXCEPTION 'project_status 코드표에 네 값(bidding·in_progress·settled·lost) 밖의 항목이 %건 있습니다 — 지우지 않고 마이그레이션을 중단합니다.', stray_code_count;
  END IF;

  SELECT count(*) INTO stray_project_count
    FROM "projects"
    WHERE "status" NOT IN ('bidding', 'in_progress', 'settled', 'lost');
  IF stray_project_count > 0 THEN
    RAISE EXCEPTION 'projects.status에 네 값(bidding·in_progress·settled·lost) 밖의 값이 %건 있습니다 — 지우지 않고 마이그레이션을 중단합니다.', stray_project_count;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "projects" SET "status" = 'completed', "version" = "version" + 1, "updated_at" = now() WHERE "status" = 'settled';
--> statement-breakpoint
DELETE FROM "code_items" WHERE "table_key" = 'project_status' AND "value" = 'settled';
--> statement-breakpoint
UPDATE "code_items" SET "sort_order" = 4, "updated_at" = now() WHERE "table_key" = 'project_status' AND "value" = 'lost';
--> statement-breakpoint
-- 라벨·정렬·설명은 domain/seed/index.ts의 PROJECT_STATUS_CODES와 글자 그대로 같다.
INSERT INTO "code_items" ("table_key", "value", "label", "sort_order", "description") VALUES
  ('project_status', 'settling', '정산', 2, '행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계'),
  ('project_status', 'completed', '완료', 3, '정산 마감 · 견적 줄이 잠기고 되돌리기 없음');
