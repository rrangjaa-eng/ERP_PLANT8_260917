import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, date, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { corpCards } from "./corp-cards";
import { vendors } from "./vendors";
import { quoteLines } from "./quote-lines";
import { teams } from "./org";
import { purchaseRequests } from "./purchase-requests";
import { moneyColumns } from "./money-columns";

// 06-27(EXP-07 · EXP-16): 법인카드 사용 — 결제 합계 Money 묶음(D-607)과 서버가 역산한 공급가 · 부가세(합 = 원화 합계, E-43).
// 연결은 견적 줄(견적 외 비용도 out_of_quote 견적 줄) 또는 팀 비용 중 정확히 하나(D-609). 등록 경로는 본인 · 대리 · 구매 완료(K-2)이고,
// 구매 완료 경로만 구매 요청을 가리킨다(한 요청에 사용 하나). 증빙 종류는 코드표 값(FK 없음 — expenses.evidence_type 관례).
export const corpCardUsages = pgTable(
  "corp_card_usages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    corpCardId: uuid("corp_card_id")
      .notNull()
      .references(() => corpCards.id),
    usedOn: date("used_on").notNull(),
    merchantVendorId: uuid("merchant_vendor_id").references(() => vendors.id),
    ...moneyColumns("total"),
    supplyKrw: bigint("supply_krw", { mode: "number" }).notNull(),
    vatKrw: bigint("vat_krw", { mode: "number" }).notNull(),
    evidenceTypeCode: text("evidence_type_code").notNull(),
    linkKind: text("link_kind").notNull(),
    quoteLineId: uuid("quote_line_id").references(() => quoteLines.id),
    teamId: uuid("team_id").references(() => teams.id),
    usedByUserId: text("used_by_user_id")
      .notNull()
      .references(() => users.id),
    registeredBy: text("registered_by")
      .notNull()
      .references(() => users.id),
    registeredVia: text("registered_via").notNull(),
    purchaseRequestId: uuid("purchase_request_id").references(() => purchaseRequests.id),
    memo: text("memo"),
    version: integer("version").notNull().default(1),
    source: text("source").notNull().default("demo"),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("corp_card_usages_amount_sum_check", sql`${table.supplyKrw} + ${table.vatKrw} = ${table.totalAmountKrw}`),
    check("corp_card_usages_link_kind_check", sql`${table.linkKind} IN ('quote_line','team_cost')`),
    check(
      "corp_card_usages_link_check",
      sql`(${table.linkKind} = 'quote_line' AND ${table.quoteLineId} IS NOT NULL AND ${table.teamId} IS NULL) OR (${table.linkKind} = 'team_cost' AND ${table.teamId} IS NOT NULL AND ${table.quoteLineId} IS NULL)`,
    ),
    check("corp_card_usages_registered_via_check", sql`${table.registeredVia} IN ('self','proxy','purchase')`),
    check("corp_card_usages_purchase_link_check", sql`(${table.registeredVia} = 'purchase') = (${table.purchaseRequestId} IS NOT NULL)`),
    uniqueIndex("corp_card_usages_purchase_request_uniq").on(table.purchaseRequestId),
    index("corp_card_usages_card_used_on_idx").on(table.corpCardId, table.usedOn),
    index("corp_card_usages_quote_line_idx").on(table.quoteLineId),
    index("corp_card_usages_registered_by_created_idx").on(table.registeredBy, table.createdAt),
  ],
);
