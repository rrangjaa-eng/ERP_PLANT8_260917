import { pgTable, text, timestamp, boolean, integer, bigint } from "drizzle-orm/pg-core";
import { roles } from "./roles";

// better-auth 1.7 core 스키마(node_modules/better-auth 문서 concepts/database 필드명 그대로) +
// 이 프로젝트 확장(D-14 is_admin, D-08 password_is_temporary). 테이블 이름은 복수형
// (Postgres 예약어 "user" 회피, 되돌리기 비용 costly — SKELETON.md).

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // D-14: Phase 1의 계급은 관리자/직원 둘뿐 — is_admin 하나. Phase 3(Task 1 결정
  // ③)가 계급 5종(role_id)으로 교체하되 이 컬럼은 드롭하지 않는다 —
  // .squawk.toml의 ban-drop-column이 예외 목록에 없어 DROP COLUMN이 거부된다
  // (03-RESEARCH.md §3 실측). 코드는 더 이상 이 컬럼을 읽지 않는다(03-02가 "참조
  // 0" 메타 테스트로 고정한다).
  isAdmin: boolean("is_admin").notNull().default(false),
  // Phase 3: 계급 5종 외래키. nullable — 값이 없는 행의 판정은 fail-closed(can()이
  // 즉시 false).
  roleId: text("role_id").references(() => roles.id),
  // D-08: 관리자가 발급·재발급한 초기 비밀번호를 쓰고 있다는 표시. 본인이 바꾸면 해제.
  passwordIsTemporary: boolean("password_is_temporary").notNull().default(false),
  // Phase 3(03-05): 사람은 마스터(MAST-02)라 03-01이 정한 경계(보관함 컬럼은
  // 마스터 성격의 표에만)에 해당한다. 사람 목록의 행 필터, 사람 등록 실패 시
  // 보상 조치, 03-07의 사람 화면 "삭제"(보관)가 전부 이 두 컬럼을 쓴다.
  // customFields는 두지 않는다 — better-auth가 소유하는 표에 확장 가방을
  // 얹는 것은 Phase 10의 커스텀 필드 관리 화면이 대상 표를 정할 때 다시 본다.
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// better-auth rateLimit(storage: "database") 저장소. key가 기본키. better-auth
// 1.7.5는 이 모델에도 다른 모델과 같은 id 생성기를 적용해 실제로 문자열 id를
// 만들어 insert에 넣는다(schema-diff.mjs가 모든 테이블에 id 컬럼을 요구하는 이유와
// 같은 실측 — 01-02에서 rateLimit.storage: "database"를 처음 켜며 확인. uuid
// 타입으로 두면 better-auth가 생성한 비-uuid 문자열이 22P02로 거부된다).
export const rateLimits = pgTable("rate_limits", {
  id: text("id").notNull(),
  key: text("key").primaryKey(),
  count: integer("count"),
  lastRequest: bigint("last_request", { mode: "number" }),
});
