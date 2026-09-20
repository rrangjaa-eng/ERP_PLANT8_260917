import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { createAccount, resetPassword, unlockAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { resolveOpenFailures } from "@/repositories/login-attempts";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

// domain/auth/hooks.ts의 before 훅이 /sign-in/email에 x-client-ip를 강제한다
// (fail-closed, Eng OV-2) — 이 파일의 모든 sign-in 호출은 이 헤더를 넣는다.
// 각 it 블록은 rateLimit(60초 10회)과 겹치지 않게 서로 다른 IP를 쓴다.
let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  return `192.0.2.${ipCounter}`;
}

describe("domain/auth/accounts + better-auth 통합", () => {
  it("createAccount 뒤 signInEmail이 세션 토큰을 반환한다", async () => {
    const email = uniqueEmail("signin");
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Signin User"
    });

    const result = await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });

    expect(result.token).toBeTruthy();
  });

  it("틀린 비밀번호는 throw한다", async () => {
    const email = uniqueEmail("wrongpw");
    await createAccount(SYSTEM_VIEWER, { email, name: "Wrong PW" });

    await expect(
      auth.api.signInEmail({
        body: { email, password: "not-the-password" },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      }),
    ).rejects.toThrow();
  });

  it("POST /api/auth/sign-up/email은 4xx로 거부된다 (D-11)", async () => {
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: uniqueEmail("signup"),
          password: "password123",
          name: "Should Be Rejected",
        }),
      }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  // 기본 계급(role-pm)에는 사람 메뉴(admin.people) 쓰기 권한이 없다(03-01 시드
  // 값) — 이 거부가 그 시드에 의존한다.
  it("사람 메뉴 쓰기 권한이 없는 viewer로 createAccount를 부르면 throw한다", async () => {
    await expect(
      createAccount(
        { id: "emp", roleId: DEFAULT_ROLE_ID },
        { email: uniqueEmail("forbidden"), name: "Forbidden" },
      ),
    ).rejects.toThrow();
  });

  it("sliding 쿠키 재발급: 방금 만든 세션은 재발급 없음, 2일 지난 세션은 재발급 (D-07)", async () => {
    const email = uniqueEmail("sliding");
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Sliding User"
    });

    const signInResponse = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: nextTestIp() },
        body: JSON.stringify({ email, password: tempPassword }),
      }),
    );

    const setCookies = signInResponse.headers.getSetCookie();
    const sessionSetCookie = setCookies.find((cookie) => cookie.startsWith("erp.session_token="));
    expect(sessionSetCookie).toBeDefined();

    const cookieValue = sessionSetCookie!.split(";")[0]!.slice("erp.session_token=".length);
    const dbToken = decodeURIComponent(cookieValue).split(".")[0]!;

    // 방금 만든 세션(updated_at 현재)으로 get-session을 부르면 set-cookie가 없다.
    const freshResponse = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: `erp.session_token=${cookieValue}` },
      }),
    );
    expect(freshResponse.headers.getSetCookie().length).toBe(0);

    // better-auth의 재발급 판정은 updatedAt이 아니라 expiresAt 기준이다:
    // shouldBeUpdated = expiresAt - expiresIn(30일) + updateAge(1일) <= now.
    // "2일 전에 만든 세션"을 흉내내려면 expiresAt을 원래(now+30일)보다 2일
    // 당긴 now+28일로 되돌린다.
    const twoDaysAgoExpiresAt = new Date(
      Date.now() + 28 * 24 * 60 * 60 * 1000,
    );
    await db
      .update(sessions)
      .set({ expiresAt: twoDaysAgoExpiresAt })
      .where(eq(sessions.token, dbToken));

    const staleResponse = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: `erp.session_token=${cookieValue}` },
      }),
    );
    const staleSetCookies = staleResponse.headers.getSetCookie();
    expect(staleSetCookies.some((cookie) => cookie.startsWith("erp.session_token="))).toBe(true);
  });
});

// AUTH-03·D-10: 관리자 재발급 — 새 임시 비밀번호, 전 세션 만료, password_is_temporary=true.
describe("domain/auth/accounts resetPassword (AUTH-03)", () => {
  it("재발급 뒤 옛 비밀번호는 실패, 새 임시 비밀번호는 성공, 기존 세션은 무효, password_is_temporary=true", async () => {
    const email = uniqueEmail("reset");
    const { tempPassword: oldPassword, userId } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Reset User"
    });

    const signInResponse = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: nextTestIp() },
        body: JSON.stringify({ email, password: oldPassword }),
      }),
    );
    const setCookies = signInResponse.headers.getSetCookie();
    const sessionSetCookie = setCookies.find((cookie) => cookie.startsWith("erp.session_token="));
    const oldSessionCookie = sessionSetCookie!.split(";")[0]!;

    const { tempPassword: newPassword } = await resetPassword(SYSTEM_VIEWER, email);
    expect(newPassword).not.toBe(oldPassword);

    await expect(
      auth.api.signInEmail({
        body: { email, password: oldPassword },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      }),
    ).rejects.toThrow();

    const newSignIn = await auth.api.signInEmail({
      body: { email, password: newPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });
    expect(newSignIn.token).toBeTruthy();

    const oldSessionCheck = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: oldSessionCookie },
      }),
    );
    const oldSessionBody = (await oldSessionCheck.json()) as unknown;
    expect(oldSessionBody).toBeNull();

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.passwordIsTemporary).toBe(true);
  });

  // 기본 계급(role-pm)에는 사람 메뉴(admin.people) 쓰기 권한이 없다(03-01 시드 값).
  it("사람 메뉴 쓰기 권한이 없는 viewer로 resetPassword를 부르면 throw한다", async () => {
    const email = uniqueEmail("reset-forbidden");
    await createAccount(SYSTEM_VIEWER, { email, name: "Forbidden Reset" });

    await expect(resetPassword({ id: "emp", roleId: DEFAULT_ROLE_ID }, email)).rejects.toThrow();
  });

  it("없는 이메일로 resetPassword를 부르면 throw한다", async () => {
    await expect(resetPassword(SYSTEM_VIEWER, uniqueEmail("no-such-user"))).rejects.toThrow();
  });
});

// AUTH-01: 관리자 해제.
describe("domain/auth/accounts unlockAccount (AUTH-01)", () => {
  it("열린 실패 기록 수를 반환하고 admin_unlock으로 닫는다", async () => {
    const email = uniqueEmail("unlock");
    await createAccount(SYSTEM_VIEWER, { email, name: "Unlock User" });

    // login_attempts 표는 domain/auth/hooks.ts가 채우지만, 여기서는 repository를
    // 직접 호출해 열린 실패 행을 만든다(이 테스트는 unlockAccount 자체의 동작만 본다).
    const { recordAttempt } = await import("@/repositories/login-attempts");
    for (let i = 0; i < 3; i++) {
      await recordAttempt(SYSTEM_VIEWER, {
        email,
        success: false,
        ip: "198.51.100.200",
        attemptedAt: new Date(),
      });
    }

    const { resolved } = await unlockAccount(SYSTEM_VIEWER, email);
    expect(resolved).toBe(3);

    const again = await resolveOpenFailures(SYSTEM_VIEWER, email, "admin_unlock");
    expect(again).toBe(0);
  });

  // 기본 계급(role-pm)에는 사람 메뉴(admin.people) 쓰기 권한이 없다(03-01 시드 값).
  it("사람 메뉴 쓰기 권한이 없는 viewer로 unlockAccount를 부르면 throw한다", async () => {
    await expect(
      unlockAccount({ id: "emp", roleId: DEFAULT_ROLE_ID }, uniqueEmail("unlock-forbidden")),
    ).rejects.toThrow();
  });
});
