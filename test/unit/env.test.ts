import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// NODE_ENV는 next의 전역 타입이 readonly로 선언하고 있고, 이 테스트가 다루는
// 어떤 동작도 NODE_ENV 값에 의존하지 않는다(vitest가 이미 'test'로 둔다) — 저장
// 대상에서 제외한다.
const ENV_KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "CLOUD_SQL_CONNECTION_NAME",
  "DB_IAM_USER",
  "DB_NAME",
  "DB_POOL_MAX",
  "DB_ADMIN_PASSWORD",
  "DB_ADMIN_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "AUTH_PROVIDER",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LOCKOUT_THRESHOLD",
  "LOCKOUT_WINDOW_MINUTES",
  "RATE_LIMIT_LOGIN_MAX",
  "APP_DATA_KEY_v1",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "GCP_PROJECT_ID",
  "CLOUD_SQL_INSTANCE_ID",
  "APP_GIT_SHA",
  "APP_DEPLOYED_AT",
  "MAX_INSTANCES",
  "STATUS_CONN_BANNER_RATIO",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("lib/env", () => {
  it("기본값: DATABASE_URL만으로 파싱 성공한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    const { env } = await import("@/lib/env");

    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(env.BETTER_AUTH_URL).toBeUndefined();
    expect(env.APP_ENV).toBe("local");
    expect(env.AUTH_PROVIDER).toBe("email");
    expect(env.LOCKOUT_THRESHOLD).toBe(5);
    expect(env.LOCKOUT_WINDOW_MINUTES).toBe(15);
    expect(env.DB_POOL_MAX).toBe(5);
    expect(env.STATUS_CONN_BANNER_RATIO).toBe(0.8);
  });

  it("__unset__ 값은 undefined로 정규화된다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.SMTP_HOST = "__unset__";
    const { env } = await import("@/lib/env");

    expect(env.SMTP_HOST).toBeUndefined();
  });

  it("AUTH_PROVIDER=google인데 GOOGLE_CLIENT_ID가 없으면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "google";

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("APP_ENV=staging에 BETTER_AUTH_SECRET이 31자면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(31);
    process.env.BETTER_AUTH_URL = "https://example.com";

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("APP_ENV=staging에 BETTER_AUTH_URL이 없으면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("에러 메시지는 키 이름만 담고 값은 담지 않는다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "google";
    process.env.GOOGLE_CLIENT_ID = "super-secret-client-id-value";

    let message = "";
    try {
      await import("@/lib/env");
      throw new Error("import(@/lib/env)가 throw해야 한다");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("super-secret-client-id-value");
  });
});
