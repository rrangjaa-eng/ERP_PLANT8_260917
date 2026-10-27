import { afterEach, describe, expect, it, vi } from "vitest";

// D-7121 · D-E6: 퇴사 · 보관된 사람의 남은 쿠키는 허용 목록(로그인 · 로그아웃 · 비밀번호 재설정) 밖의 better-auth
// HTTP 엔드포인트에서 거부되고 세션이 지워진다. E-P1-09 · E-P2-30: 서버 내부 auth.api 호출(ctx.request 없음)은
// 판정하지 않는다 — 세션을 읽지도 않으므로 안쪽 호출이 훅을 다시 타도 재귀가 없다.
// hooks.ts는 정적 import 사슬로 @/db/client에 닿는다 — 새 갈래가 DB를 직접 건드리지 않음을 함께 증명한다.
vi.mock("@/db/client", () => {
  const fake = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("DB에 닿았다");
      },
    },
  );
  return { db: fake, pool: fake, closeDb: () => Promise.resolve() };
});
const sessionRead = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("better-auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("better-auth/api")>()),
  getSessionFromCtx: (...args: unknown[]) => sessionRead.fn(...args) as unknown,
}));

const { before, retiredOrArchived } = await import("@/domain/auth/hooks");
const { log } = await import("@/lib/log");

type HookInput = Parameters<typeof before>[0];

function hookCtx(path: string, opts: { request: boolean; deleteUserSessions?: () => Promise<void> }) {
  const deleteUserSessions = vi.fn(opts.deleteUserSessions ?? (() => Promise.resolve()));
  const headers = new Headers({ cookie: "erp.session_token=tok" });
  const input = {
    path,
    headers,
    ...(opts.request ? { request: new Request(`http://127.0.0.1:3000/api/auth${path}`, { headers }) } : {}),
    context: { internalAdapter: { deleteUserSessions }, session: null },
  } as unknown as HookInput;
  return { input, deleteUserSessions };
}

function sessionOf(user: { archivedAt?: Date | null; resignationDate?: string | null }) {
  return { session: { id: "s1", userId: "u1", token: "tok" }, user: { id: "u1", ...user } };
}

afterEach(() => {
  sessionRead.fn.mockReset();
  vi.restoreAllMocks();
});

describe("retiredOrArchived — 퇴사 · 보관 판정 하나(로그인 갈래와 공유)", () => {
  const today = "2026-10-27";
  it.each([
    ["보관됨", { archivedAt: new Date("2026-10-01T00:00:00Z"), resignationDate: null }, true],
    ["퇴사일 어제", { archivedAt: null, resignationDate: "2026-10-26" }, true],
    ["퇴사일 오늘(당일까지 재직)", { archivedAt: null, resignationDate: "2026-10-27" }, false],
    ["퇴사일 내일", { archivedAt: null, resignationDate: "2026-10-28" }, false],
    ["둘 다 없음", { archivedAt: null, resignationDate: null }, false],
    ["필드 없음", {}, false],
  ])("%s → %s", (_label, user, expected) => {
    expect(retiredOrArchived(user, today)).toBe(expected);
  });
});

describe("before 훅 — 퇴사 · 보관 세션 갈래 (D-E6)", () => {
  it.each([
    "/sign-in/social",
    "/callback/:id",
    "/sign-out",
    "/request-password-reset",
    "/reset-password",
    "/reset-password/:token",
  ])("허용 목록 %s → 세션을 읽지 않는다", async (path) => {
    const { input, deleteUserSessions } = hookCtx(path, { request: true });
    await expect(before(input)).resolves.toBeUndefined();
    expect(sessionRead.fn).not.toHaveBeenCalled();
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it.each(["/get-session", "/verify-password", "/update-session", "/list-accounts", "/ok"])(
    "허용 목록 밖 %s · 보관된 사람 → 세션 전부 삭제 · 401",
    async (path) => {
      sessionRead.fn.mockResolvedValue(sessionOf({ archivedAt: new Date() }));
      const { input, deleteUserSessions } = hookCtx(path, { request: true });
      await expect(before(input)).rejects.toMatchObject({ statusCode: 401, body: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      expect(deleteUserSessions).toHaveBeenCalledTimes(1);
      expect(deleteUserSessions).toHaveBeenCalledWith("u1");
    },
  );

  it("세션 읽기는 갱신 없이(disableRefresh) — 판정 읽기가 세션 만료를 늘리지 않는다", async () => {
    sessionRead.fn.mockResolvedValue(null);
    const { input } = hookCtx("/get-session", { request: true });
    await before(input);
    expect(sessionRead.fn).toHaveBeenCalledTimes(1);
    expect(sessionRead.fn.mock.calls[0]?.[1]).toEqual({ disableRefresh: true });
  });

  it("퇴사일 어제 → 401 · 삭제", async () => {
    sessionRead.fn.mockResolvedValue(sessionOf({ resignationDate: "2000-01-01" }));
    const { input, deleteUserSessions } = hookCtx("/change-password", { request: true });
    await expect(before(input)).rejects.toMatchObject({ statusCode: 401 });
    expect(deleteUserSessions).toHaveBeenCalledTimes(1);
  });

  it("재직자 → 통과 · 삭제 없음", async () => {
    sessionRead.fn.mockResolvedValue(sessionOf({ archivedAt: null, resignationDate: "2999-12-31" }));
    const { input, deleteUserSessions } = hookCtx("/get-session", { request: true });
    await expect(before(input)).resolves.toBeUndefined();
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("재직자 판정 읽기가 ctx.context.session에 남긴 캐시를 되돌린다 — 엔드포인트가 세션을 제 방식(갱신 포함)으로 다시 읽는다", async () => {
    const active = sessionOf({ archivedAt: null, resignationDate: null });
    sessionRead.fn.mockImplementation((ctx: { context: { session: unknown } }) => {
      ctx.context.session = active;
      return Promise.resolve(active);
    });
    const { input } = hookCtx("/update-user", { request: true });
    await before(input);
    expect((input as unknown as { context: { session: unknown } }).context.session).toBeNull();
  });

  it("세션 없음(null) → 아무것도 하지 않는다", async () => {
    sessionRead.fn.mockResolvedValue(null);
    const { input, deleteUserSessions } = hookCtx("/verify-password", { request: true });
    await expect(before(input)).resolves.toBeUndefined();
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("E-P1-09: ctx.request 없는 서버 내부 호출 → 세션을 읽지 않고 판정 없이 돌아온다(재귀 없음)", async () => {
    sessionRead.fn.mockResolvedValue(sessionOf({ archivedAt: new Date() }));
    const { input, deleteUserSessions } = hookCtx("/get-session", { request: false });
    await expect(before(input)).resolves.toBeUndefined();
    expect(sessionRead.fn).not.toHaveBeenCalled();
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("세션 삭제가 실패해도 401(fail-closed) · log.error에 userId와 오류 이름만", async () => {
    sessionRead.fn.mockResolvedValue(sessionOf({ archivedAt: new Date() }));
    const error = vi.spyOn(log, "error").mockImplementation(() => undefined);
    const { input } = hookCtx("/list-sessions", {
      request: true,
      deleteUserSessions: () => Promise.reject(new TypeError("연결 끊김")),
    });
    await expect(before(input)).rejects.toMatchObject({ statusCode: 401 });
    expect(error).toHaveBeenCalledWith("auth.retired_session_delete_failed", { userId: "u1", name: "TypeError" });
  });
});
