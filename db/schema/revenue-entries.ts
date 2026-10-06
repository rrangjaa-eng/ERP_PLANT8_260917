import { sql } from "drizzle-orm";
import { pgTable, text, integer, jsonb, timestamp, uuid, date, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
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

// 06-27(PROJ-06): 세금계산서 발행 요청 — PM이 희망 발행일 · 공급가를 요청하고, 발행되면 발행 줄 하나에 잇는다(한 발행 줄에 요청 하나).
// 상태: requested(신청됨) · issued(발행됨) · cancelled(취소). 금액 음수 제약은 두지 않는다(위 revenue_entries 관례 — 조정 · 할인).
export const revenueIssueRequests = pgTable(
  "revenue_issue_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    desiredIssueDate: date("desired_issue_date").notNull(),
    ...moneyColumns("amount"),
    memo: text("memo"),
    status: text("status").notNull().default("requested"),
    issuedEntryId: uuid("issued_entry_id").references(() => revenueEntries.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    cancelledBy: text("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at"),
    version: integer("version").notNull().default(1),
    source: text("source").notNull().default("demo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("revenue_issue_requests_status_check", sql`${table.status} IN ('requested','issued','cancelled')`),
    check("revenue_issue_requests_issued_check", sql`(${table.status} = 'issued') = (${table.issuedEntryId} IS NOT NULL)`),
    check(
      "revenue_issue_requests_cancelled_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
    uniqueIndex("revenue_issue_requests_issued_entry_uniq").on(table.issuedEntryId),
    index("revenue_issue_requests_project_status_idx").on(table.projectId, table.status),
  ],
);
