import { sql } from "drizzle-orm";
import { pgTable, text, boolean, integer, jsonb, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// MAST-01: 거래처 표. 03-06 Task 1 결정 ⑤ — 계좌번호는 암호문 컬럼
// (accountNumberEncrypted) + 별도 평문 뒤 4자리 컬럼(accountNumberLast4)만
// 두고, 전체 평문 계좌번호 컬럼은 어디에도 없다. 이름에는 unique 제약을
// 두지 않는다 — 사업자 번호가 다른 동명 거래처가 실제로 존재할 수 있고
// 자동완성은 둘 다 보여줘야 한다. 대신 normalizedName(NFC 정규화 + 소문자)에
// 인덱스를 두어 등록 시 중복 후보 탐지·자동완성 양쪽에서 쓴다.
// 갈래(kind) = 클라이언트 · 협력사 · 둘 다(261006-biv D-1).
// 사업자번호는 숫자만 뽑은 값이 살아 있는(보관 안 된) 거래처 사이에서 유일하다(옛 260907 vendors_business_number_once).
// 07: 지급 기한(payment_term_days = 260907 payment_due_days — 협력사 갈래만 · 1~180, J5) · version(동시 수정 검사 칸 — G9, 비교는 07-20).
// 07 S3: 확인 시각 · 확인한 사람(V9 — NULL = 확인 전). 기존 행은 마이그레이션이 confirmed_at = created_at으로 채운다(확인됨 · 07-23).
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    businessNo: text("business_no"),
    hidden: boolean("hidden").notNull().default(false),
    kind: text("kind").$type<"client" | "supplier" | "both">().notNull().default("both"),
    // 증빙 종류 코드표(evidence_type) 항목의 value 문자열 — Phase 5·6의
    // 지출결의·카드 사용 등록이 거래처를 고르면 이 값을 자동으로 채운다.
    defaultEvidenceType: text("default_evidence_type"),
    accountBank: text("account_bank"),
    accountHolder: text("account_holder"),
    accountNumberEncrypted: text("account_number_encrypted"),
    accountNumberLast4: text("account_number_last4"),
    customFields: jsonb("custom_fields").notNull().default({}),
    paymentTermDays: integer("payment_term_days"),
    version: integer("version").notNull().default(1),
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: text("confirmed_by").references(() => users.id),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendors_normalized_name_idx").on(table.normalizedName),
    index("vendors_custom_fields_idx").using("gin", table.customFields),
    check("vendors_kind_check", sql`${table.kind} IN ('client','supplier','both')`),
    check("vendors_payment_term_days_range_check", sql`${table.paymentTermDays} IS NULL OR ${table.paymentTermDays} BETWEEN 1 AND 180`),
    check("vendors_payment_term_days_supplier_check", sql`${table.paymentTermDays} IS NULL OR ${table.kind} IN ('supplier','both')`),
    // 숨김도 센다. 하이픈 등 표기 차이는 식으로 지운다(저장 형식은 그대로). 빈 값 · NULL은 빠진다.
    uniqueIndex("vendors_business_no_live_key")
      .on(sql`regexp_replace(${table.businessNo}, '[^0-9]', '', 'g')`)
      .where(sql`${table.archivedAt} IS NULL AND regexp_replace(${table.businessNo}, '[^0-9]', '', 'g') <> ''`),
  ],
);
