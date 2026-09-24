import { pgTable, text, integer, jsonb, timestamp, uuid, date, index } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { moneyColumns } from "./money-columns";

// 04-02(D-58): 매출 발행·입금 줄 표 — 종류(kind: issue|payment) + 날짜 +
// Money 묶음 하나 + 메모. 발행 줄의 amount는 공급가액 입력, 입금 줄의
// amount는 통장 합계(부가세 포함) 입력이다 — 두 종류가 같은 컬럼을 다른
// 의미로 쓴다(domain/revenue가 종류별로 해석한다). **금액 컬럼에 음수를
// 막는 제약을 걸지 않는다**(EXP-14 환불·할인). projectId는 onDelete
// "restrict"(연결 문서가 있는 프로젝트를 실수로 못 지운다).
export const revenueEntries = pgTable(
  "revenue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    entryDate: date("entry_date").notNull(),
    ...moneyColumns("amount"),
    note: text("note"),
    source: text("source").notNull().default("demo"),
    customFields: jsonb("custom_fields").notNull().default({}),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("revenue_entries_project_kind_date_idx").on(table.projectId, table.kind, table.entryDate),
    index("revenue_entries_custom_fields_idx").using("gin", table.customFields),
  ],
);
