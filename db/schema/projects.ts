import { pgTable, text, integer, jsonb, timestamp, uuid, date, unique, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { teams } from "./org";
import { vendors } from "./vendors";
import { moneyColumns } from "./money-columns";

// PROJ-01·D-41~D-51: 프로젝트 표 — 번호·상태·사전 견적(총 매출 예상가)
// Money 묶음·기간·팀/PM FK·custom_fields·source·version. 마스터 성격의
// 문서 표라 보관함 컬럼(vendors.ts와 같은 규약)을 둔다. 상태 값 네 가지는
// Phase 3 코드표 `project_status`가 정본이다(Task 1 ④). 클라이언트는 별도
// clients 표가 아니라 `vendors`를 참조한다(MAST-01 "거래처·클라이언트").
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => vendors.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    pmUserId: text("pm_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // D-41: bidding(수주중) · in_progress(진행) · settled(완료(정산)) · lost(미수주).
    status: text("status").notNull().default("bidding"),
    // D-49: 수주중 단계는 기간이 선택이다 — nullable, 진행 전환 게이트가 시점을 담당(04-06).
    startDate: date("start_date"),
    endDate: date("end_date"),
    // D-52: 사전 견적 = 프로젝트의 총 매출 예상가 한 칸(견적 줄 없는 프로젝트 속성, 선택 입력).
    ...moneyColumns("preEstimate"),
    // 04-02(D-57): 매출 섹션의 계약 금액(공급가액) — PM이 쓰는 단일 칸. 부가세·
    // 합계는 domain/revenue가 domain/money로 매번 계산해 화면에 보이고 저장하지
    // 않는다(계약 금액 하나가 정본).
    ...moneyColumns("contract"),
    // Eng OV-1: 전환 전 새 시스템 입력은 source='demo'뿐.
    source: text("source").notNull().default("demo"),
    customFields: jsonb("custom_fields").notNull().default({}),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("projects_number_key").on(table.number),
    index("projects_status_idx").on(table.status),
    index("projects_end_date_idx").on(table.endDate),
    index("projects_client_id_idx").on(table.clientId),
    index("projects_team_id_idx").on(table.teamId),
    index("projects_custom_fields_idx").using("gin", table.customFields),
  ],
);
