import { pgTable, text, boolean, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Phase 3 Task 1 결정(옵션 A, 03-01-DECISION-TASK1.md): 계급은 데이터, 시드 5종은
// is_seed로 보호한다. 순위(rank) 컬럼을 두지 않는다 — 순위 비교가
// can()/visible()/scopeFor() 밖의 네 번째 판정 경로가 되어 ROADMAP 성공 기준
// 2("판정은 세 함수에서만")를 구조적으로 깬다. 표시 순서는 sortOrder만 쓴다.
// archivedBy는 FK를 걸지 않는다 — roles↔users↔roles Drizzle 순환 참조를 피하고,
// 권위 있는 행위자 기록은 action_log.actor_id가 담당한다.
//
// 03-06이 customFields의 GIN 인덱스를 뒤늦게 채운다 — field_definitions 표와
// 저장 전 zod 조립 검증 규약이 이제 정해졌다(마이그레이션 0007).
export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    isSeed: boolean("is_seed").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("roles_custom_fields_idx").using("gin", table.customFields)],
);
