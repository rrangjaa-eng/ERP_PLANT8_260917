import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, jsonb, unique, index, check } from "drizzle-orm/pg-core";
import { certEvents } from "./cert-events";
import { users } from "./auth";

// CERT-01·04.3-02 Task 1 ① — 당첨자(수령자 슬롯) 표. name·phone은 파기가
// 비운다(nullable). failed_attempts/locked_until은 짧은 잠금(뒤 4자리
// 시도), cumulative_failed_attempts/hard_locked_at은 누적 잠금(소유자 결정
// 2026-09-24 21:56) — 한도 20은 04.3-03의 코드 상수(설정 키 없음).
// verify_idem_outcome은 트레이서에서 쓰지 않는다(null, 04.3-03이 채운다).

// verify_idem_outcome 맵 모양(정본) — 키는 멱등 키의 SHA-256 hex, 값은
// 판정 종류에 따라 갈리는 판별 유니온이다. r은 그때 돌려준 응답(개인정보 ·
// 4자리 · 증표 평문 없음, 모양은 04.3-03이 정한다).
export type VerifyIdemEntry =
  | { o: "wrong"; r: Record<string, unknown>; ip: string; at: string }
  | { o: "ok"; r: Record<string, unknown>; p: string; until: string; ip: string; at: string };
export type VerifyIdemOutcomeMap = Record<string, VerifyIdemEntry>;

export const certWinners = pgTable(
  "cert_winners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => certEvents.id),
    name: text("name"),
    phone: text("phone"),
    distinguishLabel: text("distinguish_label"),
    prizeName: text("prize_name").notNull(),
    quantity: integer("quantity").notNull(),
    delivery: text("delivery").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
    cumulativeFailedAttempts: integer("cumulative_failed_attempts").notNull().default(0),
    hardLockedAt: timestamp("hard_locked_at"),
    verifyIdemOutcome: jsonb("verify_idem_outcome").$type<VerifyIdemOutcomeMap>(),
    verifyProofHash: text("verify_proof_hash"),
    verifiedUntil: timestamp("verified_until"),
    offeredConsentVersion: text("offered_consent_version"),
    offeredRetentionYears: integer("offered_retention_years"),
    submittedAt: timestamp("submitted_at"),
    expenseLineId: uuid("expense_line_id"),
    purgedAt: timestamp("purged_at"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("cert_winners_event_id_idx").on(table.eventId),
    unique("cert_winners_event_id_name_phone_unique").on(table.eventId, table.name, table.phone),
    check("cert_winners_quantity_check", sql`${table.quantity} >= 1`),
    check("cert_winners_delivery_check", sql`${table.delivery} in ('onsite','parcel')`),
  ],
);
