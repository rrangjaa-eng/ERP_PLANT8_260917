import { pgTable, text, bigserial, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

// OPS-05: 핵심 행동 로그. seq(단조 증가 bigserial)가 occurred_at이 같은 행들의
// 보조 정렬 키다 — 삽입 순서를 잃지 않는다. append-only, 이 표를 대상으로 하는
// UPDATE/DELETE 문은 이 리포 어디에도 없다.
export const actionLog = pgTable(
  "action_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    actorId: text("actor_id").references(() => users.id),
    actorRoleId: text("actor_role_id"),
    actionType: text("action_type").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    documentId: text("document_id"),
    detail: jsonb("detail").notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    index("action_log_actor_occurred_idx").on(table.actorId, table.occurredAt),
    index("action_log_type_occurred_idx").on(table.actionType, table.occurredAt),
    index("action_log_document_idx").on(table.documentId),
  ],
);
