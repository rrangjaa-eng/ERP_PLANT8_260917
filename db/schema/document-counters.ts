import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// ROADMAP 트레일링 스키마 규약 — 문서 번호 카운터 표의 규약만 여기서 세운다.
// **실제 번호 부여(증가 함수)와 행 잠금은 Phase 4다** — 이 표는 그 전까지
// 표와 복합 기본키 규약만 존재한다. counterKey는 문서 종류(예: "expense" ·
// "purchase_request"), period는 순번 범위의 구분자(연도 등 — 전사 범위는
// 고정 문자열)다. (counterKey, period) 복합 PK가 "같은 카운터·같은 기간은
// 한 행"을 DB 레벨에서 보장한다.
export const documentCounters = pgTable(
  "document_counters",
  {
    counterKey: text("counter_key").notNull(),
    period: text("period").notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.counterKey, table.period] })],
);
