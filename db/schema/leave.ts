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

// 04.1-03(05-CONTEXT Discretion 「결근 차감은 관리자 수동 조정」 · ENG-13): 연차·월차 잔고
// 조정 — 추가만 된다(수정·삭제 없음, 틀리면 반대 부호로 한 줄 더). 일수는 부호 있는 정수
// 1/4일. 연차 조정만 회계연도를 갖는다(그 해 연차 줄에 붙는다), 월차 조정은 입력한 날 ~
// 월차 소멸일 창. 잔고 숫자는 어느 표에도 저장하지 않는다.
export const leaveAdjustments = pgTable(
  "leave_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    bucket: text("bucket").notNull(),
    fiscalYear: integer("fiscal_year"),
    amountQuarters: integer("amount_quarters").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("leave_adjustments_user_idx").on(table.userId),
    check("leave_adjustments_bucket_check", sql`${table.bucket} IN ('annual','monthly')`),
    check("leave_adjustments_amount_quarters_check", sql`${table.amountQuarters} <> 0`),
    check("leave_adjustments_fiscal_year_check", sql`(${table.bucket} = 'annual') = (${table.fiscalYear} IS NOT NULL)`),
  ],
);
