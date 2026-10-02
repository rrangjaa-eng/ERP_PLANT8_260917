-- 04.5-01 화면 항목 관리 — field_definitions에 화면 이름(label) · 보관 칸 두 개 · 보관 선택지 · version을 더하고
-- (entity, label) 유일 제약을 건다. label은 기존 행을 key로 채운 뒤 기본값을 떼고, 유일 제약은 그 채움 뒤에 건다
-- ((entity, key)가 이미 유일이라 채움 뒤 충돌 없음 — RESEARCH Pitfall 1). 유일 제약은 squawk(disallowed-unique-constraint)가
-- 받는 모양으로 — 유일 인덱스를 만든 뒤 그 인덱스로 제약을 건다(drizzle 생성문 UNIQUE("entity","label")과 같은 결과).
-- 0021·0022 선례와 같은 락 타임아웃 한 쌍.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "field_definitions" SET "label" = "key";--> statement-breakpoint
ALTER TABLE "field_definitions" ALTER COLUMN "label" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "archived_options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "field_definitions_entity_label_key" ON "field_definitions" USING btree ("entity","label");--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_entity_label_key" UNIQUE USING INDEX "field_definitions_entity_label_key";
