import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { log } from "@/lib/log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { lockoutConfig } from "@/domain/auth/lockout";
import { toKstDate } from "@/domain/holidays/business-day";

// lib/viewer.ts는 server-only · next/headers 사슬이라 그대로는 Vitest에서 못 읽는다 — 둘만 바꿔 끼우고
// getSession() 본문(퇴직 판정)은 실제 코드를 돈다. 요청 헤더는 사례마다 이 변수로 넘긴다.
vi.mock("server-only", () => ({}));
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(request.headers) }));

const { getSession } = await import("@/lib/viewer");

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
const DAY_MS = 24 * 60 * 60 * 1000;

function kstDay(offsetDays: number): string {
  return toKstDate(new Date(Date.now() + offsetDays * DAY_MS));
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

async function person(prefix: string, resignationDate: string | null): Promise<{ email: string; tempPassword: string }> {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "퇴직 시험", roleId: SYSADMIN_ROLE_ID });
  await db.update(users).set({ resignationDate }).where(eq(users.email, email));
  return { email, tempPassword };
}

async function sessionCookie(email: string, password: string, ip: string): Promise<string> {
  const res = await signIn(email, password, ip);
  expect(res.status, "로그인이 성공해야 세션이 생긴다").toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0] ?? "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

// 07-09 D-743: 퇴직일 당일까지 로그인되고, 퇴직일이 오늘(KST)보다 앞이면 새 로그인 · 기존 세션 모두 막힌다.
// 실패 문구는 틀린 비밀번호와 같다(SC-14 — 퇴직 여부를 문구로 드러내지 않는다).
describe("퇴직자 로그인 막기 (D-743)", () => {
  it("퇴직일 어제 → 맞는 비밀번호로도 실패, 상태 · 본문이 틀린 비밀번호 실패와 같다", async () => {
    const retiree = await person("retiree-yesterday", kstDay(-1));
    const active = await person("retiree-control", null);

    const retired = await signIn(retiree.email, retiree.tempPassword, "198.51.100.141");
    const wrong = await signIn(active.email, "wrong-password", "198.51.100.141");

    expect(wrong.status).toBe(401);
    expect(retired.status).toBe(wrong.status);
    expect(await retired.json()).toEqual(await wrong.json());
  });

  it.each([
    ["오늘(당일까지 로그인)", 0],
    ["내일", 1],
  ])("퇴직일 %s → 로그인 성공", async (_label, offset) => {
    const p = await person("retiree-ok", kstDay(offset));
    const res = await signIn(p.email, p.tempPassword, "198.51.100.142");
    expect(res.status).toBe(200);
  });

  it("퇴직일 없음 → 로그인 성공", async () => {
    const p = await person("retiree-none", null);
    const res = await signIn(p.email, p.tempPassword, "198.51.100.143");
    expect(res.status).toBe(200);
  });

  // 사용자 결정 2026-10-22: 퇴직 · 보관 거부도 같은 잠금 계수를 지난다 — 잠기는지로 계정 상태가 드러나지 않게.
  it("퇴직 · 보관 · 재직 · 없는 이메일 네 경우가 같은 횟수에 같은 상태 · 본문", async () => {
    const retiree = await person("retiree-lock", kstDay(-1));
    const archived = await person("archived-lock", null);
    await db.update(users).set({ archivedAt: new Date() }).where(eq(users.email, archived.email));
    const active = await person("active-lock", null);
    const missing = `missing-lock-${randomUUID()}@example.test`;
    const { threshold } = await lockoutConfig();

    const runs = await Promise.all(
      [retiree.email, archived.email, active.email, missing].map(async (email, index) => {
        const steps: { status: number; body: unknown }[] = [];
        for (let i = 0; i < threshold + 1; i++) {
          const res = await signIn(email, "wrong-password", `198.51.100.${150 + index}`);
          steps.push({ status: res.status, body: await res.json() });
        }
        return steps;
      }),
    );

    expect(runs[2]!.map((step) => step.status)).toEqual([...Array<number>(threshold - 1).fill(401), 403, 403]);
    expect(runs[0]).toEqual(runs[2]);
    expect(runs[1]).toEqual(runs[2]);
    expect(runs[3]).toEqual(runs[2]);
  });

  // KST 날짜 경계: UTC 15:00~24:00에는 UTC 날짜가 KST 날짜보다 하루 앞선다 — 퇴직일이 UTC 날짜(= KST 어제)이면 거부.
  it("UTC 16:00(KST 다음 날 01:00)에 퇴직일 = UTC 날짜 → 거부(KST 어제)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-21T16:00:00Z"));
      expect(toKstDate(new Date())).toBe("2026-10-22");
      const retiree = await person("retiree-kst-edge", "2026-10-21");
      const active = await person("retiree-kst-control", null);

      const retired = await signIn(retiree.email, retiree.tempPassword, "198.51.100.148");
      const wrong = await signIn(active.email, "wrong-password", "198.51.100.148");
      expect(wrong.status).toBe(401);
      expect(retired.status).toBe(wrong.status);
      expect(await retired.json()).toEqual(await wrong.json());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("퇴직자의 기존 세션 (D-743 · A-P1-2)", () => {
  it("(전제) 세션 발급 뒤 퇴직일을 넣으면 같은 쿠키의 세션 사용자에 resignationDate가 YYYY-MM-DD 문자열로 실려 온다", async () => {
    const p = await person("retiree-session-field", null);
    const cookie = await sessionCookie(p.email, p.tempPassword, "198.51.100.145");
    const yesterday = kstDay(-1);
    await db.update(users).set({ resignationDate: yesterday }).where(eq(users.email, p.email));

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    const value = (session?.user as unknown as { resignationDate?: unknown } | undefined)?.resignationDate;
    expect(value, "등록하지 않으면 drizzle-adapter가 칸을 싣지 않아 getSession의 판정이 죽은 코드가 된다").toBe(yesterday);
  });

  it("퇴직일 어제인 세션 → getSession() null · 경고 로그 session.resigned_user", async () => {
    const p = await person("retiree-session-cut", null);
    const cookie = await sessionCookie(p.email, p.tempPassword, "198.51.100.146");
    await db.update(users).set({ resignationDate: kstDay(-1) }).where(eq(users.email, p.email));
    const warn = vi.spyOn(log, "warn");

    request.headers = new Headers({ cookie });
    expect(await getSession()).toBeNull();
    expect(warn.mock.calls.some(([event]) => event === "session.resigned_user")).toBe(true);
  });

  it("퇴직일 오늘인 세션 → getSession() 살아 있음", async () => {
    const p = await person("retiree-session-today", null);
    const cookie = await sessionCookie(p.email, p.tempPassword, "198.51.100.147");
    await db.update(users).set({ resignationDate: kstDay(0) }).where(eq(users.email, p.email));

    request.headers = new Headers({ cookie });
    const session = await getSession();
    expect(session?.user.email).toBe(p.email);
  });
});

// 07.1-10 D-7121 · S11 · D-E6 · E-P2-29: better-auth 자체 엔드포인트(HTTP)는 lib/viewer.ts를 지나지 않는다 — 허용 목록
// (로그인 · 로그아웃 · 비밀번호 재설정) 밖이면 훅이 거부하고 그 사람 세션을 전부 지운다. 첫 거부가 세션을 지우므로
// 경로마다 새 사람을 만든다.
// ok: 재직자에게 better-auth가 돌려주는 상태 — update-session은 세션 추가 필드가 없어 빈 본문이 400 「No fields to update」다.
type Call = { label: string; method: "GET" | "POST"; path: string; ok?: number; body?: (p: { email: string; tempPassword: string }) => unknown };
const GATED: Call[] = [
  { label: "change-password", method: "POST", path: "/change-password", body: (p) => ({ currentPassword: p.tempPassword, newPassword: "changed-pass-1234" }) },
  { label: "update-user", method: "POST", path: "/update-user", body: () => ({ name: "바꾼 이름" }) },
  { label: "list-sessions", method: "GET", path: "/list-sessions" },
  { label: "verify-password", method: "POST", path: "/verify-password", body: (p) => ({ password: p.tempPassword }) },
  { label: "update-session", method: "POST", path: "/update-session", ok: 400, body: () => ({}) },
];

function call(c: Call, cookie: string, p: { email: string; tempPassword: string }, ip: string): Promise<Response> {
  const headers: Record<string, string> = { cookie, "x-client-ip": ip, origin: BASE_URL };
  if (c.method === "POST") headers["content-type"] = "application/json";
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${c.path}`, {
      method: c.method,
      headers,
      ...(c.method === "POST" ? { body: JSON.stringify(c.body?.(p) ?? {}) } : {}),
    }),
  );
}

async function sessionRows(email: string): Promise<number> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return (await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user!.id))).length;
}

async function withSession(prefix: string, ip: string): Promise<{ email: string; tempPassword: string; cookie: string }> {
  const p = await person(prefix, null);
  const cookie = await sessionCookie(p.email, p.tempPassword, ip);
  return { ...p, cookie };
}

describe("퇴직 · 보관된 사람의 세션 — better-auth HTTP 엔드포인트 (D-7121 · E-P2-29)", () => {
  it.each(GATED.map((c) => [c.label, c] as const))("퇴직일 어제 → %s 401 · 세션 행 0", async (_label, c) => {
    const p = await withSession(`retiree-http-${c.label}`, "198.51.100.161");
    await db.update(users).set({ resignationDate: kstDay(-1) }).where(eq(users.email, p.email));

    const res = await call(c, p.cookie, p, "198.51.100.161");
    expect(res.status).toBe(401);
    expect(await sessionRows(p.email)).toBe(0);
  });

  it.each(GATED.map((c) => [c.label, c] as const))("보관됨 → %s 401 · 세션 행 0", async (_label, c) => {
    const p = await withSession(`archived-http-${c.label}`, "198.51.100.162");
    await db.update(users).set({ archivedAt: new Date() }).where(eq(users.email, p.email));

    const res = await call(c, p.cookie, p, "198.51.100.162");
    expect(res.status).toBe(401);
    expect(await sessionRows(p.email)).toBe(0);
  });

  it.each(GATED.map((c) => [c.label, c] as const))("퇴직일 내일 → %s 거부 아님 · 세션 행 그대로", async (_label, c) => {
    const p = await withSession(`retiree-tomorrow-${c.label}`, "198.51.100.163");
    await db.update(users).set({ resignationDate: kstDay(1) }).where(eq(users.email, p.email));

    const res = await call(c, p.cookie, p, "198.51.100.163");
    expect(res.status, await res.clone().text()).toBe(c.ok ?? 200);
    expect(await sessionRows(p.email)).toBe(1);
  });

  it("허용 목록: 퇴직자 쿠키로 /sign-out → better-auth 기본 처리(200) · 그 세션 행 없어짐", async () => {
    const p = await withSession("retiree-signout", "198.51.100.164");
    await db.update(users).set({ resignationDate: kstDay(-1) }).where(eq(users.email, p.email));

    const res = await call({ label: "sign-out", method: "POST", path: "/sign-out" }, p.cookie, p, "198.51.100.164");
    expect(res.status).toBe(200);
    expect(await sessionRows(p.email)).toBe(0);
  });

  it("허용 목록: 퇴직자 쿠키로 /request-password-reset → 재직자 쿠키와 같은 상태 · 본문(퇴직 여부가 드러나지 않음)", async () => {
    const retiree = await withSession("retiree-reset", "198.51.100.165");
    await db.update(users).set({ resignationDate: kstDay(-1) }).where(eq(users.email, retiree.email));
    const active = await withSession("active-reset", "198.51.100.165");
    const reset: Call = { label: "request-password-reset", method: "POST", path: "/request-password-reset", body: (p) => ({ email: p.email }) };

    const retired = await call(reset, retiree.cookie, retiree, "198.51.100.165");
    const control = await call(reset, active.cookie, active, "198.51.100.165");
    expect(retired.status).not.toBe(401);
    expect(retired.status).toBe(control.status);
    expect(await retired.json()).toEqual(await control.json());
    expect(await sessionRows(retiree.email)).toBe(1);
  });

  it("앱 경로(E-P1-09): 보관된 세션 → lib/viewer getSession()이 던지지 않고 null · 세션 행 그대로", async () => {
    const p = await withSession("archived-viewer", "198.51.100.166");
    await db.update(users).set({ archivedAt: new Date() }).where(eq(users.email, p.email));

    request.headers = new Headers({ cookie: p.cookie });
    await expect(getSession()).resolves.toBeNull();
    expect(await sessionRows(p.email)).toBe(1);
  });
});
