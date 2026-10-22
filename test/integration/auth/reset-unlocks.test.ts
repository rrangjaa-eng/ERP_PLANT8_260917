import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { loginAttempts, users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { createAccount, resetPassword, unlockAccount } from "@/domain/auth/accounts";
import { lockoutConfig, recordLoginFailure, windowStart } from "@/domain/auth/lockout";
import { countOpenFailures } from "@/repositories/login-attempts";
import { queryActionLog } from "@/repositories/action-log";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";
import { makePerson } from "../approvals-fixtures";
import { makeDelegatedRole } from "../admin-cap-fixtures";

// 07-09 G38 · K33 · A-P2-8: 관리자 비밀번호 초기화가 상한 판정 뒤 잠금을 풀고 끌 수 없는 password_reset을 남긴다.
// 단계 순서 ① 권한 ② 대상 ③ 상한 ④ 외부(updatePassword → deleteUserSessions → setPasswordTemporary)
// ⑤ tx { 잠금 해소(admin_reset) + password_reset } — 단계별 실패 결과를 사례로 고정한다.

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

async function signIn(email: string, password: string, ip: string): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

type Target = { email: string; userId: string; password: string; cookie: string };

// 대상 한 사람: 로그인해 세션 하나를 만들고(쿠키), 잠금 임계만큼 실패를 쌓는다(recordLoginFailure 직접 — rate limit 밖).
async function lockedTarget(prefix: string, roleId: string, ip: string): Promise<Target> {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "초기화 대상", roleId });
  const res = await signIn(email, tempPassword, ip);
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0] ?? "";
  const { threshold } = await lockoutConfig();
  for (let i = 0; i < threshold; i++) await recordLoginFailure(email, ip);
  return { email, userId, password: tempPassword, cookie };
}

async function openFailures(email: string): Promise<number> {
  const { windowMinutes } = await lockoutConfig();
  return countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
}

async function logsFor(actionType: string, userId: string) {
  return (await queryActionLog(SYSTEM_VIEWER, { actionType })).filter((row) => row.entityId === userId);
}

async function sessionAlive(cookie: string): Promise<boolean> {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return Boolean(session?.user);
}

async function sysadmin(): Promise<Viewer> {
  return makePerson("초기화 관리자", SYSADMIN_ROLE_ID, null);
}

// 위임 계급 = PM 칸 · 범위 복사 + admin.people 보기 · 쓰기(admin-cap-ceiling.test.ts와 같은 꼴).
async function delegate(): Promise<Viewer> {
  return makePerson("위임 D", await makeDelegatedRole({ copyFrom: [DEFAULT_ROLE_ID] }), null);
}

// 바뀌지 않았음: 잠금 · 로그 · 세션 그대로, 옛 비밀번호 그대로.
async function expectUntouched(t: Target): Promise<void> {
  const { threshold } = await lockoutConfig();
  expect(await openFailures(t.email)).toBe(threshold);
  expect(await logsFor("password_reset", t.userId)).toHaveLength(0);
  expect(await sessionAlive(t.cookie)).toBe(true);
  // 잠긴 채라 로그인 대신 해시 대조로 옛 비밀번호가 그대로인지 본다.
  const [account] = await db.query.accounts.findMany({ where: (a, { eq: eqOp }) => eqOp(a.userId, t.userId) });
  const ctx = await auth.$context;
  expect(await ctx.password.verify({ hash: account!.password!, password: t.password })).toBe(true);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, ACTION_LOG_OPTIONAL_TYPES.default!);
});

describe("비밀번호 초기화가 잠금도 푼다 (G38 · K33)", () => {
  it("성공 → 열린 실패 0(admin_reset) · 새 임시 비밀번호로 로그인 · password_reset 1행(설정 꺼도) · 값은 로그 어디에도 없다", async () => {
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);
    const admin = await sysadmin();
    const t = await lockedTarget("reset-ok", DEFAULT_ROLE_ID, "198.51.100.151");
    const { threshold } = await lockoutConfig();
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    const { tempPassword } = await resetPassword(admin, t.email);
    spy.mockRestore();

    expect(await openFailures(t.email)).toBe(0);
    const resolved = await db
      .select()
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, t.email), eq(loginAttempts.resolvedReason, "admin_reset")));
    expect(resolved).toHaveLength(threshold);

    const rows = await logsFor("password_reset", t.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(admin.id);
    expect(rows[0]?.entity).toBe("user");
    expect(JSON.stringify(rows[0]?.detail)).not.toContain(tempPassword);
    expect(lines.some((line) => line.includes(tempPassword))).toBe(false);

    expect(await sessionAlive(t.cookie)).toBe(false);
    expect((await signIn(t.email, tempPassword, "198.51.100.151")).status).toBe(200);
  });

  it("① 권한 없음 → UserFacingError · 아무것도 안 바뀜", async () => {
    const t = await lockedTarget("reset-noperm", DEFAULT_ROLE_ID, "198.51.100.152");
    const pm = await makePerson("PM", DEFAULT_ROLE_ID, null);
    await expect(resetPassword(pm, t.email)).rejects.toBeInstanceOf(UserFacingError);
    await expectUntouched(t);
  });

  it("② 없는 대상 → UserFacingError", async () => {
    await expect(resetPassword(SYSTEM_VIEWER, `nobody-${randomUUID()}@example.test`)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("③ 위임자가 상한 밖(시스템 관리자)을 초기화 → RoleGrantForbiddenError · 아무것도 안 바뀜", async () => {
    const d = await delegate();
    const t = await lockedTarget("reset-ceiling", SYSADMIN_ROLE_ID, "198.51.100.153");
    await expect(resetPassword(d, t.email)).rejects.toBeInstanceOf(RoleGrantForbiddenError);
    await expectUntouched(t);
  });

  it("③ 위임자가 상한 안(PM)을 초기화 → 성공 · password_reset 행위자 = 위임자", async () => {
    const d = await delegate();
    const t = await lockedTarget("reset-in-ceiling", DEFAULT_ROLE_ID, "198.51.100.154");
    await resetPassword(d, t.email);
    expect(await openFailures(t.email)).toBe(0);
    const rows = await logsFor("password_reset", t.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(d.id);
  });

  it("④ updatePassword 실패 → 오류가 호출자에게 · 아무것도 안 바뀜", async () => {
    const t = await lockedTarget("reset-update-fail", DEFAULT_ROLE_ID, "198.51.100.155");
    await expect(
      resetPassword(SYSTEM_VIEWER, t.email, { updatePassword: () => Promise.reject(new Error("비밀번호 쓰기 실패")) }),
    ).rejects.toThrow("비밀번호 쓰기 실패");
    await expectUntouched(t);
  });

  it("④ 세션 삭제 실패 → 오류가 호출자에게 · 비밀번호만 새 값 · 잠금 · 로그 그대로 · 다시 초기화하면 정상 완료", async () => {
    const t = await lockedTarget("reset-session-fail", DEFAULT_ROLE_ID, "198.51.100.156");
    const { threshold } = await lockoutConfig();

    await expect(
      resetPassword(SYSTEM_VIEWER, t.email, { deleteUserSessions: () => Promise.reject(new Error("세션 삭제 실패")) }),
    ).rejects.toThrow("세션 삭제 실패");

    expect(await openFailures(t.email)).toBe(threshold);
    expect(await logsFor("password_reset", t.userId)).toHaveLength(0);
    const [account] = await db.query.accounts.findMany({ where: (a, { eq: eqOp }) => eqOp(a.userId, t.userId) });
    const ctx = await auth.$context;
    expect(await ctx.password.verify({ hash: account!.password!, password: t.password })).toBe(false);

    const { tempPassword } = await resetPassword(SYSTEM_VIEWER, t.email);
    expect(await openFailures(t.email)).toBe(0);
    expect(await logsFor("password_reset", t.userId)).toHaveLength(1);
    expect((await signIn(t.email, tempPassword, "198.51.100.156")).status).toBe(200);
  });

  it("⑤ 기록 실패 → 비밀번호 · 세션 · 임시 표시는 바뀜 · 잠금 해소 롤백 · password_reset 0행 · 에러 로그(userId · 오류 이름만) 뒤 다시 던짐", async () => {
    const t = await lockedTarget("reset-audit-fail", DEFAULT_ROLE_ID, "198.51.100.157");
    await db.update(users).set({ passwordIsTemporary: false }).where(eq(users.id, t.userId));
    const { threshold } = await lockoutConfig();
    const error = vi.spyOn(log, "error");

    await expect(
      resetPassword(SYSTEM_VIEWER, t.email, { recordAction: () => Promise.reject(new TypeError("감사 쓰기 실패")) }),
    ).rejects.toThrow("감사 쓰기 실패");

    expect(await openFailures(t.email)).toBe(threshold);
    expect(await logsFor("password_reset", t.userId)).toHaveLength(0);
    expect(await sessionAlive(t.cookie)).toBe(false);
    const [row] = await db.select().from(users).where(eq(users.id, t.userId));
    expect(row?.passwordIsTemporary).toBe(true);
    const calls = error.mock.calls.filter(([event]) => event === "auth.password_reset_audit_failed");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual({ userId: t.userId, name: "TypeError" });
  });
});

describe("잠금 해제의 상한 판정 (A-P2-8)", () => {
  it("위임자가 상한 밖(시스템 관리자)의 잠금을 풀면 RoleGrantForbiddenError · 열린 실패 · account_unlock 그대로", async () => {
    const d = await delegate();
    const t = await lockedTarget("unlock-ceiling", SYSADMIN_ROLE_ID, "198.51.100.158");
    const { threshold } = await lockoutConfig();
    await expect(unlockAccount(d, t.email)).rejects.toBeInstanceOf(RoleGrantForbiddenError);
    expect(await openFailures(t.email)).toBe(threshold);
    expect(await logsFor("account_unlock", t.userId)).toHaveLength(0);
  });

  it("SYSTEM_VIEWER(CLI)는 시스템 관리자의 잠금도 푼다", async () => {
    const t = await lockedTarget("unlock-system", SYSADMIN_ROLE_ID, "198.51.100.159");
    const { threshold } = await lockoutConfig();
    await expect(unlockAccount(SYSTEM_VIEWER, t.email)).resolves.toEqual({ resolved: threshold });
    expect(await openFailures(t.email)).toBe(0);
  });
});
