import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { pool } from "@/db/client";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { log } from "@/lib/log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount, resetPassword } from "@/domain/auth/accounts";
import { finalizePasswordChange } from "@/domain/auth/password";
import { recordFirstLogin } from "@/domain/auth/hooks";
import { archivePerson } from "@/domain/people";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";

// CEO-2: 기록 실패를 흉내 낼 스위치. 꺼져 있으면 실제 리포지토리 함수를 그대로 부른다.
const failRecord = vi.hoisted(() => ({ on: false }));
vi.mock("@/repositories/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/users")>();
  return {
    ...actual,
    setFirstLoginAtIfUnset: (...args: Parameters<typeof actual.setFirstLoginAtIfUnset>) => {
      if (failRecord.on) return Promise.reject(new Error("기록 실패 흉내"));
      return actual.setFirstLoginAtIfUnset(...args);
    },
  };
});

// D8-07 · Codex #18: 실제 better-auth 로그인 → 세션 생성 훅(databaseHooks.session.create.after)을 지나
// first_login_at이 성공한 첫 세션에서만 한 번 채워지고, 그 뒤 어떤 일에도 바뀌지 않음을 고정한다.

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  return `198.51.100.${10 + ipCounter}`;
}

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

// 실패 경로도 Response로 받으려고 auth.handler를 직접 부른다(lockout.test.ts와 같은 모양 — 훅·rateLimit 모두 실제로 돈다).
function signIn(email: string, password: string): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: nextTestIp() },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function firstLoginAt(userId: string): Promise<Date | null> {
  const result = await pool.query<{ first_login_at: Date | null }>("select first_login_at from users where id = $1", [userId]);
  return result.rows[0]?.first_login_at ?? null;
}

async function newAccount(prefix: string): Promise<{ userId: string; email: string; tempPassword: string }> {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return { userId, email, tempPassword };
}

afterEach(() => {
  failRecord.on = false;
  vi.restoreAllMocks();
});

describe("첫 로그인 기록 — 실제 better-auth 훅(D8-07)", () => {
  it("틀린 비밀번호 로그인은 세션이 없으니 NULL로 남는다", async () => {
    const { userId, email } = await newAccount("wrong-pw");
    const res = await signIn(email, "wrong-password");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await firstLoginAt(userId)).toBeNull();
  });

  it("잠긴 계정의 올바른 비밀번호 시도도 NULL로 남는다", async () => {
    const { userId, email, tempPassword } = await newAccount("locked");
    for (let i = 0; i < 5; i++) await signIn(email, "wrong-password");
    const res = await signIn(email, tempPassword);
    expect(res.status).toBe(403);
    expect(await firstLoginAt(userId)).toBeNull();
  });

  it("보관된 계정의 로그인 시도는 NULL로 남는다", async () => {
    const { userId, email, tempPassword } = await newAccount("archived");
    await archivePerson(SYSTEM_VIEWER, userId);
    const res = await signIn(email, tempPassword);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await firstLoginAt(userId)).toBeNull();
  });

  it("성공한 첫 로그인이 채우고, 두 번째 로그인·로그아웃·비밀번호 변경·재발급은 값을 바꾸지 않는다", async () => {
    const { userId, email, tempPassword } = await newAccount("success");
    const before = new Date();
    const first = await signIn(email, tempPassword);
    expect(first.status).toBe(200);
    const recorded = await firstLoginAt(userId);
    expect(recorded).not.toBeNull();
    expect(recorded!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(recorded!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const second = await signIn(email, tempPassword);
    expect(second.status).toBe(200);
    expect(await firstLoginAt(userId)).toEqual(recorded);

    const cookie = (second.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect(await firstLoginAt(userId)).toEqual(recorded);

    await finalizePasswordChange(SYSTEM_VIEWER, userId);
    expect(await firstLoginAt(userId)).toEqual(recorded);

    const { tempPassword: reissued } = await resetPassword(SYSTEM_VIEWER, email);
    expect(await firstLoginAt(userId)).toEqual(recorded);
    expect((await signIn(email, reissued)).status).toBe(200);
    expect(await firstLoginAt(userId)).toEqual(recorded);
  });

  it("로그인 로그를 꺼도(action_log login 행 0개) 값은 채워진다", async () => {
    const withoutLogin = ACTION_LOG_OPTIONAL_TYPES.default!.filter((type) => type !== "login");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, withoutLogin);
    const { userId, email, tempPassword } = await newAccount("log-off");

    expect((await signIn(email, tempPassword)).status).toBe(200);

    const logins = await pool.query("select 1 from action_log where action_type = 'login' and actor_id = $1", [userId]);
    expect(logins.rowCount).toBe(0);
    expect(await firstLoginAt(userId)).not.toBeNull();
  });

  it("처리 함수를 /callback/google 컨텍스트로 직접 불러도 채우고, 다시 불러도 값이 그대로다", async () => {
    const { userId } = await newAccount("google");
    const now = new Date();
    const session = { id: randomUUID(), userId, token: randomUUID(), expiresAt: now, createdAt: now, updatedAt: now };
    const context = { path: "/callback/google" };

    await recordFirstLogin(session, context);
    const recorded = await firstLoginAt(userId);
    expect(recorded).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordFirstLogin(session, context);
    expect(await firstLoginAt(userId)).toEqual(recorded);
  });

  it("기록이 실패해도 로그인은 성공하고 에러 로그를 남기며, 다음 로그인에서 스스로 채워진다(CEO-2)", async () => {
    const { userId, email, tempPassword } = await newAccount("record-fail");
    const errorSpy = vi.spyOn(log, "error").mockImplementation(() => {});
    failRecord.on = true;

    const res = await signIn(email, tempPassword);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeTruthy();
    expect(await firstLoginAt(userId)).toBeNull();
    expect(errorSpy.mock.calls.filter(([event]) => event === "auth.first_login_record_failed")).toHaveLength(1);

    failRecord.on = false;
    expect((await signIn(email, tempPassword)).status).toBe(200);
    expect(await firstLoginAt(userId)).not.toBeNull();
  });
});
