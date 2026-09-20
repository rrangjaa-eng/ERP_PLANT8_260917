import { pgTable, text, boolean, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { roles } from "./roles";

// ADMN-01: 권한표(계급 × 메뉴 × 동작). 복합 UNIQUE가 같은 셀 중복을 막고
// upsertPermission의 onConflictDoUpdate 대상이 된다(같은 셀을 두 번 켜도 행이
// 하나, 동시 토글은 마지막 쓰기가 이긴다).
export const permissionMatrix = pgTable(
  "permission_matrix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    menu: text("menu").notNull(),
    action: text("action").notNull(),
    allowed: boolean("allowed").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    unique("permission_matrix_role_menu_action_key").on(table.roleId, table.menu, table.action),
  ],
);

// ADMN-02: 정보 노출표(계급 × 정보 항목). can()의 판정 표와 완전 독립(D-35) —
// 별개 표, 별개 판정 함수.
export const visibilityMatrix = pgTable(
  "visibility_matrix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    infoItem: text("info_item").notNull(),
    visible: boolean("visible").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [unique("visibility_matrix_role_item_key").on(table.roleId, table.infoItem)],
);
