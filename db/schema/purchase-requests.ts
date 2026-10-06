import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";
import { quoteLines } from "./quote-lines";
import { moneyColumns } from "./money-columns";

// 06-27(EXP-13): 구매 요청 — 견적 줄 요청(프로젝트 + 견적 줄)과 팀 비용 요청(둘 다 없음, 팀은 구매 완료 사용일의 요청자 소속 — O-19).
// 카드 사용 고리는 corp_card_usages.purchase_request_id가 가진다. 상태: requested(신청됨) · purchased(구매 완료) · cancelled(취소) —
// 되돌리기는 완료 · 취소 두 칸을 비우고 requested로. 링크는 http(s)만(T-06-37).
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    linkKind: text("link_kind").notNull(),
    projectId: uuid("project_id").references(() => projects.id),
    quoteLineId: uuid("quote_line_id").references(() => quoteLines.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    itemName: text("item_name").notNull(),
    linkUrl: text("link_url"),
    ...moneyColumns("estimate"),
    memo: text("memo"),
    status: text("status").notNull().default("requested"),
    completedBy: text("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at"),
    cancelledBy: text("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    version: integer("version").notNull().default(1),
    source: text("source").notNull().default("demo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_requests_number_uniq").on(table.number),
    check("purchase_requests_link_kind_check", sql`${table.linkKind} IN ('quote_line','team_cost')`),
    check(
      "purchase_requests_link_check",
      sql`(${table.linkKind} = 'quote_line' AND ${table.projectId} IS NOT NULL AND ${table.quoteLineId} IS NOT NULL) OR (${table.linkKind} = 'team_cost' AND ${table.projectId} IS NULL AND ${table.quoteLineId} IS NULL)`,
    ),
    check("purchase_requests_estimate_amount_krw_check", sql`${table.estimateAmountKrw} >= 0`),
    check("purchase_requests_link_url_check", sql`${table.linkUrl} IS NULL OR ${table.linkUrl} ~* '^https?://'`),
    check("purchase_requests_status_check", sql`${table.status} IN ('requested','purchased','cancelled')`),
    check(
      "purchase_requests_completed_check",
      sql`(${table.status} = 'purchased') = (${table.completedAt} IS NOT NULL AND ${table.completedBy} IS NOT NULL)`,
    ),
    check(
      "purchase_requests_cancelled_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
    index("purchase_requests_status_created_idx").on(table.status, table.createdAt),
    index("purchase_requests_quote_line_idx").on(table.quoteLineId),
  ],
);
