import { afterEach, describe, expect, it, vi } from "vitest";

// D8-07 · UI-SPEC 「기록 지점과 설정 무관성」: 세션 생성 훅의 처리 함수는 경로·컨텍스트·로그 설정과
// 무관하게 기록 함수를 한 번 부른다. hooks.ts는 정적 import 사슬로 @/db/client에 닿으므로(Codex 2차 #7),
// 단일 DB 진입점을 「어떤 메서드든 부르면 throw하는」 가짜로 바꿔 주입한 deps 밖으로 DB에 닿지 않음을 증명한다.
const dbTouches = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/db/client", () => {
  const fake = new Proxy(
    {},
    {
      get: () => () => {
        dbTouches.count += 1;
        throw new Error("DB에 닿았다");
      },
    },
  );
  return { db: fake, pool: fake, closeDb: () => Promise.resolve() };
});
vi.mock("@/domain/settings/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/settings/registry")>()),
  getSettingValue: () => {
    throw new Error("설정 조회 실패");
  },
}));

const { recordFirstLogin } = await import("@/domain/auth/hooks");
const { SYSTEM_VIEWER } = await import("@/domain/viewer");
const { log } = await import("@/lib/log");

type HookSession = Parameters<typeof recordFirstLogin>[0];
type HookContext = Parameters<typeof recordFirstLogin>[1];

function session(overrides: Partial<{ userId: string; token: string }> = {}): HookSession {
  const now = new Date();
  return {
    id: "s1",
    userId: overrides.userId ?? "u1",
    token: overrides.token ?? "tok",
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
  } as HookSession;
}

function contextAt(path: string): HookContext {
  return { path };
}

afterEach(() => {
  vi.restoreAllMocks();
  dbTouches.count = 0;
});

describe("recordFirstLogin — 세션 생성 훅 처리 함수(D8-07)", () => {
  it.each([
    ["/callback/google 경로", contextAt("/callback/google")],
    ["null 컨텍스트", null],
    ["/sign-in/email 경로", contextAt("/sign-in/email")],
  ])("%s에서도 기록 함수를 (SYSTEM_VIEWER, userId, Date)로 한 번 부른다 — 로그 설정 조회가 실패해도", async (_label, context) => {
    const setFirstLoginAtIfUnset = vi.fn(() => Promise.resolve());

    await recordFirstLogin(session(), context, { setFirstLoginAtIfUnset });

    expect(setFirstLoginAtIfUnset).toHaveBeenCalledTimes(1);
    expect(setFirstLoginAtIfUnset).toHaveBeenCalledWith(SYSTEM_VIEWER, "u1", expect.any(Date));
    expect(dbTouches.count).toBe(0);
  });

  it("기록 함수가 throw해도 로그인을 막지 않고, userId만 담은 에러 로그를 한 번 남긴다(CEO-2)", async () => {
    const email = "leak-check@example.test";
    const token = "secret-session-token-123";
    const errorSpy = vi.spyOn(log, "error").mockImplementation(() => {});
    const setFirstLoginAtIfUnset = vi.fn(() => Promise.reject(new Error(`duplicate value ${email}`)));

    await expect(recordFirstLogin(session({ token }), null, { setFirstLoginAtIfUnset })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe("auth.first_login_record_failed");
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("u1");
    expect(logged).not.toContain(email);
    expect(logged).not.toContain(token);
    expect(dbTouches.count).toBe(0);
  });
});
