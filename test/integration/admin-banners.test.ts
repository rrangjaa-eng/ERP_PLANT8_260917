import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { holidayConfirmationBanner } from "@/domain/holidays/admin";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { emailFailureBanner } from "@/domain/system-status";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertYearConfirmation } from "@/repositories/holidays";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";

// 04.2-13 — 「관리」 인덱스 배너 판정 둘. B1(D-705 · U-4): 올해·다음 해 가운데 확정 전인
// 가장 이른 해, admin.holidays write 권한자만. B2(NOTI-02 · D-4217 · U-6): 이메일을 시도한
// 마지막 tick의 실패 + 알림 행 기준 결과 불명(10분 · 7일), admin.system-status view 권한자만.

async function createViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `admin-banner-${randomUUID()}@example.test`,
    name: "배너 확인",
    roleId,
  });
  return { id: userId, roleId };
}

async function createRoleWith(perms: { menu: string; action: "view" | "write" }[]): Promise<string> {
  const roleId = `role-banner-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `배너 ${roleId.slice(-8)}` });
  for (const perm of perms) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, ...perm, allowed: true });
  }
  return roleId;
}

// 2026-09-24 00:00Z = KST 09:00 — 올해 Y = 2026.
const NOW = new Date("2026-09-24T00:00:00Z");
const Y = 2026;

function warnEvents(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((args) => String(args[0]))
    .filter((line) => line.includes('"event":"admin.banner_failed"'));
}

describe("holiday confirmation banner (D-705)", () => {
  it("올해 확정 + 다음 해 미확정이면 다음 해 미확정 → 관리자 배너 { year: Y+1 }", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertYearConfirmation(SYSTEM_VIEWER, { year: Y, confirmedBy: admin.id });
    expect(await holidayConfirmationBanner(admin, { now: () => NOW })).toEqual({ year: Y + 1 });
  });

  it("둘 다 미확정이면 가장 이른 해 { year: Y }", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    expect(await holidayConfirmationBanner(admin, { now: () => NOW })).toEqual({ year: Y });
  });

  it("둘 다 확정이면 null", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertYearConfirmation(SYSTEM_VIEWER, { year: Y, confirmedBy: admin.id });
    await insertYearConfirmation(SYSTEM_VIEWER, { year: Y + 1, confirmedBy: admin.id });
    expect(await holidayConfirmationBanner(admin, { now: () => NOW })).toBeNull();
  });

  it("admin.holidays view만 있는 사람에게는 null(행동할 수 있는 사람만)", async () => {
    const viewOnly = await createViewer(await createRoleWith([{ menu: "admin.holidays", action: "view" }]));
    expect(await holidayConfirmationBanner(viewOnly, { now: () => NOW })).toBeNull();
  });

  it("확정 기록 읽기가 던지면 null + admin.banner_failed 경고", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await holidayConfirmationBanner(admin, {
        now: () => NOW,
        findConfirmation: () => Promise.reject(new Error("db down")),
      });
      expect(result).toBeNull();
      const events = warnEvents(spy);
      expect(events).toHaveLength(1);
      expect(events[0]).toContain('"banner":"holiday"');
      expect(events[0]).toContain("db down");
    } finally {
      spy.mockRestore();
    }
  });
});

type RunInsert = {
  startedAt: Date;
  emailClaimed: number;
  emailSent?: number;
  emailFailed?: number;
  emailUnknown?: number;
  emailFinishedAt?: Date | null;
};

async function insertRun(run: RunInsert): Promise<void> {
  await db.insert(notifyTickRuns).values({
    startedAt: run.startedAt,
    finishedAt: run.startedAt,
    kstDate: "2026-09-24",
    businessDay: true,
    emailClaimed: run.emailClaimed,
    emailSent: run.emailSent ?? 0,
    emailFailed: run.emailFailed ?? 0,
    emailUnknown: run.emailUnknown ?? 0,
    emailFinishedAt: run.emailFinishedAt === undefined ? run.startedAt : run.emailFinishedAt,
  });
}

async function insertEmailRow(recipientId: string, status: "sending" | "unknown", attemptedAt: Date): Promise<void> {
  await db.insert(notificationLog).values({
    conditionKind: "test_admin_banner",
    entity: "test",
    entityId: randomUUID(),
    recipientId,
    referenceDate: "2026-09-24",
    message: "배너 테스트",
    emailStatus: status,
    emailAttemptedAt: attemptedAt,
  });
}

const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

describe("email failure banner", () => {
  it("이메일 시도 실행도 결과 불명 행도 없으면 null", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    expect(await emailFailureBanner(admin, { now: () => NOW })).toBeNull();
  });

  it("실패 → B2, 다음 이메일 tick 성공 → 사라짐, SMTP 미설정 tick은 판정을 바꾸지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertRun({ startedAt: NOW, emailClaimed: 3, emailFailed: 3 });
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 60) })).toEqual({
      failed: 3,
      failedAt: "2026-09-24 09:00",
      unknown: 0,
      unknownSince: null,
    });

    // SMTP 미설정 tick(email_claimed = 0)은 「이메일을 시도한 tick」이 아니다.
    await insertRun({ startedAt: minutes(NOW, 1440), emailClaimed: 0, emailFinishedAt: null });
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 1500) })).toMatchObject({ failed: 3 });

    await insertRun({ startedAt: minutes(NOW, 2880), emailClaimed: 2, emailSent: 2 });
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 2940) })).toBeNull();

    await insertRun({ startedAt: minutes(NOW, 4320), emailClaimed: 0, emailFinishedAt: null });
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 4380) })).toBeNull();
  });

  it("끊긴 실행 A의 결과 불명은 뒤의 성공한 실행 B에 가려지지 않는다 — 10분 뒤부터 7일 동안(Codex 2차 #1)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    // A: 선점 1, 결과 0, 끝 표시 없음 — 받는 사람 행은 sending(09:00).
    await insertRun({ startedAt: NOW, emailClaimed: 1, emailFinishedAt: null });
    await insertEmailRow(admin.id, "sending", NOW);
    // B: 바로 뒤 성공.
    await insertRun({ startedAt: minutes(NOW, 2), emailClaimed: 1, emailSent: 1 });

    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 5) })).toBeNull();
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 11) })).toEqual({
      failed: 0,
      failedAt: null,
      unknown: 1,
      unknownSince: "2026-09-24 09:00",
    });
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 7 * 1440 + 1) })).toBeNull();
  });

  it("unknown 행(모호한 SMTP 결과)은 선점 1분 뒤에도 결과 불명으로 센다(Codex 2차 #2)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertRun({ startedAt: NOW, emailClaimed: 1, emailUnknown: 1 });
    await insertEmailRow(admin.id, "unknown", NOW);
    expect(await emailFailureBanner(admin, { now: () => minutes(NOW, 1) })).toMatchObject({ failed: 0, unknown: 1 });
  });

  it("admin.system-status view가 없는 사람에게는 null", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertRun({ startedAt: NOW, emailClaimed: 3, emailFailed: 3 });
    const employee = await createViewer(DEFAULT_ROLE_ID);
    expect(await emailFailureBanner(employee, { now: () => NOW })).toBeNull();
    expect(await emailFailureBanner(admin, { now: () => NOW })).not.toBeNull();
  });

  it("읽기가 던지면 null + admin.banner_failed 경고", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await emailFailureBanner(admin, {
        now: () => NOW,
        getLastEmailOutcome: () => Promise.reject(new Error("pool exhausted")),
      });
      expect(result).toBeNull();
      const events = warnEvents(spy);
      expect(events).toHaveLength(1);
      expect(events[0]).toContain('"banner":"email"');
      expect(events[0]).toContain("pool exhausted");
    } finally {
      spy.mockRestore();
    }
  });
});
