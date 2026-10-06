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
    check("expense_payments_transfer_krw_check", sql`${table.transferKrw} >= 0`),
    check("expense_payments_payable_krw_check", sql`${table.payableKrw} >= 0`),
    check("expense_payments_gross_supply_krw_check", sql`${table.grossSupplyKrw} IS NULL OR ${table.grossSupplyKrw} >= 0`),
    check("expense_payments_diff_check", sql`${table.diffKrw} = ${table.transferKrw} - ${table.payableKrw}`),
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

// 06-27(EVID-02 · EVID-03): 증빙 확인 · 면제 — 문서당 한 줄(확인이 풀리면 행을 지운다, 06-11). 금액을 고쳐 확인하면
// 전후 금액 둘 다, 그냥 확인이면 둘 다 null(D-602). 면제에는 사유가 있어야 한다.
export const expenseEvidenceReviews = pgTable(
  "expense_evidence_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    status: text("status").notNull(),
    amountBeforeKrw: bigint("amount_before_krw", { mode: "number" }),
    amountAfterKrw: bigint("amount_after_krw", { mode: "number" }),
    waiveReason: text("waive_reason"),
    reviewedBy: text("reviewed_by")
      .notNull()
      .references(() => users.id),
    reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("expense_evidence_reviews_expense_uniq").on(table.expenseId),
    check("expense_evidence_reviews_status_check", sql`${table.status} IN ('confirmed','waived')`),
    check(
      "expense_evidence_reviews_waive_reason_check",
      sql`${table.status} <> 'waived' OR (${table.waiveReason} IS NOT NULL AND char_length(btrim(${table.waiveReason})) > 0)`,
    ),
    check("expense_evidence_reviews_amount_pair_check", sql`(${table.amountBeforeKrw} IS NULL) = (${table.amountAfterKrw} IS NULL)`),
  ],
);
