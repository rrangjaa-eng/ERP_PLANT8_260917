import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { certWinners } from "./cert-winners";
import { certEvents } from "./cert-events";
import { users } from "./auth";

// CERT-01·CERT-02·04.3-02 Task 1 ① — 확인증 표. rrn_encrypted(암호문) ·
// rrn_masked(가린 값) 두 칸만 두고 13자리 평문 칸은 어디에도 없다. 파기는
// 개인정보 칸(name · rrn_encrypted · rrn_masked · phone · address ·
// signature_key)만 NULL로 비운다 — 행을 지우지 않는다(물리 DELETE 금지,
// domain/archive/index.ts). retention_years는 확인 때 그 자리에 묶인
// cert_winners.offered_retention_years의 사본이다(파기 기한 계산의 정본).
export const certSubmissions = pgTable("cert_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  winnerId: uuid("winner_id")
    .notNull()
    .unique()
    .references(() => certWinners.id),
  eventId: uuid("event_id")
    .notNull()
    .references(() => certEvents.id),
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
  submittedAt: timestamp("submitted_at").notNull(),
  purgedAt: timestamp("purged_at"),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
