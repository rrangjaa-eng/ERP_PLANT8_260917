import { describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

async function signIn(email: string, password: string, headers: Record<string, string>): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email, password }),
    }),
  );
}

// Eng Issue 1: rateLimit은 x-client-ip(proxy.ts가 고정한 단일 헤더)만 읽는다 —
// x-forwarded-for를 직접 읽으면 클라이언트가 위조한 항목을 끼워 넣어 우회할 수 있다.
describe("IP 속도 제한 (/sign-in/email)", () => {
  it("같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 부르면 429가 온다", async () => {
    const email = uniqueEmail("ratelimit");
    await createAccount(SYSTEM_VIEWER, { email, name: "Rate Limit", isAdmin: false });
    const ip = "203.0.113.9";

    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await signIn(email, "wrong-password", { "x-client-ip": ip });
    }
    expect(last!.status).toBe(429);
  });

  it("다른 IP의 1회 요청은 429가 아니다", async () => {
    const email = uniqueEmail("ratelimit-other");
    await createAccount(SYSTEM_VIEWER, { email, name: "Rate Limit Other", isAdmin: false });

    const res = await signIn(email, "wrong-password", { "x-client-ip": "203.0.113.10" });
    expect(res.status).not.toBe(429);
  });

  it("x-client-ip 없이 x-forwarded-for만 있으면 500 계열 + auth.client_ip_missing 로그(fail-closed)", async () => {
    const email = uniqueEmail("ratelimit-missing-ip");
    await createAccount(SYSTEM_VIEWER, { email, name: "Missing IP", isAdmin: false });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let response: Response;
    let calls: unknown[][];
    try {
      response = await signIn(email, "wrong-password", { "x-forwarded-for": "203.0.113.9" });
    } finally {
      // mockRestore()는 원래 구현 복원 + mock.calls 초기화까지 함께 하므로,
      // 복원 전에 호출 기록을 먼저 꺼내둔다.
      calls = [...logSpy.mock.calls];
      logSpy.mockRestore();
    }

    expect(response.status).toBeGreaterThanOrEqual(500);
    const missingIpLog = calls.some(
      ([line]) => typeof line === "string" && line.includes('"event":"auth.client_ip_missing"'),
    );
    expect(missingIpLog).toBe(true);
  });
});
