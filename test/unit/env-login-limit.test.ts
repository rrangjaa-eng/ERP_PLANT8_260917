import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 07-09 D-723: 로그인 IP 한도 기본값은 IP당 분당 60 — 운영 값은 배포 환경 변수 RATE_LIMIT_LOGIN_MAX.
// test/unit/env.test.ts처럼 환경 값만 바꿔 파서를 다시 읽는다.
const KEYS = ["DATABASE_URL", "RATE_LIMIT_LOGIN_MAX"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("RATE_LIMIT_LOGIN_MAX (D-723)", () => {
  it("환경 변수가 없으면 60", async () => {
    const { env } = await import("@/lib/env");
    expect(env.RATE_LIMIT_LOGIN_MAX).toBe(60);
  });

  it("RATE_LIMIT_LOGIN_MAX=25면 25", async () => {
    process.env.RATE_LIMIT_LOGIN_MAX = "25";
    const { env } = await import("@/lib/env");
    expect(env.RATE_LIMIT_LOGIN_MAX).toBe(25);
  });
});
