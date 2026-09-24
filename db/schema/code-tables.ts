import { pgTable, text, boolean, integer, jsonb, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";

// MAST-04: 코드표 항목. table_key로 여러 코드표를 한 표에 담는다(예: project_status).
// active는 "숨김/비활성"(되돌리기 쉬운 상태 플래그, 목록·자동완성에서 서버가 제외)이고
// archivedAt/archivedBy는 "보관함"(ADMN-12, 삭제→복원) — 서로 다른 메커니즘이다.
//
// 03-06: customFields의 GIN 인덱스를 여기서 채운다(field_definitions 규약이
// 이제 정해졌다). taxRule은 증빙 종류(evidence_type) 항목에만 값을 두는
// jsonb 컬럼 — domain/code-tables/tax-rule.ts의 taxRuleSchema가 정본이다.
// 커스텀 필드 가방(customFields)에 넣지 않는 이유: 커스텀 필드는 관리자가
// 화면에서 정의·삭제하는 확장 필드(관리 화면은 Phase 10)이고, 세금 규칙은
// Phase 4의 계산이 읽는 코드 정의 계약이다 — 관리자가 필드 정의를 지워
// 세금 계산이 멈추는 경로를 만들지 않는다.
export const codeItems = pgTable(
  "code_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableKey: text("table_key").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    // 04-10(D-93): 코드표 값 한 문장 설명. NULL 허용, 기본값 없음 — 40자
    // 상한은 DB CHECK가 아니라 서버 검증(domain/code-tables의
    // CODE_ITEM_DESCRIPTION_MAX)이다. 설정 `hint`와 같은 결(RESEARCH §8).
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    customFields: jsonb("custom_fields").notNull().default({}),
    taxRule: jsonb("tax_rule"),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("code_items_table_value_key").on(table.tableKey, table.value),
    index("code_items_table_sort_idx").on(table.tableKey, table.sortOrder, table.value),
    index("code_items_custom_fields_idx").using("gin", table.customFields),
  ],
);
