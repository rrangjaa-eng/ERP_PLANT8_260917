import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, unique, index, check } from "drizzle-orm/pg-core";
import { certPrizes } from "./cert-prizes";
import { certEvents } from "./cert-events";
import { users } from "./auth";

// CERT-01·CERT-02·04.3-02 Task 1 ① · 04.3-15 — 확인증 표. rrn_encrypted(암호문) · rrn_masked(가린 값) 두 칸만
// 두고 13자리 평문 칸은 어디에도 없다. 파기는 개인정보 칸(name · rrn_encrypted · rrn_masked · phone ·
// address · signature_key · submit_ip_hash)만 NULL로 비운다 — 행을 지우지 않는다(물리 DELETE 금지,
// domain/archive/index.ts). consent_version · retention_years는 제출이 보낸 안내 판(페이지가 준 값 —
// 서버가 지금 판과 대조)이고 파기 기한 계산의 정본이다. prize_id는 고른 경품(제출이 있는 경품 줄은
// 지우지 못한다 — N5 a), quantity는 수령자가 적지 않아 1로 저장한다(정정은 I4 — N3 a).
export const certSubmissions = pgTable(
  "cert_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => certEvents.id),
    prizeId: uuid("prize_id")
      .notNull()
      .references(() => certPrizes.id),
    quantity: integer("quantity").notNull().default(1),
    certNo: text("cert_no").notNull().unique(),
    name: text("name"),
    rrnEncrypted: text("rrn_encrypted"),
    rrnMasked: text("rrn_masked"),
    phone: text("phone"),
    address: text("address"),
    consentAt: timestamp("consent_at").notNull(),
    consentVersion: text("consent_version").notNull(),
    retentionYears: integer("retention_years").notNull(),
    signatureKey: text("signature_key"),
    idempotencyKeyHash: text("idempotency_key_hash"),
    // 속도 제한용 키 있는 IP 가명 — 링크를 닫을 때(04.3-17) · 파기 Job이 비운다(04.3-12).
    // IP 셈은 UNIQUE (event_id, …)의 event_id 접두로 받친다 — 행사당 제출이 1,000건을 넘으면
    // (event_id, submit_ip_hash, submitted_at) 인덱스를 더한다.
    submitIpHash: text("submit_ip_hash"),
    // 대조 제외(04.3-17 I4 — E1 b). 둘 다 NULL = 제외 아님.
    excludedAt: timestamp("excluded_at"),
    excludedBy: text("excluded_by").references(() => users.id),
    submittedAt: timestamp("submitted_at").notNull(),
    purgedAt: timestamp("purged_at"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("cert_submissions_event_id_idempotency_key_hash_unique").on(table.eventId, table.idempotencyKeyHash),
    index("cert_submissions_prize_id_idx").on(table.prizeId),
    check("cert_submissions_quantity_check", sql`${table.quantity} >= 1`),
  ],
);
