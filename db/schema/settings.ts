import { pgTable, text, jsonb, timestamp, date, uuid, unique, index } from "drizzle-orm/pg-core";

// ADMN-05·06: 설정 두 표. 등록 레지스트리(domain/settings/keys.ts)는 하나이고
// 각 항목이 이력 여부를 메타(kind)로 갖는다(ROADMAP 성공 기준 4) — 값 저장
// 표만 이력형/비이력형 둘로 나눈다. 03-01이 정한 경계(보관함 컬럼·
// customFields는 마스터 성격의 표에만)를 따라 두 표 모두 그 컬럼을 두지
// 않는다 — 이력 표 자체가 append-only라 보관 개념이 필요 없다.
export const settingsSimple = pgTable("settings_simple", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

// effectiveFrom은 string 모드(date SQL 타입, JS Date 변환 없이 'YYYY-MM-DD'
// 문자열 그대로 저장·비교) — 타임존 변환으로 하루가 밀리는 사고를 원천
// 차단한다. 복합 UNIQUE가 같은 키·같은 시작일 중복을 DB 레벨에서 거부한다.
export const settingsHistorized = pgTable(
  "settings_historized",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (table) => [
    unique("settings_historized_key_from_key").on(table.key, table.effectiveFrom),
    index("settings_historized_key_from_idx").on(table.key, table.effectiveFrom),
  ],
);
