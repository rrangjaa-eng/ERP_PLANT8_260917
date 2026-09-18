import { pgTable, text, timestamp, boolean, integer, bigint } from "drizzle-orm/pg-core";

// better-auth 1.7 core 스키마(node_modules/better-auth 문서 concepts/database 필드명 그대로) +
// 이 프로젝트 확장(D-14 is_admin, D-08 password_is_temporary). 테이블 이름은 복수형
// (Postgres 예약어 "user" 회피, 되돌리기 비용 costly — SKELETON.md).

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // D-14: Phase 1의 계급은 관리자/직원 둘뿐 — is_admin 하나. Phase 3가 계급 5종으로 교체.
  isAdmin: boolean("is_admin").notNull().default(false),
  // D-08: 관리자가 발급·재발급한 초기 비밀번호를 쓰고 있다는 표시. 본인이 바꾸면 해제.
  passwordIsTemporary: boolean("password_is_temporary").notNull().default(false),
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

// better-auth rateLimit(storage: "database") 저장소. key가 기본키.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count"),
  lastRequest: bigint("last_request", { mode: "number" }),
});
