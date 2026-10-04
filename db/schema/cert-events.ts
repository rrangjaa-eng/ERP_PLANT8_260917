import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, date, unique, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// CERT-01·04.3-02 Task 1 ① · 04.3-15(새 흐름 — 5909578685) — 확인증 행사 표. 기획본부의 「QR 생성 신청」이
// 토큰 없는 행(`신청됨`)을 만들고, 경영관리의 「QR 생성」이 토큰 · 마감 · QR 생성 시각을 채운다. 링크 토큰은
// 원문이 아니라 SHA-256 해시(조회용)와 encrypt() 암호문(상세 화면 QR 재표시용)만 저장한다.
// contact_phone은 설정 cert.contact_phone의 행사별 사본이다 — 설정을 바꾸거나 비워도 이미 만든 행사의
// 외부 화면은 이 값을 그대로 쓴다(UI-SPEC ①-l · A12). expense_document_id는 Phase 11 연결 어댑터 자리다.
// create_request_id는 「QR 생성 신청」 멱등 키, qr_request_id는 「QR 생성」 멱등 키(04.3-10이 쓴다 — 미리 둔다).
export const certEvents = pgTable(
  "cert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    wonOn: date("won_on").notNull(),
    tokenHash: text("token_hash").unique(),
    tokenEncrypted: text("token_encrypted"),
    expiresAt: timestamp("expires_at"),
    qrCreatedAt: timestamp("qr_created_at"),
    qrCreatedBy: text("qr_created_by").references(() => users.id),
    qrRequestId: uuid("qr_request_id"),
    closedAt: timestamp("closed_at"),
    closedReason: text("closed_reason"),
    closedBy: text("closed_by").references(() => users.id),
    createdBy: text("created_by").references(() => users.id),
    contactPhone: text("contact_phone").notNull(),
    expenseDocumentId: uuid("expense_document_id"),
    createRequestId: uuid("create_request_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("cert_events_create_request_id_unique").on(table.createRequestId),
    unique("cert_events_qr_request_id_unique").on(table.qrRequestId),
    check(
      "cert_events_closed_reason_check",
      sql`${table.closedReason} is null or ${table.closedReason} = 'manual'`,
    ),
    // 토큰 두 칸과 QR 생성 시각은 함께 비었거나(신청됨) 함께 찼다. 마감은 토큰이 있을 때만 있을 수 있다
    // (마감 규칙은 04.3-10 — 「마감 없음」이면 토큰이 있어도 NULL).
    check(
      "cert_events_qr_state_check",
      sql`((${table.tokenHash} is null and ${table.tokenEncrypted} is null and ${table.qrCreatedAt} is null) or (${table.tokenHash} is not null and ${table.tokenEncrypted} is not null and ${table.qrCreatedAt} is not null)) and (${table.expiresAt} is null or ${table.tokenHash} is not null)`,
    ),
    // 신청됨(토큰 없음)은 닫지 않고 취소한다(04.3-17).
    check("cert_events_closed_after_qr_check", sql`${table.closedAt} is null or ${table.tokenHash} is not null`),
  ],
);
