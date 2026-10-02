import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { certEvents } from "./cert-events";
import { users } from "./auth";

// 04.3-15(새 흐름 — 5909578685) — 경품 목록 표. 행사당 여러 줄, 경영관리가 넣는다(04.3-10).
// 1개 가액은 원 정수(1 이상)이고 수령자에게 보내지 않는다(5905714131) — 판정은 domain/certs/prize-value.ts.
// winner_count는 현장 추첨 당첨 수(E6 a — 04.3-17 대조 머리글), expense_line_id는 Phase 11 연결 어댑터
// (경품 시가가 이 줄에 있어 지출결의 줄과 줄 단위로 잇는다). 경품명 중복은 DB UNIQUE로 막지 않는다 —
// 일괄 저장이 이름을 맞바꾸는 순간을 즉시 UNIQUE가 거부하고, 모든 경품 쓰기가 행사 행 잠금 아래라
// domain 검사로 충분하다.
export const certPrizes = pgTable(
  "cert_prizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => certEvents.id),
    name: text("name").notNull(),
    unitValueKrw: bigint("unit_value_krw", { mode: "number" }).notNull(),
    delivery: text("delivery").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    winnerCount: integer("winner_count").notNull().default(1),
    expenseLineId: uuid("expense_line_id"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("cert_prizes_event_id_idx").on(table.eventId),
    check("cert_prizes_unit_value_krw_check", sql`${table.unitValueKrw} >= 1`),
    check("cert_prizes_delivery_check", sql`${table.delivery} in ('onsite','parcel')`),
    check("cert_prizes_winner_count_check", sql`${table.winnerCount} >= 1`),
  ],
);
