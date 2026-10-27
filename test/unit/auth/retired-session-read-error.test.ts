import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

// PR #307 검토 P2: 퇴사 · 보관 세션 판정의 세션 읽기가 DB 오류를 삼키면(better-auth getSessionFromCtx의
// .catch(() => null)) 판정 없이 통과한다 — 엔드포인트의 sessionMiddleware가 다시 읽어 성공하면 퇴사자의 쿠키로
// 응답이 나간다. 실물 better-auth(메모리 어댑터)에 hooks.ts의 before만 걸고, 세션 행 읽기를 한 번만 실패시켜 잰다.
// hooks.ts는 정적 import 사슬로 @/db/client에 닿는다 — 이 갈래가 앱 DB를 건드리지 않음을 함께 증명한다.
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

const { before } = await import("@/domain/auth/hooks");

type Store = Record<string, Record<string, unknown>[]>;

function makeAuth() {
  const store: Store = { user: [], session: [], account: [], verification: [] };
  const sessionReads = { failNext: 0, count: 0 };
  const base = memoryAdapter(store);
  const database: typeof base = (options) => {
    const adapter = base(options);
    return {
      ...adapter,
      findOne: (args) => {
        if (args.model === "session") {
          sessionReads.count += 1;
          if (sessionReads.failNext > 0) {
            sessionReads.failNext -= 1;
            return Promise.reject(new Error("connection terminated"));
          }
        }
        return adapter.findOne(args);
      },
    };
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-test-secret-test-secret-0000",
    database,
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        archivedAt: { type: "date", required: false, input: false },
        resignationDate: { type: "string", required: false, input: false },
      },
    },
    hooks: { before },
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
  return { auth, store, sessionReads };
}

async function signedUpCookie(auth: ReturnType<typeof makeAuth>["auth"]): Promise<string> {
  const { headers } = await auth.api.signUpEmail({
    body: { email: "retired@example.com", password: "password-1234", name: "퇴사자" },
    returnHeaders: true,
  });
  const setCookie = headers.get("set-cookie") ?? "";
  const token = /(better-auth\.session_token=[^;]+)/.exec(setCookie)?.[1];
  if (!token) throw new Error("세션 쿠키가 없다");
  return token;
}

function get(auth: ReturnType<typeof makeAuth>["auth"], path: string, cookie?: string): Promise<Response> {
  return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { headers: cookie ? { cookie } : {} }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("퇴사 · 보관 세션 판정 — 세션 읽기 오류 (PR #307 P2)", () => {
  it("쿠키가 있는데 판정 읽기가 실패하면 401 — 엔드포인트의 다시 읽기가 성공해도 퇴사자 응답이 나가지 않는다", async () => {
    const { auth, store, sessionReads } = makeAuth();
    const cookie = await signedUpCookie(auth);
    store.user[0]!.archivedAt = new Date();
    sessionReads.failNext = 1;

    const res = await get(auth, "/list-sessions", cookie);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });
  });

  it("판정 읽기 실패는 log.error에 오류 이름만 남긴다(값 없음)", async () => {
    const { auth, sessionReads } = makeAuth();
    const cookie = await signedUpCookie(auth);
    const { log } = await import("@/lib/log");
    const error = vi.spyOn(log, "error").mockImplementation(() => undefined);
    sessionReads.failNext = 1;

    await get(auth, "/list-sessions", cookie);

    expect(error).toHaveBeenCalledWith("auth.retired_session_read_failed", { path: "/list-sessions", name: "APIError" });
  });

  it("비로그인(쿠키 없음) 요청은 세션 행을 읽지 않고 통과한다", async () => {
    const { auth, sessionReads } = makeAuth();

    const res = await get(auth, "/ok");

    expect(res.status).toBe(200);
    expect(sessionReads.count).toBe(0);
  });

  it("지워진 세션의 낡은 쿠키는 막지 않는다 — /get-session이 그대로 null", async () => {
    const { auth, store } = makeAuth();
    const cookie = await signedUpCookie(auth);
    store.session.length = 0;

    const res = await get(auth, "/get-session", cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("재직자는 판정 읽기 뒤에도 엔드포인트가 정상 응답한다", async () => {
    const { auth } = makeAuth();
    const cookie = await signedUpCookie(auth);

    const res = await get(auth, "/list-sessions", cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("보관된 사람은 읽기 오류 없이도 401 · 세션 전부 삭제(실물 경로)", async () => {
    const { auth, store } = makeAuth();
    const cookie = await signedUpCookie(auth);
    store.user[0]!.archivedAt = new Date();

    const res = await get(auth, "/list-sessions", cookie);

    expect(res.status).toBe(401);
    expect(store.session).toHaveLength(0);
  });
});
