import { pgTable, text, bigint, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

// OPS-05: 핵심 행동 로그. seq(단조 증가 identity)가 occurred_at이 같은 행들의
// 보조 정렬 키다 — 삽입 순서를 잃지 않는다. append-only, 이 표를 대상으로 하는
// UPDATE/DELETE 문은 이 리포 어디에도 없다. bigserial 대신 identity 컬럼을
// 쓴다 — squawk prefer-identity 실측(bigserial은 시퀀스 소유·권한 관리가
// 불투명하다는 경고).
//
// 03-07: prunedAt/prunedBy — 관리자의 "정리"는 표시일 뿐 물리 삭제가 아니다.
// ADMN-10이 정리(수정·삭제)를 허용하지만, 03-01이 "코드에 물리 삭제 호출이
// 0건"을 검증으로 고정했고, 물리 삭제는 사고 증거를 지운 관리자와 정상
// 운영으로 정리한 관리자를 사후에 구별할 방법을 없앤다. 표시 방식(누가·언제
// 정리했는지 남는 컬럼)은 둘을 구별할 수 있게 남긴다 — 기본 조회는
// prunedAt IS NULL만 보고, 정리 포함 옵션에서만 전체가 보인다.
export const actionLog = pgTable(
  "action_log",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    actorId: text("actor_id").references(() => users.id),
    actorRoleId: text("actor_role_id"),
    actionType: text("action_type").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    documentId: text("document_id"),
    detail: jsonb("detail").notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    prunedAt: timestamp("pruned_at"),
    prunedBy: text("pruned_by"),
  },
  (table) => [
    index("action_log_actor_occurred_idx").on(table.actorId, table.occurredAt),
    index("action_log_type_occurred_idx").on(table.actionType, table.occurredAt),
    index("action_log_document_idx").on(table.documentId),
    index("action_log_pruned_occurred_idx").on(table.prunedAt, table.occurredAt),
  ],
);
