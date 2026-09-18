import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
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
      name: "Signin User",
      isAdmin: false,
    });

    const result = await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });

    expect(result.token).toBeTruthy();
  });

  it("틀린 비밀번호는 throw한다", async () => {
    const email = uniqueEmail("wrongpw");
    await createAccount(SYSTEM_VIEWER, { email, name: "Wrong PW", isAdmin: false });

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

  it("관리자가 아닌 viewer로 createAccount를 부르면 throw한다", async () => {
    await expect(
      createAccount(
        { id: "emp", isAdmin: false },
        { email: uniqueEmail("forbidden"), name: "Forbidden", isAdmin: false },
      ),
    ).rejects.toThrow();
  });

  it("sliding 쿠키 재발급: 방금 만든 세션은 재발급 없음, 2일 지난 세션은 재발급 (D-07)", async () => {
    const email = uniqueEmail("sliding");
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Sliding User",
      isAdmin: false,
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
