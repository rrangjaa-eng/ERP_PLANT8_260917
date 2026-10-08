import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

// 06.2(D-6209): 프로젝트 참여자 — 담당 팀 밖 사람을 프로젝트에 붙여 담당 팀처럼 보게 한다(rowScopeFor 번역기가 늘 더한다).
// 260907 대조: `O: db/schema/010_tables.sql:3805-3812` project_members(people_id → 우리 user_id).
// 지우지 않는다 — 떼기는 archived_at(D-6209), 하드 삭제 트리거는 두지 않고 도메인이 DELETE를 부르지 않는다(RESEARCH A9).
// 뗀 사람은 칸이 아니라 06.2-05의 project_member_change 행동 로그가 남긴다. 같은 (프로젝트, 사람)에 살아 있는 줄은 하나다.
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    uniqueIndex("project_members_live_uniq")
      .on(table.projectId, table.userId)
      .where(sql`${table.archivedAt} IS NULL`),
    index("project_members_user_live_idx")
      .on(table.userId)
      .where(sql`${table.archivedAt} IS NULL`),
    index("project_members_project_idx").on(table.projectId),
  ],
);
