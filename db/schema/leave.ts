import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, uuid, date, index, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// 04.1(LEAV-01): 연차 신청. 일수는 정수 1/4일(days_quarters) — 종일 = 평일 수 × 4,
// 반차 = 2, 반반차 = 1, 재택 = 0. 부동소수 합산 오차가 없다. 결재 상태는 이 표가
// 아니라 approval_instances(document_kind = 연차 종류 키)에 있다.
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    drafterId: text("drafter_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    half: text("half"),
    daysQuarters: integer("days_quarters").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("leave_requests_drafter_year_idx").on(table.drafterId, table.fiscalYear),
    check("leave_requests_kind_check", sql`${table.kind} IN ('full_day','half_day','quarter_day','remote')`),
    check("leave_requests_half_check", sql`${table.half} IS NULL OR ${table.half} IN ('am','pm')`),
    check("leave_requests_days_quarters_check", sql`${table.daysQuarters} >= 0`),
  ],
);
