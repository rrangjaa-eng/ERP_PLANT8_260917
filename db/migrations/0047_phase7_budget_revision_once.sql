-- F52(07-24 후속 · 사용자 결정 10/24 「한 번만 쌓기」) — 같은 견적 판(quote_revisions 행)은 승인 → 취소 → 재승인을 몇 번 해도 예산에
-- 한 번만 반영된다. project_budget_entries에 그 줄이 어느 판에서 왔는지(quote_revision_id, NULL 허용 · 기본값 없음 — 표를 다시 쓰지 않는다)를
-- 두고, 새 승인 차수 줄만 (project_id, quote_revision_id) 부분 유일 인덱스로 DB가 두 번째 줄을 막는다(도메인 domain/projects/budget.ts가 먼저
-- 건너뛴다). 다른 사유 줄(initial · po_amount_change · manual)은 NULL이다.
-- 기존 줄 백필 없음: 옛 new_approved_revision 줄은 어느 판에서 왔는지 남기지 않았고 base_amount_krw로 거꾸로 짚으면 같은 합계의 다른 판과
-- 갈리지 않는다 — 틀린 판을 채우면 그 판의 정당한 첫 승인이 막힌다. 옛 줄은 NULL로 두어 인덱스 밖에 둔다(이미 두 번 쌓인 줄이 있어도
-- 인덱스 생성이 실패하지 않는다 — 고치는 것은 경영관리 직접 수정 D-729 몫). 대상은 스테이징 시험 데이터뿐(운영 전환 전 · Phase 8 이관).
-- 새 FK는 검증을 미뤄 걸고 검증은 *_phase7_budget_revision_once_validate.sql(0044 · 0045 선례 — squawk constraint-missing-not-valid).
-- 유일 인덱스는 CONCURRENTLY 없이 만든다(drizzle migrate()가 트랜잭션으로 감싼다 — .squawk.toml) — 표가 작아 statement_timeout 안에 끝난다.
-- rollback-floor 없음: 더하기만, 옛 리비전은 새 칸을 읽지 않고 넣기는 NULL을 받는다(NULL 줄은 인덱스 밖).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "project_budget_entries" ADD COLUMN "quote_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "project_budget_entries" ADD CONSTRAINT "project_budget_entries_quote_revision_id_quote_revisions_id_fk" FOREIGN KEY ("quote_revision_id") REFERENCES "public"."quote_revisions"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_entries_approved_revision_key" ON "project_budget_entries" USING btree ("project_id","quote_revision_id") WHERE "project_budget_entries"."quote_revision_id" IS NOT NULL AND "project_budget_entries"."reason" = 'new_approved_revision';
