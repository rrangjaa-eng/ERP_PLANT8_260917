import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, timestamp, uuid, unique, index, check } from "drizzle-orm/pg-core";
import { users } from "./auth";

// 04.1(EXP-03·EXP-04): 결재 모듈 세 표. 문서 종류를 모른다 — document_kind
// 문자열 + document_id(uuid)로 어느 문서든 가리킨다. 결재선은 제출 때
// approval_routes(차수) + approval_steps(단계)로 고정되고, 단계에는 사람을
// 저장하지 않는다(계급 × 조직 범위 종류 × 해석된 대상 id만). 사람 id를 담는
// 열은 처리 기록(acted_by)뿐이다 — 지금·남은 단계의 담당은 표시·처리 시점마다
// 다시 해석한다(domain/approvals/route.ts).
export const approvalInstances = pgTable(
  "approval_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentKind: text("document_kind").notNull(),
    documentId: uuid("document_id").notNull(),
    drafterId: text("drafter_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("draft"),
    currentRound: integer("current_round").notNull().default(0),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("approval_instances_kind_document_key").on(table.documentKind, table.documentId),
    index("approval_instances_status_idx").on(table.status),
    check(
      "approval_instances_status_check",
      sql`${table.status} IN ('draft','submitted','in_review','approved','rejected','withdrawn')`,
    ),
  ],
);

export const approvalRoutes = pgTable(
  "approval_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => approvalInstances.id),
    round: integer("round").notNull(),
    selfApproval: text("self_approval").notNull(),
    drafterTeamId: uuid("drafter_team_id"),
    drafterOrgUnitId: uuid("drafter_org_unit_id"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (table) => [
    unique("approval_routes_instance_round_key").on(table.instanceId, table.round),
    check("approval_routes_self_approval_check", sql`${table.selfApproval} IN ('skip','self_approve')`),
  ],
);

// step_index = 설정 단계 번호(1~4, 꺼진 단계의 번호는 비어 있다). 대표 폴백
// 행은 그 차수 max(step_index) + 1(A-02).
export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => approvalRoutes.id),
    stepIndex: integer("step_index").notNull(),
    label: text("label").notNull(),
    // null = 계급 조건 없음. 계급을 지워도 진행 중 문서가 깨지지 않게 FK를 두지 않는다.
    roleId: text("role_id"),
    scopeKind: text("scope_kind").notNull(),
    scopeTargetId: uuid("scope_target_id"),
    isFallback: boolean("is_fallback").notNull().default(false),
    actedBy: text("acted_by").references(() => users.id),
    actedAt: timestamp("acted_at"),
    action: text("action"),
    reason: text("reason"),
    selfApproved: boolean("self_approved").notNull().default(false),
  },
  (table) => [
    unique("approval_steps_route_step_key").on(table.routeId, table.stepIndex),
    // CEO-17: 처리함(내가 처리한 문서) 조회용.
    index("approval_steps_acted_by_idx").on(table.actedBy),
    check("approval_steps_scope_kind_check", sql`${table.scopeKind} IN ('team','org_unit','company')`),
    check("approval_steps_action_check", sql`${table.action} IS NULL OR ${table.action} IN ('approved','rejected')`),
  ],
);
