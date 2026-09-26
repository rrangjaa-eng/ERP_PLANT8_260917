import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, holidays, holidayYearConfirmations, holidayYearGenerations } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import {
  confirmHolidayYear,
  HolidayForbiddenError,
  HolidayYearIncompleteError,
  loadHolidayAdmin,
} from "@/domain/holidays/admin";
import { toKstDate } from "@/domain/holidays/business-day";
import { generateHolidayRules } from "@/domain/holidays/rules";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { confirmHolidayYearAction } from "@/app/(app)/admin/holidays/actions";

// 04.2-11 — 공휴일 관리 화면의 도메인(화면 데이터 · 연도 확정). 액션을 직접 부르는
// 케이스용 세션(관리자로 바꿔 끼운다)과 revalidatePath 흉내.
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () =>
    Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

async function createViewer(roleId: string, name: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `holiday-admin-${randomUUID()}@example.test`,
    name,
    roleId,
  });
  return { id: userId, roleId };
}

async function createViewOnlyViewer(): Promise<Viewer> {
  const roleId = `role-holiday-view-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `보기 전용 ${roleId.slice(-8)}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.holidays", action: "view", allowed: true });
  return createViewer(roleId, "보기 전용");
}

async function confirmationsOf(year: number) {
  return db.select().from(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, year));
}

async function confirmLogs() {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "holiday_change"), sql`${actionLog.detail}->>'op' = 'confirm'`));
}

async function statutoryDatesOf(year: number): Promise<string[]> {
  const rows = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(eq(holidays.kind, "statutory"), gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
  return rows.map((row) => row.date).sort();
}

function ruleStatutoryDatesOf(year: number): string[] {
  return generateHolidayRules(year)
    .filter((holiday) => holiday.kind === "statutory")
    .map((holiday) => holiday.date)
    .sort();
}

async function generationsOf(year: number) {
  return db.select().from(holidayYearGenerations).where(eq(holidayYearGenerations.year, year));
}

describe("loadHolidayAdmin — 화면 데이터(04.2-11)", () => {
  it("빈 표에서 두 번 동시에 불러도 올해·다음 해 행 날짜가 서로 다르고 오름차순이다(엣지 #4·#7 앞 절반)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const thisYear = Number(toKstDate(new Date()).slice(0, 4));

    const [first, second] = await Promise.all([loadHolidayAdmin(admin, {}), loadHolidayAdmin(admin, {})]);

    expect(first.years.map((entry) => entry.year)).toEqual(expect.arrayContaining([thisYear, thisYear + 1]));
    for (const view of [first, second]) {
      const dates = view.rows.map((row) => row.date);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);
    }
    for (const year of [thisYear, thisYear + 1]) {
      const rows = await db
        .select({ date: holidays.date })
        .from(holidays)
        .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.date)).size).toBe(rows.length);
    }
  });

  it("admin.holidays view가 없는 viewer는 HolidayForbiddenError다", async () => {
    const pm = await createViewer(DEFAULT_ROLE_ID, "기획 PM");
    await expect(loadHolidayAdmin(pm, {})).rejects.toBeInstanceOf(HolidayForbiddenError);
  });
});

describe("confirmHolidayYear — 연도 확정(04.2-11 · D-4220 · D-4223)", () => {
  it("두 관리자가 동시에 확정하면 둘 다 성공하고 확정 행 1 · 로그 1이다(엣지 #7 뒤 절반)", async () => {
    const adminA = await createViewer(SYSADMIN_ROLE_ID, "관리자A");
    const adminB = await createViewer(SYSADMIN_ROLE_ID, "관리자B");

    await Promise.all([confirmHolidayYear(adminA, 2027), confirmHolidayYear(adminB, 2027)]);

    const rows = await confirmationsOf(2027);
    expect(rows).toHaveLength(1);
    expect([adminA.id, adminB.id]).toContain(rows[0]?.confirmedBy);
    const logs = await confirmLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "holiday_year", entityId: "2027" });
    expect(logs[0]?.detail).toMatchObject({ op: "confirm", year: 2027 });
  });

  it("로그 쓰기가 실패하면 확정도 남지 않고, 다시 누르면 확정과 로그가 함께 남는다(Codex #12)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");

    await expect(
      confirmHolidayYear(admin, 2027, {
        recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")),
      }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");
    expect(await confirmationsOf(2027)).toHaveLength(0);

    await confirmHolidayYear(admin, 2027);
    expect(await confirmationsOf(2027)).toHaveLength(1);
    expect(await confirmLogs()).toHaveLength(1);
  });

  it("action_log.optional_types를 비워도 확정 로그는 남는다(끌 수 없는 종류)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);

    await confirmHolidayYear(admin, 2027);

    expect(await confirmLogs()).toHaveLength(1);
  });

  it("액션으로 음력 표 밖 해(2036)를 직접 불러도 확정되지 않고 오류다(Codex #14)", async () => {
    session.viewer = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    try {
      const result = await confirmHolidayYearAction({ year: 2036 });
      expect(result?.data).toBeUndefined();
      expect(result?.serverError).toContain("음력 표에 없는 해");
    } finally {
      session.viewer = null;
    }
    expect(await confirmationsOf(2036)).toHaveLength(0);
  });

  it("수동 행 하나만 있던 해(2030)를 확정하면 법정 후보가 채워지고 생성 표시가 생긴 뒤 확정된다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await db.insert(holidays).values({ date: "2030-07-15", name: "임시공휴일", kind: "temporary" });

    await confirmHolidayYear(admin, 2030);

    expect(await generationsOf(2030)).toHaveLength(1);
    expect(await statutoryDatesOf(2030)).toEqual(ruleStatutoryDatesOf(2030));
    expect(await confirmationsOf(2030)).toHaveLength(1);
  });

  it("법정 행이 일부만 있는 해(2029)를 확정하면 빠진 법정 행이 채워진다(Codex 2차 #14 잔여)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await db.insert(holidays).values({ date: "2029-01-01", name: "1월 1일", kind: "statutory" });

    await confirmHolidayYear(admin, 2029);

    expect(await statutoryDatesOf(2029)).toEqual(ruleStatutoryDatesOf(2029));
    expect(await generationsOf(2029)).toHaveLength(1);
    expect(await confirmationsOf(2029)).toHaveLength(1);
  });

  it("보장이 아무것도 하지 않아 생성 표시가 없으면 HolidayYearIncompleteError이고 확정·로그가 없다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");

    await expect(
      confirmHolidayYear(admin, 2031, { ensure: () => Promise.resolve(false) }),
    ).rejects.toBeInstanceOf(HolidayYearIncompleteError);

    expect(await confirmationsOf(2031)).toHaveLength(0);
    expect(await confirmLogs()).toHaveLength(0);
  });

  it("view만 있는 viewer의 확정은 HolidayForbiddenError다(T-4.2-70)", async () => {
    const viewOnly = await createViewOnlyViewer();

    await expect(loadHolidayAdmin(viewOnly, {})).resolves.toBeDefined();
    await expect(confirmHolidayYear(viewOnly, 2027)).rejects.toBeInstanceOf(HolidayForbiddenError);
    expect(await confirmationsOf(2027)).toHaveLength(0);
  });
});
