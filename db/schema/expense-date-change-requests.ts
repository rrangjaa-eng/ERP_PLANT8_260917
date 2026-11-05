import { sql } from "drizzle-orm";
import { pgTable, text, date, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { expenses } from "./expenses";

// 07.2 X4(D-7290~D-7295): 대표 승인까지 끝난 지출결의의 지급 희망일 변경 요청. 요청일 뿐이고 경영관리가 승인해야 지급 예정일에
// 반영된다(D-7292 — 결재는 다시 돌지 않는다). 문서 칸 하나로 덮지 않고 요청마다 한 행이라 이력이 남는다(D-7291 — 260907은 문서
// 칸이라 이력이 없었다). 대기 요청은 문서당 하나(부분 유일), 기안자는 철회할 수 있다 — 승인 · 거절 · 철회 모두 처리 시각 · 처리자를
// 채우고 거절은 거절 메모가 필수다. 쓰는 길은 07.2-18.
export const expenseDateChangeRequests = pgTable(
  "expense_date_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    newDate: date("new_date").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at"),
    rejectMemo: text("reject_memo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("expense_date_change_requests_expense_idx").on(table.expenseId),
    uniqueIndex("expense_date_change_requests_pending_uniq").on(table.expenseId).where(sql`${table.status} = 'pending'`),
    check("expense_date_change_requests_status_check", sql`${table.status} IN ('pending','approved','rejected','withdrawn')`),
    check("expense_date_change_requests_reason_length_check", sql`char_length(${table.reason}) BETWEEN 1 AND 500`),
    check(
      "expense_date_change_requests_decided_check",
      sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL) AND (${table.decidedAt} IS NULL) = (${table.decidedBy} IS NULL)`,
    ),
    check("expense_date_change_requests_reject_memo_check", sql`(${table.status} = 'rejected') = (${table.rejectMemo} IS NOT NULL)`),
    check("expense_date_change_requests_reject_memo_length_check", sql`${table.rejectMemo} IS NULL OR char_length(${table.rejectMemo}) BETWEEN 1 AND 500`),
  ],
);
