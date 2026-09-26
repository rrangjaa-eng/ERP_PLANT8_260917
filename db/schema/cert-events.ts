import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, date, unique, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// CERT-01·04.3-02 Task 1 ① — 확인증 행사 표. 링크 토큰은 원문이 아니라
// SHA-256 해시(조회용)와 encrypt() 암호문(상세 화면 QR 재표시용)만 저장한다.
// contact_phone은 설정 cert.contact_phone의 행사별 사본이다 — 설정을
// 바꾸거나 비워도 이미 만든 행사의 외부 화면은 이 값을 그대로 쓴다
// (UI-SPEC ①-l · A12). expense_document_id는 Phase 11 연결 어댑터 자리다.
// create_request_id는 04.3-04 행사 만들기 멱등 키(계획 시점에 미리 넣음,
// E3-22 · E3-31) — 이 플랜의 createEvent는 이 칸을 비운다.
export const certEvents = pgTable(
  "cert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    wonOn: date("won_on").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEncrypted: text("token_encrypted").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
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
    check(
      "cert_events_closed_reason_check",
      sql`${table.closedReason} is null or ${table.closedReason} in ('all_submitted','manual')`,
    ),
  ],
);
