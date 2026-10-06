import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, date, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { expenses } from "./expenses";

// 06-27(EXP-06 · EXP-10): 지급 기록 — 지출결의 한 건에 살아 있는 지급은 하나(취소 행은 남는다, D-606).
// 처리 때의 지급 총액 · 지급 방식을 복사해 두고, 실제 이체액과의 차이에는 사유가 있어야 한다(D-605).
export const expensePayments = pgTable(
  "expense_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    payDate: date("pay_date").notNull(),
    transferKrw: bigint("transfer_krw", { mode: "number" }).notNull(),
    payableKrw: bigint("payable_krw", { mode: "number" }).notNull(),
    diffKrw: bigint("diff_krw", { mode: "number" }).notNull(),
    diffReason: text("diff_reason"),
    grossSupplyKrw: bigint("gross_supply_krw", { mode: "number" }),
    paymentMethod: text("payment_method").notNull(),
    processedBy: text("processed_by")
      .notNull()
      .references(() => users.id),
    processedAt: timestamp("processed_at").notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: text("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    version: integer("version").notNull().default(1),
    source: text("source").notNull().default("demo"),
  },
  (table) => [
    uniqueIndex("expense_payments_live_uniq")
      .on(table.expenseId)
      .where(sql`${table.cancelledAt} IS NULL`),
    index("expense_payments_expense_idx").on(table.expenseId),
    check(
      "expense_payments_diff_reason_check",
      sql`${table.diffKrw} = 0 OR (${table.diffReason} IS NOT NULL AND char_length(btrim(${table.diffReason})) > 0)`,
    ),
    check(
      "expense_payments_cancel_check",
      sql`(${table.cancelledAt} IS NULL AND ${table.cancelledBy} IS NULL AND ${table.cancelReason} IS NULL) OR (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL AND ${table.cancelReason} IS NOT NULL AND char_length(btrim(${table.cancelReason})) > 0)`,
    ),
  ],
);
