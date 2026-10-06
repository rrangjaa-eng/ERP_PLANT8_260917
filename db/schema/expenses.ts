import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, numeric, boolean, date, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";
import { quoteLines } from "./quote-lines";
import { teams } from "./org";
import { vendors } from "./vendors";

// 05-03(EXP-01 · EXP-14): 지출결의 — 견적 줄 문서와 팀 비용 문서(05-07)가 한 표다. 결재 상태는 이 표가 아니라
// approval_instances(document_kind = "expense")에 있다 — 인스턴스가 없으면 작성 중. 번호는 제출 때 부여된다.
// 공급가액 네 열은 money-columns.ts와 같은 이름 · 타입이지만 원화만 null 허용이다 — 작성 중 빈 칸을 0과 가른다.
// 세율 스냅숏(tax_rate_setting_id · tax_rate_effective_from)은 이력 행의 값 복사다 — 외래 키를 두면 예정 세율 취소
// (미래 행 물리 삭제)가 제출 문서 때문에 영구히 막힌다(사용자 결정 E1: A).
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drafterId: text("drafter_id")
      .notNull()
      .references(() => users.id),
    number: text("number").unique(),
    projectId: uuid("project_id").references(() => projects.id),
    quoteLineId: uuid("quote_line_id").references(() => quoteLines.id),
    teamExpenseKind: text("team_expense_kind"),
    usageDate: date("usage_date"),
    content: text("content"),
    attributedTeamId: uuid("attributed_team_id").references(() => teams.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    // 코드표 값 문자열 — vendors.default_evidence_type과 같은 관례(FK 없음).
    evidenceType: text("evidence_type"),
    paymentMethod: text("payment_method"),
    supplyCurrency: text("supply_currency").notNull().default("KRW"),
    supplyForeignAmount: numeric("supply_foreign_amount", { precision: 14, scale: 2 }),
    supplyFxRate: numeric("supply_fx_rate", { precision: 12, scale: 4 }).notNull().default("1.0000"),
    supplyAmountKrw: bigint("supply_amount_krw", { mode: "number" }),
    installment: boolean("installment").notNull().default(false),
    installmentSeq: integer("installment_seq"),
    scheduledPaymentDate: date("scheduled_payment_date"),
    note: text("note"),
    taxRuleKind: text("tax_rule_kind"),
    taxRate: numeric("tax_rate", { precision: 7, scale: 6 }),
    taxRateSettingId: uuid("tax_rate_setting_id"),
    taxRateEffectiveFrom: date("tax_rate_effective_from"),
    taxCompanyBorneMethod: text("tax_company_borne_method"),
    taxBasisDate: date("tax_basis_date"),
    vatKrw: bigint("vat_krw", { mode: "number" }),
    withholdingKrw: bigint("withholding_krw", { mode: "number" }),
    companyBorneKrw: bigint("company_borne_krw", { mode: "number" }),
    payableKrw: bigint("payable_krw", { mode: "number" }),
    idempotencyKey: text("idempotency_key").unique(),
    submittedAt: timestamp("submitted_at"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by"),
    // 06-27: 선결제(06-10) · 증빙 공급가액 · 증빙일(C6 — EVID-03, 06-06) · 종결(C10 — 제출된 반려 · 회수 문서만, 06-28).
    prepaid: boolean("prepaid").notNull().default(false),
    prepaidReason: text("prepaid_reason"),
    evidenceAmount: bigint("evidence_amount", { mode: "number" }),
    evidenceDate: date("evidence_date"),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => users.id),
    closedReason: text("closed_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // 같은 줄에서 두 번 눌러도 작성 중 문서 하나 — DB가 최종 판정한다(UI Assumptions #1).
    uniqueIndex("expenses_line_drafter_draft_uniq")
      .on(table.quoteLineId, table.drafterId)
      .where(sql`${table.number} is null and ${table.deletedAt} is null`),
    index("expenses_project_idx").on(table.projectId),
    index("expenses_quote_line_idx").on(table.quoteLineId),
    index("expenses_drafter_idx").on(table.drafterId),
    index("expenses_attributed_team_idx").on(table.attributedTeamId),
    check("expenses_team_expense_kind_check", sql`${table.teamExpenseKind} IS NULL OR ${table.teamExpenseKind} IN ('lost_bid','team_overhead')`),
    check("expenses_supply_amount_krw_check", sql`${table.supplyAmountKrw} IS NULL OR ${table.supplyAmountKrw} >= 0`),
    check("expenses_supply_foreign_amount_check", sql`${table.supplyForeignAmount} IS NULL OR ${table.supplyForeignAmount} >= 0`),
    // EXP-14 — 번호 있는(제출된) 문서는 공급가액이 0보다 크다. 원화가 null이면 비교가 참이 되지 않으므로 함께 막는다.
    check("expenses_submitted_amount_check", sql`${table.number} IS NULL OR (${table.supplyAmountKrw} IS NOT NULL AND ${table.supplyAmountKrw} > 0)`),
    check("expenses_line_or_team_check", sql`NOT (${table.quoteLineId} IS NOT NULL AND ${table.teamExpenseKind} IS NOT NULL)`),
    check("expenses_installment_seq_check", sql`${table.installmentSeq} IS NULL OR ${table.installmentSeq} >= 1`),
    check("expenses_tax_rule_kind_check", sql`${table.taxRuleKind} IS NULL OR ${table.taxRuleKind} IN ('none','vat_surcharge','withholding','company_borne')`),
    check(
      "expenses_prepaid_reason_check",
      sql`${table.prepaid} = false OR (${table.prepaidReason} IS NOT NULL AND char_length(btrim(${table.prepaidReason})) > 0)`,
    ),
    check("expenses_evidence_amount_check", sql`${table.evidenceAmount} IS NULL OR ${table.evidenceAmount} >= 0`),
    check(
      "expenses_closed_check",
      sql`(${table.closedAt} IS NULL AND ${table.closedBy} IS NULL AND ${table.closedReason} IS NULL) OR (${table.closedAt} IS NOT NULL AND ${table.closedBy} IS NOT NULL AND ${table.closedReason} IS NOT NULL AND char_length(btrim(${table.closedReason})) > 0 AND ${table.number} IS NOT NULL)`,
    ),
  ],
);
