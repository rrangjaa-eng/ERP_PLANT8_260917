import { pgTable, text, boolean, integer, jsonb, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";

// MAST-04: 코드표 항목. table_key로 여러 코드표를 한 표에 담는다(예: project_status).
// active는 "숨김/비활성"(되돌리기 쉬운 상태 플래그, 목록·자동완성에서 서버가 제외)이고
// archivedAt/archivedBy는 "보관함"(ADMN-12, 삭제→복원) — 서로 다른 메커니즘이다.
//
// customFields의 GIN 인덱스는 지금 만들지 않는다(db/schema/roles.ts 주석과 같은 이유
// — 03-06이 field_definitions 규약과 함께 채운다).
export const codeItems = pgTable(
  "code_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableKey: text("table_key").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("code_items_table_value_key").on(table.tableKey, table.value),
    index("code_items_table_sort_idx").on(table.tableKey, table.sortOrder, table.value),
  ],
);
