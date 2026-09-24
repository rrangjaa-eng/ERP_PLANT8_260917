import { pgTable, text, integer, timestamp, uuid, unique, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

// PROJ-07·D-52~D-56: 상세 견적 차수 표 — 차수 순번·고객 승인 표시·승인일·
// 승인자. 사전 견적은 이 표에 행이 없다(프로젝트 속성, D-52) — 차수는
// 상세 견적 1차부터다. 프로젝트를 등록하면 1차가 함께 생긴다(D-53, 빈
// 차수 금지). 견적 번호(`26001-1차`)는 저장 컬럼이 아니라 표시용 파생값.
export const quoteRevisions = pgTable(
  "quote_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    seq: integer("seq").notNull(),
    customerApprovedAt: timestamp("customer_approved_at"),
    customerApprovedBy: text("customer_approved_by").references(() => users.id),
    source: text("source").notNull().default("demo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("quote_revisions_project_seq_key").on(table.projectId, table.seq),
    index("quote_revisions_project_id_idx").on(table.projectId),
  ],
);
