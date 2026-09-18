import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["DATABASE_URL", "AUTH_PROVIDER", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;

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

describe("getAuthProvider (AUTH-04)", () => {
  it("AUTH_PROVIDER 미설정이면 email이다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    const { getAuthProvider } = await import("@/domain/auth/provider");
    expect(getAuthProvider()).toBe("email");
  });

  it("AUTH_PROVIDER=google + 클라이언트 ID/시크릿이면 google이다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "google";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    const { getAuthProvider } = await import("@/domain/auth/provider");
    expect(getAuthProvider()).toBe("google");
  });

  it("AUTH_PROVIDER=kakao는 env 파싱에서 부팅 실패한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "kakao";
    await expect(import("@/domain/auth/provider")).rejects.toThrow();
  });

  it("lib/auth.ts는 socialProviders를 정확히 한 번만 쓰고 getAuthProvider() === \"google\" 조건을 갖는다(구조 불변)", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/auth.ts"), "utf8");
    const occurrences = source.match(/socialProviders/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(source).toMatch(/getAuthProvider\(\)\s*===\s*["']google["']/);
  });
});
