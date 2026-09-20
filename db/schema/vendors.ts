import { pgTable, text, boolean, jsonb, timestamp, uuid, index } from "drizzle-orm/pg-core";

// MAST-01: 거래처 표. 03-06 Task 1 결정 ⑤ — 계좌번호는 암호문 컬럼
// (accountNumberEncrypted) + 별도 평문 뒤 4자리 컬럼(accountNumberLast4)만
// 두고, 전체 평문 계좌번호 컬럼은 어디에도 없다. 이름에는 unique 제약을
// 두지 않는다 — 사업자 번호가 다른 동명 거래처가 실제로 존재할 수 있고
// 자동완성은 둘 다 보여줘야 한다. 대신 normalizedName(NFC 정규화 + 소문자)에
// 인덱스를 두어 등록 시 중복 후보 탐지·자동완성 양쪽에서 쓴다.
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    businessNo: text("business_no"),
    hidden: boolean("hidden").notNull().default(false),
    // 증빙 종류 코드표(evidence_type) 항목의 value 문자열 — Phase 5·6의
    // 지출결의·카드 사용 등록이 거래처를 고르면 이 값을 자동으로 채운다.
    defaultEvidenceType: text("default_evidence_type"),
    accountBank: text("account_bank"),
    accountHolder: text("account_holder"),
    accountNumberEncrypted: text("account_number_encrypted"),
    accountNumberLast4: text("account_number_last4"),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendors_normalized_name_idx").on(table.normalizedName),
    index("vendors_custom_fields_idx").using("gin", table.customFields),
  ],
);
