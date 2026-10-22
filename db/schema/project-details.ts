import { sql } from "drizzle-orm";
import { pgTable, text, bigint, numeric, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

// 07 S3(07-11) — 프로젝트 묶음 표 둘. 행 쓰기 · 판정은 화면 플랜(07-22 · 07-24)이 맡는다.

// W3: 프로젝트 서류 — 발주서(purchase_order) · 기타(other), 한 행사에 여러 장(260907 project_documents).
// 파일은 files.owner_kind = 'project_document', owner_id = 이 행 id.
export const projectDocuments = pgTable(
  "project_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    kind: text("kind").$type<"purchase_order" | "other">().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    removedAt: timestamp("removed_at"),
    removedBy: text("removed_by").references(() => users.id),
  },
  (table) => [
    index("project_documents_project_id_idx").on(table.projectId),
    check("project_documents_kind_check", sql`${table.kind} IN ('purchase_order','other')`),
  ],
);

// W4: 예산 이력 — 예산 = delta_krw 합. 예산 값을 프로젝트 표에 두지 않는다(화면 DTO가 읽는 표 — 「예산은 이 화면에 없다」).
// 사유: initial(처음) · po_amount_change(PO 금액 변경) · new_approved_revision(새 승인 차수) · manual(직접 수정 — D-729).
// 기준 금액 · 그때 원가율을 같이 저장한다(예산 결정). DB CHECK는 도메인(07-24)의 마지막 방어다:
// D-729 직접 수정은 비지 않은 메모가 있어야 하고 기준 금액 · 원가율을 비울 수 있다 · D-730 자동 줄은 증액(양수)만, 감액은 직접 수정(0 아님)으로만.
// 메모 길이 상한(500)은 도메인이 검사한다.
export const projectBudgetEntries = pgTable(
  "project_budget_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reason: text("reason").$type<"initial" | "po_amount_change" | "new_approved_revision" | "manual">().notNull(),
    baseAmountKrw: bigint("base_amount_krw", { mode: "number" }),
    costRatePct: numeric("cost_rate_pct", { precision: 4, scale: 1 }),
    deltaKrw: bigint("delta_krw", { mode: "number" }).notNull(),
    memo: text("memo"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("project_budget_entries_project_id_idx").on(table.projectId),
    check("project_budget_entries_reason_check", sql`${table.reason} IN ('initial','po_amount_change','new_approved_revision','manual')`),
    check("project_budget_entries_cost_rate_pct_check", sql`${table.costRatePct} IS NULL OR ${table.costRatePct} BETWEEN 0 AND 100`),
    check("project_budget_entries_manual_memo_check", sql`${table.reason} <> 'manual' OR (${table.memo} IS NOT NULL AND btrim(${table.memo}) <> '')`),
    check(
      "project_budget_entries_auto_base_check",
      sql`${table.reason} = 'manual' OR (${table.baseAmountKrw} IS NOT NULL AND ${table.costRatePct} IS NOT NULL)`,
    ),
    check("project_budget_entries_delta_check", sql`${table.deltaKrw} > 0 OR (${table.reason} = 'manual' AND ${table.deltaKrw} <> 0)`),
  ],
);
