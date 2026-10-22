import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { vendors } from "./vendors";

// 07 S3(07-11) — 거래처 묶음 표 셋. 행 쓰기 · 판정은 화면 플랜(07-20 · 07-23)이 맡는다.

// V7: 거래처 담당자 — 여럿(260907 vendor_contacts 「담당자는 여럿이다」). 이름 필수 · 연락처 · 이메일 선택, 빼면 보관(archived_at).
// 최대 5명은 도메인(07-23)이 검사한다.
export const vendorContacts = pgTable(
  "vendor_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by").references(() => users.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("vendor_contacts_vendor_id_idx").on(table.vendorId)],
);

// V8: 거래처 서류 — 사업자등록증(registration) · 통장 사본(bankbook). 파일은 files.owner_kind = 'vendor_document', owner_id = 이 행 id.
// 교체형이라 새 서류를 올리면 도메인이 이전 행을 removed로 둔다.
export const vendorDocuments = pgTable(
  "vendor_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    kind: text("kind").$type<"registration" | "bankbook">().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    removedAt: timestamp("removed_at"),
    removedBy: text("removed_by").references(() => users.id),
  },
  (table) => [
    index("vendor_documents_vendor_id_idx").on(table.vendorId),
    check("vendor_documents_kind_check", sql`${table.kind} IN ('registration','bankbook')`),
  ],
);

// P9 · V4: 거래처 계좌 변경 기록 — 지급 목록 배지 · 계좌 바뀜 알림(NOTI-03)의 원천. action_log에서 파생하지 않는 전용 표다
// (document_update는 끌 수 있는 유형). 원값 없음 — 뒤 4자리만(R5 · V6). 계좌가 처음 생기면 before_last4, 지우면 after_last4가 NULL.
// 경로: admin(거래처 관리) · workplace(일하는 자리 등록) · evidence(증빙에서 등록).
export const vendorAccountChanges = pgTable(
  "vendor_account_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    beforeLast4: text("before_last4"),
    afterLast4: text("after_last4"),
    changedBy: text("changed_by")
      .notNull()
      .references(() => users.id),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
    source: text("source").$type<"admin" | "workplace" | "evidence">().notNull(),
  },
  (table) => [
    index("vendor_account_changes_vendor_changed_idx").on(table.vendorId, table.changedAt),
    check("vendor_account_changes_before_last4_check", sql`${table.beforeLast4} IS NULL OR ${table.beforeLast4} ~ '^[0-9]{4}$'`),
    check("vendor_account_changes_after_last4_check", sql`${table.afterLast4} IS NULL OR ${table.afterLast4} ~ '^[0-9]{4}$'`),
    check("vendor_account_changes_source_check", sql`${table.source} IN ('admin','workplace','evidence')`),
  ],
);
