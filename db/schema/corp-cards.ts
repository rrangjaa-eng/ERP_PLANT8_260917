import { pgTable, text, boolean, jsonb, timestamp, uuid, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { teams } from "./org";

// MAST-03: 법인카드 표. 이 시스템은 카드로 결제를 일으키지 않으므로 전체 카드
// 번호가 필요한 기능이 없다 — 발급사(issuer)와 뒤 4자리(numberLast4)만
// 저장한다. 저장하지 않는 데이터는 유출될 수 없다(암호화·마스킹·유출 대응
// 부담을 아예 만들지 않는다). DB는 종류 ↔ 소유 칸 짝(personal = 소지자만 ·
// team = 팀만 · shared = 둘 다 없음 — 공용 카드, Q5 · R-6)을 제약으로 건다.
// 판정 정본은 domain/corp-cards의 cardOwnerKind다.
export const corpCards = pgTable(
  "corp_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuer: text("issuer").notNull(),
    numberLast4: text("number_last4").notNull(),
    label: text("label").notNull(),
    kind: text("kind").notNull(),
    holderUserId: text("holder_user_id").references(() => users.id),
    teamId: uuid("team_id").references(() => teams.id),
    active: boolean("active").notNull().default(true),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("corp_cards_issuer_last4_key").on(table.issuer, table.numberLast4),
    check(
      "corp_cards_owner_kind_check",
      sql`(${table.kind} = 'personal' AND ${table.holderUserId} IS NOT NULL AND ${table.teamId} IS NULL) OR (${table.kind} = 'team' AND ${table.teamId} IS NOT NULL AND ${table.holderUserId} IS NULL) OR (${table.kind} = 'shared' AND ${table.holderUserId} IS NULL AND ${table.teamId} IS NULL)`,
    ),
    // 03-06이 GIN 인덱스를 뒤늦게 채운다(field_definitions 규약이 이제 정해졌다).
    index("corp_cards_custom_fields_idx").using("gin", table.customFields),
  ],
);
