import { sql } from "drizzle-orm";
import { pgTable, text, uuid, date, integer, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Phase 04.2(ADMN-11): 영업일 계산이 읽는 공휴일 표 하나 — 보관 안 된 행은 날짜마다 한 행.
// 규칙 행·초기 수동 목록은 created_by가 null이다. 대체공휴일 행만 origin_year
// (그 대체일을 낳은 공휴일의 해)를 갖는다 — 다음 해 1월로 넘어간 대체일도
// 원래 해 단위로 다시 계산한다(D-4210).
export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    originYear: integer("origin_year"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
  },
  (table) => [
    // 보관된 행은 날짜를 붙잡지 않는다(quick 261001-hfi D-01) — 같은 날짜 재추가 · 대체일 재배치가 보관 행에 막히지 않게.
    uniqueIndex("holidays_date_active_key").on(table.date).where(sql`${table.archivedAt} is null`),
    check("holidays_kind_check", sql`${table.kind} in ('statutory', 'substitute', 'temporary', 'election')`),
    check(
      "holidays_origin_year_check",
      sql`(${table.kind} = 'substitute') = (${table.originYear} is not null)`,
    ),
  ],
);

// 연도 확정(04.2-11) — 해마다 한 행.
export const holidayYearConfirmations = pgTable("holiday_year_confirmations", {
  year: integer("year").primaryKey(),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
  confirmedBy: text("confirmed_by")
    .notNull()
    .references(() => users.id),
});

// 그 해 후보 생성 완료 표시 — 행이 있으면 규칙 행을 다시 만들지 않는다.
export const holidayYearGenerations = pgTable("holiday_year_generations", {
  year: integer("year").primaryKey(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});
