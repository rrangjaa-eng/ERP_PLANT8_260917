import { pgTable, text, boolean, timestamp, uuid, index } from "drizzle-orm/pg-core";

// AUTH-01·Eng Issue 5: 로그인 실패를 DB에 기록해 계정 잠금이 인스턴스와 무관하게
// 동작하게 한다(F3). resolved_at이 null인 success=false 행이 "열린 실패"다.

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    ip: text("ip"),
    attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolvedReason: text("resolved_reason"),
  },
  (table) => [index("login_attempts_email_attempted_idx").on(table.email, table.attemptedAt)],
);
