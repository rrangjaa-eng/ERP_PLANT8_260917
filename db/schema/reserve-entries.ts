import { sql } from "drizzle-orm";
import { pgTable, text, integer, jsonb, timestamp, uuid, date, index, check } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";
import { projects } from "./projects";
import { moneyColumns } from "./money-columns";

// 04-07(D-60 · RSV-01): 클라이언트별 리저브 대장 줄. 잔액은 저장하지 않는다 — 서버가 그 클라이언트 원장 전체에서
// 계산한다(갱신 누락 비정규화 방지, Eng OV-4). 같은 날·같은 구분 안의 순서는 `created_at` → `id`이고 별도 순서
// 컬럼을 두지 않는다(엔지니어링 리뷰 B §2). 새 줄은 화면이 만든 uuid를 `id`로 싣는다(ENG-D10 — 재전송 멱등).
export const reserveEntries = pgTable(
  "reserve_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    entryDate: date("entry_date").notNull(),
    direction: text("direction").notNull(),
    ...moneyColumns("amount"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    // Phase 3 증빙 종류 코드표(evidence_type) 항목의 value — vendors.default_evidence_type과 같은 FK 없는 문자열.
    evidenceType: text("evidence_type"),
    taxInvoiceNumber: text("tax_invoice_number"),
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
    check("reserve_entries_direction_check", sql`${table.direction} in ('deposit', 'withdrawal')`),
    index("reserve_entries_client_date_idx").on(table.clientId, table.entryDate),
    index("reserve_entries_custom_fields_idx").using("gin", table.customFields),
  ],
);
