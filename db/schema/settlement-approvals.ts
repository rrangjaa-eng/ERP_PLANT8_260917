import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

// 05-11(D-98 · D-79): 정산 결재 — 프로젝트마다 하나(project_id UNIQUE)이고 식별 번호는 프로젝트 번호다(새 카운터 없음).
// 결재 상태는 이 표가 아니라 approval_instances(document_kind = 정산 결재 종류 키)에 있다 — 상태 열 없음.
export const settlementApprovals = pgTable("settlement_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id),
  drafterId: text("drafter_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
