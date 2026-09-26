import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  bigint,
  integer,
  date,
  timestamp,
  boolean,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// Phase 04.2(NOTI-04): 알림 중복 방지 원장 겸 알림함 행(D-706 — 건별).
// (조건 종류, 대상, 대상 id, 받는 사람, 회차) 키마다 한 행이다(D-4201). 다섯 칸
// 모두 NOT NULL — PG 유니크 제약은 NULL끼리를 다른 값으로 봐서 NULL 칸이
// 있으면 중복 방지가 조용히 뚫린다. 이 표의 행은 지우지 않는다(보관 기간은
// 화면 표시 창일 뿐 — D-4206). created_at은 밀리초 정밀도라 JS Date 왕복이
// 저장값과 같다(알림함 keyset 커서).
export const notificationLog = pgTable(
  "notification_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    conditionKind: text("condition_kind").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id),
    round: integer("round").notNull().default(1),
    referenceDate: date("reference_date").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    readAt: timestamp("read_at"),
    emailStatus: text("email_status").notNull().default("pending"),
    emailAttemptedAt: timestamp("email_attempted_at"),
  },
  (table) => [
    unique("notification_log_dedup_key").on(
      table.conditionKind,
      table.entity,
      table.entityId,
      table.recipientId,
      table.round,
    ),
    index("notification_log_recipient_created_idx").on(table.recipientId, table.createdAt, table.id),
    check(
      "notification_log_email_status_check",
      sql`${table.emailStatus} in ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped_no_smtp')`,
    ),
  ],
);

// tick 실행 기록 — 성공한 tick마다 한 행(잠금을 못 잡은 tick은 남기지 않는다,
// D-4204). incomplete_recipient_ids·evaluation_failed는 삽입과 같은 잠금
// 트랜잭션에서 써서 이메일 선점(04.2-10)이 읽는다. 이메일 칸은 04.2-10이 쓴다.
export const notifyTickRuns = pgTable("notify_tick_runs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").notNull(),
  kstDate: date("kst_date").notNull(),
  businessDay: boolean("business_day").notNull(),
  sent: integer("sent").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  remaining: integer("remaining").notNull().default(0),
  emailClaimed: integer("email_claimed").notNull().default(0),
  emailSent: integer("email_sent").notNull().default(0),
  emailFailed: integer("email_failed").notNull().default(0),
  emailUnknown: integer("email_unknown").notNull().default(0),
  emailFinishedAt: timestamp("email_finished_at"),
  incompleteRecipientIds: text("incomplete_recipient_ids")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  evaluationFailed: boolean("evaluation_failed").notNull().default(false),
});
