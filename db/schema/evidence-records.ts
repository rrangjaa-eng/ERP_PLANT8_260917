import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, date, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { vendors } from "./vendors";
import { corpCards } from "./corp-cards";
import { orgUnits, teams } from "./org";

// 06.1(D-6107 · D-6112): 홈택스 · 카드사 엑셀 한 줄 = 증빙 기록 하나. 05 `files`(저장소에 바이트가 있는 첨부)를 넓히지 않고
// 표 셋을 따로 둔다 — 등록 묶음 · 증빙 기록 · 붙임 이력. 원본 파일 바이트 · 카드 전체 번호 · 결제 계좌번호 칸은 두지 않는다
// (보관할 까닭이 없고 새면 피해가 크다 — 카드는 끝 네 자리만). `source` 칸도 두지 않는다(06 표의 기본값 'demo'가 운영 줄에 찍힌다).
export const evidenceImportBatches = pgTable(
  "evidence_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    format: text("format").notNull(),
    originalName: text("original_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    rowCount: integer("row_count").notNull(),
    registeredCount: integer("registered_count").notNull(),
    skippedDuplicateCount: integer("skipped_duplicate_count").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("evidence_import_batches_file_sha256_idx").on(table.fileSha256),
    check("evidence_import_batches_file_sha256_check", sql`${table.fileSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const evidenceRecords = pgTable(
  "evidence_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => evidenceImportBatches.id, { onDelete: "restrict" }),
    format: text("format").notNull(),
    // 증빙 종류 코드표(evidence_type) 항목의 value — vendors.default_evidence_type과 같은 FK 없는 문자열.
    evidenceType: text("evidence_type").notNull(),
    approvalNo: text("approval_no"),
    // 보관된 기록도 열쇠를 차지한다 — 같은 줄을 다시 올리면 「이미 등록」으로 건너뛰고, 되살림은 06.1-05 보관함 길이다.
    dedupeKey: text("dedupe_key").notNull(),
    issuedOn: date("issued_on").notNull(),
    // 원 정수. 음수 허용(취소 · 수정세금계산서).
    supplyKrw: bigint("supply_krw", { mode: "number" }).notNull(),
    vatKrw: bigint("vat_krw", { mode: "number" }).notNull(),
    totalKrw: bigint("total_krw", { mode: "number" }).notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    businessNoDigits: text("business_no_digits"),
    nameOnDocument: text("name_on_document"),
    merchant: text("merchant"),
    corpCardId: uuid("corp_card_id").references(() => corpCards.id),
    cardLast4: text("card_last4"),
    needsCheck: text("needs_check"),
    originalApprovalNo: text("original_approval_no"),
    visibility: text("visibility").notNull().default("private"),
    visibleTeamId: uuid("visible_team_id").references(() => teams.id),
    visibleOrgUnitId: uuid("visible_org_unit_id").references(() => orgUnits.id),
    // C1 · DA-4: 공개 범위를 사람이 한 번이라도 저장했나 — NULL이면 06.1-05가 제안한다.
    visibilitySavedAt: timestamp("visibility_saved_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("evidence_records_dedupe_key_uniq").on(table.dedupeKey),
    check("evidence_records_amount_sum_check", sql`${table.totalKrw} = ${table.supplyKrw} + ${table.vatKrw}`),
    check("evidence_records_business_no_digits_check", sql`${table.businessNoDigits} IS NULL OR ${table.businessNoDigits} ~ '^[0-9]{10}$'`),
    check("evidence_records_card_last4_check", sql`${table.cardLast4} IS NULL OR ${table.cardLast4} ~ '^[0-9]{4}$'`),
    check("evidence_records_visibility_check", sql`${table.visibility} IN ('private','team','division')`),
    check(
      "evidence_records_visibility_target_check",
      sql`(${table.visibility} = 'private' AND ${table.visibleTeamId} IS NULL AND ${table.visibleOrgUnitId} IS NULL) OR (${table.visibility} = 'team' AND ${table.visibleTeamId} IS NOT NULL AND ${table.visibleOrgUnitId} IS NULL) OR (${table.visibility} = 'division' AND ${table.visibleOrgUnitId} IS NOT NULL AND ${table.visibleTeamId} IS NULL)`,
    ),
    check(
      "evidence_records_archived_pair_check",
      sql`(${table.archivedAt} IS NULL AND ${table.archivedBy} IS NULL) OR (${table.archivedAt} IS NOT NULL AND ${table.archivedBy} IS NOT NULL)`,
    ),
    index("evidence_records_visibility_idx").on(table.visibility),
    index("evidence_records_batch_idx").on(table.batchId),
    index("evidence_records_card_issued_idx").on(table.corpCardId, table.issuedOn),
    index("evidence_records_format_issued_idx").on(table.format, table.issuedOn),
    index("evidence_records_visible_team_idx").on(table.visibleTeamId).where(sql`${table.visibility} = 'team'`),
    index("evidence_records_visible_org_unit_idx").on(table.visibleOrgUnitId).where(sql`${table.visibility} = 'division'`),
  ],
);

// 붙임 이력 — 뗀 붙임도 행으로 남는다(뗀 사람 · 시각 · 사유, 행동 로그 설정과 무관). 한 증빙은 한 번에 한 문서에만 붙는다.
export const evidenceRecordLinks = pgTable(
  "evidence_record_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceRecordId: uuid("evidence_record_id")
      .notNull()
      .references(() => evidenceRecords.id),
    ownerKind: text("owner_kind").notNull(),
    ownerId: uuid("owner_id").notNull(),
    attachMode: text("attach_mode").notNull(),
    attachedBy: text("attached_by")
      .notNull()
      .references(() => users.id),
    attachedAt: timestamp("attached_at").notNull().defaultNow(),
    detachedAt: timestamp("detached_at"),
    detachedBy: text("detached_by").references(() => users.id),
    detachReason: text("detach_reason"),
  },
  (table) => [
    check("evidence_record_links_owner_kind_check", sql`${table.ownerKind} IN ('expense','purchase_request','corp_card_usage')`),
    check("evidence_record_links_attach_mode_check", sql`${table.attachMode} IN ('registrar','author','reconcile')`),
    check(
      "evidence_record_links_detached_check",
      sql`(${table.detachedAt} IS NULL AND ${table.detachedBy} IS NULL AND ${table.detachReason} IS NULL) OR (${table.detachedAt} IS NOT NULL AND ${table.detachedBy} IS NOT NULL AND ${table.detachReason} IS NOT NULL AND char_length(${table.detachReason}) > 0)`,
    ),
    uniqueIndex("evidence_record_links_live_uniq").on(table.evidenceRecordId).where(sql`${table.detachedAt} IS NULL`),
    index("evidence_record_links_owner_live_idx").on(table.ownerKind, table.ownerId).where(sql`${table.detachedAt} IS NULL`),
  ],
);
