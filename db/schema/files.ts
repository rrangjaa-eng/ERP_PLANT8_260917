import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// 05-04(EVID-01): 증빙 파일과 업로드 의도. 파일 바이트는 저장소(GCS · 로컬 드라이버)에 있고 이 표는 메타데이터만 둔다.
// owner_id에는 외래 키를 두지 않는다 — 주인 종류가 여럿이다(Phase 6이 owner_kind 값을 더한다).
// sha256에는 UNIQUE를 두지 않는다 — 중복 검사는 사람을 돕는 안내이고, 삭제 · 무효 뒤 같은 파일을 다시 올릴 수 있어야 한다.
// 「살아 있는 파일」 = removed_at IS NULL AND voided_at IS NULL. 무효 처리 열 셋은 05-09가 쓴다(승인 뒤 무효 처리 — 사용자 결정).
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: text("owner_kind").notNull(),
    ownerId: uuid("owner_id").notNull(),
    // 서버가 만든 키 `evidence/{id}` — 업로드 때의 `incoming/{의도 id}`에서 완료 통보가 옮긴 뒤에만 이 행이 생긴다.
    objectKey: text("object_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentType: text("content_type").notNull(),
    // 표시용 — 경로로 쓰지 않는다.
    originalName: text("original_name").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    removedAt: timestamp("removed_at"),
    removedBy: text("removed_by"),
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("files_owner_idx").on(table.ownerKind, table.ownerId),
    index("files_sha256_idx").on(table.sha256),
    check("files_owner_kind_check", sql`${table.ownerKind} IN ('expense')`),
    check("files_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("files_size_bytes_check", sql`${table.sizeBytes} > 0`),
    check(
      "files_void_check",
      sql`(${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL AND ${table.voidReason} IS NULL) OR (${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL AND ${table.voidReason} IS NOT NULL)`,
    ),
    check("files_void_reason_length_check", sql`${table.voidReason} IS NULL OR char_length(${table.voidReason}) BETWEEN 1 AND 500`),
  ],
);

// 업로드 의도 — 선언 값(크기 · 형식 · sha256)과 서버가 만든 키 `incoming/{id}`. 완료 통보는 만든 사람 · 미완료 · 미만료일 때
// 한 번만 이긴다(조건 UPDATE). 완료되지 않은 의도와 그 `incoming/` 객체는 버킷 수명 주기(05-12)가 지운다.
export const uploadIntents = pgTable(
  "upload_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: text("owner_kind").notNull(),
    ownerId: uuid("owner_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    declaredSize: integer("declared_size").notNull(),
    declaredContentType: text("declared_content_type").notNull(),
    declaredSha256: text("declared_sha256").notNull(),
    originalName: text("original_name").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("upload_intents_created_by_idx").on(table.createdBy)],
);
