import { pgTable, text, boolean, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

// ROADMAP 트레일링 스키마 규약 — 커스텀 필드 정의 표. 마스터 표
// (roles·code_items·org_units·teams·corp_cards·vendors)의 custom_fields
// JSONB 컬럼이 어떤 키·타입을 담을 수 있는지 이 표가 정의하고,
// domain/custom-fields/build-schema.ts가 이 정의로 zod 스키마를 조립해
// 저장 전 검증한다. entity + key 복합 unique — 같은 표에 같은 키를 두 번
// 정의할 수 없다.
//
// 필드 타입 변경은 금지한다(ROADMAP) — 타입을 바꾸려면 새 필드를 만든다.
// 이 제약은 리포지토리 수준에서 강제한다: 갱신 함수가 type 컬럼을 대상으로
// 받지 않는다(repositories/field-definitions.ts).
export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    key: text("key").notNull(),
    // "text" | "number" | "date" | "select" — domain/custom-fields/build-schema.ts의 FieldDefType.
    type: text("type").notNull(),
    options: jsonb("options"),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("field_definitions_entity_key_key").on(table.entity, table.key)],
);
