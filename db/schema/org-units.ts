import { pgTable, text, integer, jsonb, timestamp, uuid, index } from "drizzle-orm/pg-core";

// 07.1-07: 본부 표만 org.ts에서 떼어 둔 파일 — auth.ts(users.division_id 외래키)가 본부를 참조하는데 org.ts는 auth.ts를 import하므로
// org.ts에 두면 런타임 순환 import가 된다(test/unit/import-cycles.test.ts). 이 파일은 다른 스키마를 import하지 않는다. org.ts가 그대로 다시 내보낸다.
export const orgUnits = pgTable(
  "org_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // 03-06이 GIN 인덱스를 뒤늦게 채운다(field_definitions 규약이 이제 정해졌다).
  (table) => [index("org_units_custom_fields_idx").using("gin", table.customFields)],
);
