import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, numeric, jsonb, timestamp, uuid, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";
import { quoteRevisions } from "./quote-revisions";
import { moneyColumns } from "./money-columns";

// PROJ-02·D-62~D-67: 견적 줄 표 — 소분류·항목·거래처·수량·단가·견적가·
// 실행가·차익·상태·비고·순서·계보·version·Money 묶음·custom_fields·보관함
// 컬럼. 견적가·차익은 서버가 계산해 저장한다(D-63) — `domain/money` 밖에서
// 이 값을 만들지 않는다. `revisionId`는 `onDelete: "restrict"`(연결 문서가
// 있는 차수를 실수로 지우지 못하게).
export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => quoteRevisions.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    subcategory: text("subcategory").notNull(),
    itemName: text("item_name").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1.00"),
    ...moneyColumns("unitPrice"),
    ...moneyColumns("execution"),
    // D-63: 견적가 = 수량 × 단가, 서버 계산·저장. 차익 = 견적가 − 실행가.
    quoteAmountKrw: bigint("quote_amount_krw", { mode: "number" }).notNull(),
    profitKrw: bigint("profit_krw", { mode: "number" }).notNull(),
    // D-64: 이 페이즈는 미착수·취소 둘뿐.
    lineStatus: text("line_status").notNull().default("not_started"),
    // 04-13(D-48 · D-83): 줄 종류 — 견적 줄(quote) · 견적 외 비용(out_of_quote) · 조정(adjustment). 새 줄에서만
    // 정해지고 바뀌지 않는다. 그룹·권한·음수 허용·복사 제외가 이 컬럼 하나를 본다.
    lineKind: text("line_kind").notNull().default("quote"),
    note: text("note"),
    // D-53: 새 차수는 이전 차수 복사 — 복사 줄의 계보. 자기 참조라 지연
    // 콜백으로 순환을 피한다(Drizzle self-reference pattern).
    copiedFromLineId: uuid("copied_from_line_id").references((): AnyPgColumn => quoteLines.id),
    version: integer("version").notNull().default(1),
    // 06.5 D-6502: 지급 완료 규칙이 만든 「기타소득세 대납」 조정 줄이 어느 지출결의에서 왔는지. FK를 걸지 않는다 —
    // db/schema/expenses.ts가 이 파일을 import해 반대 방향 참조는 순환이고(test/unit/import-cycles.test.ts), 지출결의는
    // 지우지 않고 보관만 한다. `source_synced_version`은 규칙이 마지막으로 쓴 `version` — 사람이 고치면 `version`만 올라
    // 둘이 갈리고 규칙은 그 줄을 덮지 않는다(옛에 없던 새 규칙 — 옛은 덮어썼다, O: server/src/confirmations.ts:827-837).
    // 조정 줄은 새 차수로 복사가 아니라 옮겨지고 그때 두 칸이 같이 오른다(06.5-02 `moveAdjustmentLines`) — 살아 있는 줄은 문서당 하나다.
    sourceExpenseId: uuid("source_expense_id"),
    sourceSyncedVersion: integer("source_synced_version"),
    source: text("source").notNull().default("demo"),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("quote_lines_revision_sort_idx").on(table.revisionId, table.sortOrder),
    index("quote_lines_custom_fields_idx").using("gin", table.customFields),
    check("quote_lines_line_kind_check", sql`${table.lineKind} IN ('quote','out_of_quote','adjustment')`),
    check("quote_lines_source_expense_kind_check", sql`${table.sourceExpenseId} IS NULL OR ${table.lineKind} = 'adjustment'`),
    check("quote_lines_source_synced_pair_check", sql`(${table.sourceExpenseId} IS NULL) = (${table.sourceSyncedVersion} IS NULL)`),
    uniqueIndex("quote_lines_source_expense_live_uniq")
      .on(table.sourceExpenseId)
      .where(sql`${table.sourceExpenseId} IS NOT NULL AND ${table.archivedAt} IS NULL`),
  ],
);
