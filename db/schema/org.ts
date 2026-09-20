import { pgTable, text, integer, jsonb, timestamp, uuid, date, unique, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

// MAST-02: 조직 3표 — 본부(orgUnits) ⊂ 팀(teams), 팀 소속 발령 이력
// (teamMemberships). 본부·팀은 마스터 표라 03-01이 정한 경계대로 보관함 컬럼 +
// customFields를 둔다. 발령 이력은 append-only 감사 이력이라 그 경계 밖이다 —
// 보관함·customFields 컬럼을 두지 않는다.
export const orgUnits = pgTable("org_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  customFields: jsonb("custom_fields").notNull().default({}),
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgUnitId: uuid("org_unit_id")
      .notNull()
      .references(() => orgUnits.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("teams_org_name_key").on(table.orgUnitId, table.name)],
);

// 발령 이력 — effectiveFrom은 settings_historized.effective_from(03-04)과 같은
// date 컬럼(string 모드, 'YYYY-MM-DD' 그대로 저장·비교 — 타임존 변환으로 하루가
// 밀리는 사고를 원천 차단한다). 복합 UNIQUE가 "어느 날짜의 소속은 하나"를 DB
// 레벨에서 보장한다. 과거 발령을 고치는 UPDATE/DELETE 경로를 이 표 위에 두지
// 않는다(domain/org/index.ts) — 추가만 되는 append-only 이력이다.
export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    effectiveFrom: date("effective_from").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (table) => [
    unique("team_memberships_user_from_key").on(table.userId, table.effectiveFrom),
    index("team_memberships_user_from_idx").on(table.userId, table.effectiveFrom),
  ],
);
