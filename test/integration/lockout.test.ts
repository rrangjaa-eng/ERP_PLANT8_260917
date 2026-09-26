import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import { createAccount, unlockAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { backdateOpenFailures, countOpenFailures } from "@/repositories/login-attempts";
import { lockoutConfig, windowStart } from "@/domain/auth/lockout";
import { setSettingValue } from "@/domain/settings/registry";
import { AUTH_LOCKOUT_WINDOW_MINUTES } from "@/domain/settings/keys";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

async function signIn(email: string, password: string, ip: string): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

// 통합 테스트는 auth.handler를 직접 호출한다(rateLimit·훅 모두 실제로 돈다).
// beforeEach TRUNCATE(test/integration/setup.ts)가 rate_limits·login_attempts를
// 매 테스트 전에 비우므로 블록 간 누적은 없다 — 그래도 각 블록은 고유한
// x-client-ip를 쓰고 블록당 sign-in 10회 이하로 RATE_LIMIT_LOGIN_MAX(10)와
// 겹치지 않게 한다.
describe("계정 잠금 (login_attempts)", () => {
  it("A: 5회 실패 → 6회째 거부 → 창 만료 뒤 성공 → 열린 실패 0", async () => {
    const email = uniqueEmail("lockout-a");
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Lockout A"
    });
    const ip = "198.51.100.1";

    for (let i = 0; i < 5; i++) {
      const res = await signIn(email, "wrong-password", ip);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    const sixth = await signIn(email, tempPassword, ip);
    expect(sixth.status).toBe(403);

    await backdateOpenFailures(SYSTEM_VIEWER, email, new Date(Date.now() - 16 * 60_000));

    const afterWindowExpired = await signIn(email, tempPassword, ip);
    expect(afterWindowExpired.status).toBe(200);

    // 15는 시드 기본값(auth.lockout.window_minutes, 03-04)에 의존한다 — 이
    // 값이 env.LOCKOUT_WINDOW_MINUTES와 같아 이 리터럴은 이 플랜이 옮기지
    // 않는다.
    const openCount = await countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), 15));
    expect(openCount).toBe(0);
  });

  it("B: 5회 실패 → 잠금 → unlockAccount → 즉시 로그인 성공(resolved_reason=admin_unlock)", async () => {
    const email = uniqueEmail("lockout-b");
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "Lockout B"
    });
    const ip = "198.51.100.2";

    for (let i = 0; i < 5; i++) {
      await signIn(email, "wrong-password", ip);
    }

    const locked = await signIn(email, tempPassword, ip);
    expect(locked.status).toBe(403);

    const { resolved } = await unlockAccount(SYSTEM_VIEWER, email);
    expect(resolved).toBe(5);

    const afterUnlock = await signIn(email, tempPassword, ip);
    expect(afterUnlock.status).toBe(200);

    const rows = await db
      .select()
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.resolvedReason, "admin_unlock")));
    expect(rows.length).toBe(5);
  });

  it("C: 존재하지 않는 이메일도 6회째에 같은 잠금 문구로 거부된다(존재 여부 비노출)", async () => {
    const email = uniqueEmail("lockout-c-nonexistent");
    const ip = "198.51.100.3";

    for (let i = 0; i < 5; i++) {
      const res = await signIn(email, "wrong-password", ip);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    const sixth = await signIn(email, "wrong-password", ip);
    expect(sixth.status).toBe(403);
    const body = (await sixth.json()) as { message?: string };
    expect(body.message).toContain("로그인 시도가 너무 많습니다");
  });

  it("D: 5회째 실패에 auth.lockout 이벤트가 정확히 1회, ip는 보낸 x-client-ip와 같다", async () => {
    const email = uniqueEmail("lockout-d");
    await createAccount(SYSTEM_VIEWER, { email, name: "Lockout D" });
    const ip = "198.51.100.4";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let calls: unknown[][];
    try {
      for (let i = 0; i < 5; i++) {
        await signIn(email, "wrong-password", ip);
      }
    } finally {
      // mockRestore()는 원래 구현 복원 + mock.calls 초기화까지 함께 하므로,
      // 복원 전에 호출 기록을 먼저 꺼내둔다.
      calls = [...logSpy.mock.calls];
      logSpy.mockRestore();
    }

    const lockoutLogs = calls.filter(
      ([line]) => typeof line === "string" && line.includes('"event":"auth.lockout"'),
    );
    expect(lockoutLogs.length).toBe(1);

    const [row] = await db
      .select()
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, email), isNull(loginAttempts.resolvedAt)));
    expect(row?.ip).toBe(ip);
  });

  // 04.2-03: 잠금 문구의 분 숫자는 설정 auth.lockout.window_minutes를 읽는다.
  it("E: 잠금 시간 설정을 20분으로 바꾸면 잠금 403 문구가 20분이고, 잠기지 않은 실패에는 잠금 문구가 없다", async () => {
    const email = uniqueEmail("lockout-e");
    const ip = "198.51.100.5";
    const defaultMinutes = AUTH_LOCKOUT_WINDOW_MINUTES.default!;
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_WINDOW_MINUTES, 20);
    try {
      const { threshold } = await lockoutConfig();
      for (let i = 0; i < threshold; i++) {
        const res = await signIn(email, "wrong-password", ip);
        const body = (await res.json()) as { message?: string };
        expect(body.message ?? "").not.toContain("로그인 시도가 너무 많습니다");
      }

      const locked = await signIn(email, "wrong-password", ip);
      expect(locked.status).toBe(403);
      const body = (await locked.json()) as { message?: string };
      expect(body.message).toBe("로그인 시도가 너무 많습니다. 20분 뒤 다시 시도하거나 관리자에게 문의하세요.");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_WINDOW_MINUTES, defaultMinutes);
    }
  });

  it("F: 설정이 기본값이면 잠금 문구의 분 숫자가 기본값과 같다", async () => {
    const email = uniqueEmail("lockout-f");
    const ip = "198.51.100.6";
    const { threshold, windowMinutes } = await lockoutConfig();
    expect(windowMinutes).toBe(AUTH_LOCKOUT_WINDOW_MINUTES.default);
    for (let i = 0; i < threshold; i++) {
      await signIn(email, "wrong-password", ip);
    }
    const locked = await signIn(email, "wrong-password", ip);
    expect(locked.status).toBe(403);
    const body = (await locked.json()) as { message?: string };
    expect(body.message).toBe(
      `로그인 시도가 너무 많습니다. ${windowMinutes}분 뒤 다시 시도하거나 관리자에게 문의하세요.`,
    );
  });
});
