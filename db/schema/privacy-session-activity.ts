import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sessions } from "./auth";

// 04.3-02 Task 1 ①(표만) — 04.3-07이 쓴다. better-auth 세션 표(sessions.id,
// text PK)를 ON DELETE CASCADE로 참조한다 — 세션이 끝나면 활동 행도 같이 없어진다.
export const privacySessionActivity = pgTable("privacy_session_activity", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});
