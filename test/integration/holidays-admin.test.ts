import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, holidays, holidayYearConfirmations, holidayYearGenerations } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import {
  addHoliday,
  confirmHolidayYear,
  DuplicateHolidayError,
  deleteHoliday,
  HolidayForbiddenError,
  HolidayNotDeletableError,
  HolidayYearIncompleteError,
  HolidayYearOutOfRangeError,
  loadHolidayAdmin,
  PastHolidayDateError,
} from "@/domain/holidays/admin";
import { ensureHolidayCandidates, recomputeFutureSubstitutes } from "@/domain/holidays/candidates";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { toKstDate } from "@/domain/holidays/business-day";
import { generateHolidayRules, LunarTableRangeError } from "@/domain/holidays/rules";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { addHolidayAction, confirmHolidayYearAction } from "@/app/(app)/admin/holidays/actions";

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

  it("액션으로 범위 밖 해(2036)를 직접 불러도 확정되지 않고 오류다(Codex #14)", async () => {
    session.viewer = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    try {
      const result = await confirmHolidayYearAction({ year: 2036 });
      expect(result?.data).toBeUndefined();
      expect(result?.serverError).toContain("확정 불가 · 올해·내년만 확정");
    } finally {
      session.viewer = null;
    }
    expect(await confirmationsOf(2036)).toHaveLength(0);
  });

  it("수동 행 하나만 있던 해(2030)를 확정하면 법정 후보가 채워지고 생성 표시가 생긴 뒤 확정된다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await db.insert(holidays).values({ date: "2030-07-15", name: "임시공휴일", kind: "temporary" });

    await confirmHolidayYear(admin, 2030, { now: () => new Date("2030-03-01T00:00:00Z") });

    expect(await generationsOf(2030)).toHaveLength(1);
    expect(await statutoryDatesOf(2030)).toEqual(ruleStatutoryDatesOf(2030));
    expect(await confirmationsOf(2030)).toHaveLength(1);
  });

  it("법정 행이 일부만 있는 해(2029)를 확정하면 빠진 법정 행이 채워진다(Codex 2차 #14 잔여)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await db.insert(holidays).values({ date: "2029-01-01", name: "1월 1일", kind: "statutory" });

    await confirmHolidayYear(admin, 2029, { now: () => new Date("2029-03-01T00:00:00Z") });

    expect(await statutoryDatesOf(2029)).toEqual(ruleStatutoryDatesOf(2029));
    expect(await generationsOf(2029)).toHaveLength(1);
    expect(await confirmationsOf(2029)).toHaveLength(1);
  });

  it("보장이 아무것도 하지 않아 생성 표시가 없으면 HolidayYearIncompleteError이고 확정·로그가 없다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");

    await expect(
      confirmHolidayYear(admin, 2031, {
        ensure: () => Promise.resolve(false),
        now: () => new Date("2031-03-01T00:00:00Z"),
      }),
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

  // 04.2-11 개정(PR #73 · 2026-09-26) — D-4223 확정은 배너와 같은 범위: 올해·내년만.
  // 화면이 주소창으로 다른 해를 부르는 경로(과거 연도 데이터가 남아 있을 때)까지
  // 도메인이 다시 막는다.
  it("올해·내년만 확정 가능 — 지난해·2년 뒤는 HolidayYearOutOfRangeError, 올해·내년은 성공한다(PR #73)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const thisYear = Number(toKstDate(new Date()).slice(0, 4));

    const past = confirmHolidayYear(admin, thisYear - 1);
    await expect(past).rejects.toBeInstanceOf(HolidayYearOutOfRangeError);
    await expect(past).rejects.toThrow(`${thisYear - 1}년 확정 불가 · 올해·내년만 확정`);

    const tooFar = confirmHolidayYear(admin, thisYear + 2);
    await expect(tooFar).rejects.toBeInstanceOf(HolidayYearOutOfRangeError);
    await expect(tooFar).rejects.toThrow(`${thisYear + 2}년 확정 불가 · 올해·내년만 확정`);

    expect(await confirmationsOf(thisYear - 1)).toHaveLength(0);
    expect(await confirmationsOf(thisYear + 2)).toHaveLength(0);
    expect(await confirmLogs()).toHaveLength(0);

    await confirmHolidayYear(admin, thisYear);
    await confirmHolidayYear(admin, thisYear + 1);

    expect(await confirmationsOf(thisYear)).toHaveLength(1);
    expect(await confirmationsOf(thisYear + 1)).toHaveLength(1);
  });
});

// 04.2-12 Task 1 — 수동 추가(D-4210 「추가」 · D-4220 · Codex #2·#12 · Codex 2차 #4·#5).
// 날짜가 걸린 케이스는 모두 now를 주입한다(실행 날짜와 무관).
const NOW_0924 = new Date("2026-09-24T03:00:00Z"); // KST 2026-09-24 12:00 — 추석 연휴 한가운데
const NOW_1020 = new Date("2026-10-20T03:00:00Z"); // KST 2026-10-20 12:00 — 다음 날(10-21)이 평일

async function holidayLogs(op: "add" | "delete") {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "holiday_change"), sql`${actionLog.detail}->>'op' = ${op}`))
    .orderBy(actionLog.seq);
}

async function dateKindsOf(year: number): Promise<{ date: string; kind: string }[]> {
  const rows = await db
    .select({ date: holidays.date, kind: holidays.kind })
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function rowsBetween(from: string, to: string) {
  const rows = await db
    .select({ date: holidays.date, kind: holidays.kind, originYear: holidays.originYear, name: holidays.name })
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to)));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function substitutesBetween(from: string, to: string) {
  return (await rowsBetween(from, to))
    .filter((row) => row.kind === "substitute")
    .map(({ date, originYear }) => ({ date, originYear }));
}

describe("addHoliday — 수동 추가(04.2-12)", () => {
  it("오늘·어제는 PastHolidayDateError, 내일은 행 1 + holiday_change op add 로그 1줄", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const deps = { now: NOW_1020 };

    for (const date of ["2026-10-20", "2026-10-19"]) {
      const attempt = addHoliday(admin, { date, kind: "temporary", name: "x" }, deps);
      await expect(attempt).rejects.toBeInstanceOf(PastHolidayDateError);
      await expect(attempt).rejects.toThrow("오늘·지난 날짜 · 내일 이후 날짜 고르기");
    }
    expect(await holidayLogs("add")).toHaveLength(0);

    const added = await addHoliday(admin, { date: "2026-10-21", kind: "election", name: "보궐선거" }, deps);

    expect(added).toMatchObject({ date: "2026-10-21", year: 2026 });
    const rows = await rowsBetween("2026-10-19", "2026-10-21");
    expect(rows).toEqual([{ date: "2026-10-21", kind: "election", originYear: null, name: "보궐선거" }]);
    const logs = await holidayLogs("add");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "holiday", entityId: added.id, actorId: admin.id });
    expect(logs[0]?.detail).toEqual({ op: "add", date: "2026-10-21", name: "보궐선거", kind: "election" });
  });

  it("법정 공휴일 날짜는 기존 이름을 실은 DuplicateHolidayError · 같은 날짜 동시 추가는 하나만 성공(Codex #12)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const deps = { now: NOW_0924 };

    const duplicate = addHoliday(admin, { date: "2027-10-03", kind: "temporary", name: "x" }, deps);
    await expect(duplicate).rejects.toBeInstanceOf(DuplicateHolidayError);
    await expect(duplicate).rejects.toThrow("이미 공휴일(개천절) · 다른 날짜 고르기");

    const results = await Promise.allSettled([
      addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "동시 A" }, deps),
      addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "동시 B" }, deps),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason: unknown = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(DuplicateHolidayError);
    expect(reason instanceof Error ? reason.message : "").toMatch(
      /^이미 공휴일\(동시 [AB]\) · 다른 날짜 고르기$/,
    );
    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(1);
    expect(await holidayLogs("add")).toHaveLength(1);
  });

  it("규칙 구분(statutory·substitute)은 도메인이 거부하고, 보기 전용 viewer는 HolidayForbiddenError", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const deps = { now: NOW_0924 };
    for (const kind of ["statutory", "substitute"] as const) {
      await expect(addHoliday(admin, { date: "2027-06-08", kind, name: "x" }, deps)).rejects.toThrow(
        "임시공휴일·선거일만 추가 가능",
      );
    }
    const viewOnly = await createViewOnlyViewer();
    await expect(
      addHoliday(viewOnly, { date: "2027-06-08", kind: "temporary", name: "x" }, deps),
    ).rejects.toBeInstanceOf(HolidayForbiddenError);
    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(0);
    expect(await holidayLogs("add")).toHaveLength(0);
  });

  it("음력 표 밖 해(마지막 해 + 1)는 LunarTableRangeError · 그 해 행 0 · 로그 0(디자인 리뷰 #9)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const outside = LUNAR_TABLE_LAST_YEAR + 1;

    await expect(
      addHoliday(admin, { date: `${outside}-01-05`, kind: "temporary", name: "x" }, { now: NOW_0924 }),
    ).rejects.toBeInstanceOf(LunarTableRangeError);

    expect(await dateKindsOf(outside)).toHaveLength(0);
    expect(await holidayLogs("add")).toHaveLength(0);
  });

  it("미래 대체일(2027-10-04) 자리에 임시공휴일을 넣으면 개천절 대체일이 10-05로 옮겨지고, 표는 수동 행을 먼저 넣고 생성한 순서와 같다(Codex #2)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await ensureHolidayCandidates(2027, { now: () => NOW_0924 });
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);

    await addHoliday(admin, { date: "2027-10-04", kind: "temporary", name: "임시공휴일 테스트" }, { now: NOW_0924 });

    expect(await rowsBetween("2027-10-04", "2027-10-04")).toEqual([
      { date: "2027-10-04", kind: "temporary", originYear: null, name: "임시공휴일 테스트" },
    ]);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);
    const viaDomain = await dateKindsOf(2027);

    // 04.2-06 「순서 1」 — 수동 행이 먼저 있고 그 해를 생성한 표.
    await db.execute(sql`TRUNCATE TABLE holidays, holiday_year_generations, holiday_year_confirmations`);
    await db.insert(holidays).values({ date: "2027-10-04", name: "임시공휴일 테스트", kind: "temporary" });
    await ensureHolidayCandidates(2027, { now: () => NOW_0924 });
    expect(await dateKindsOf(2027)).toEqual(viaDomain);
  });

  it("해 넘김: 2027-12-27~31을 막으면 2027 기독탄신일 대체일은 2028-01-03, 2028-01-03을 넣으면 2028-01-04(Codex 2차 #5)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    for (const date of ["2027-12-27", "2027-12-28", "2027-12-29", "2027-12-30", "2027-12-31"]) {
      await addHoliday(admin, { date, kind: "temporary", name: "연말 임시" }, { now: NOW_0924 });
    }
    expect(await substitutesBetween("2027-12-26", "2028-01-10")).toEqual([{ date: "2028-01-03", originYear: 2027 }]);

    await addHoliday(admin, { date: "2028-01-03", kind: "temporary", name: "임시공휴일 테스트" }, { now: NOW_0924 });

    expect((await rowsBetween("2028-01-03", "2028-01-03")).map((row) => row.kind)).toEqual(["temporary"]);
    expect(await substitutesBetween("2027-12-26", "2028-01-10")).toEqual([{ date: "2028-01-04", originYear: 2027 }]);
  });

  it("로그 쓰기가 실패하면 행 추가와 재계산이 함께 되돌려진다(Codex #12)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await ensureHolidayCandidates(2027, { now: () => NOW_0924 });
    const before = await dateKindsOf(2027);

    await expect(
      addHoliday(
        admin,
        { date: "2027-10-04", kind: "temporary", name: "임시공휴일 테스트" },
        { now: NOW_0924, recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect((await rowsBetween("2027-10-04", "2027-10-04")).map((row) => row.kind)).toEqual(["substitute"]);
    expect(await rowsBetween("2027-10-05", "2027-10-05")).toHaveLength(0);
    expect(await dateKindsOf(2027)).toEqual(before);
  });

  it("action_log.optional_types를 비워도 추가 로그는 남는다(끌 수 없는 종류)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);

    await addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "x" }, { now: NOW_0924 });

    expect(await holidayLogs("add")).toHaveLength(1);
  });
});

describe("addHolidayAction — 칸 오류(04.2-12)", () => {
  it("지난 날짜·중복·음력 표 밖 해는 날짜 칸 오류로 돌아오고 행이 생기지 않는다", async () => {
    session.viewer = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const outside = LUNAR_TABLE_LAST_YEAR + 1;
    try {
      const past = await addHolidayAction({ date: "2020-01-02", kind: "temporary", name: "x" });
      expect(past?.validationErrors?.date?._errors).toEqual(["오늘·지난 날짜 · 내일 이후 날짜 고르기"]);

      const lunar = await addHolidayAction({ date: `${outside}-01-05`, kind: "temporary", name: "x" });
      expect(lunar?.validationErrors?.date?._errors).toEqual([
        `${outside}년 음력 표 없음 · ${LUNAR_TABLE_LAST_YEAR}년까지 날짜 고르기`,
      ]);

      const badFormat = await addHolidayAction({ date: "2027-02-30", kind: "temporary", name: "x" });
      expect(badFormat?.validationErrors?.date?._errors).toEqual(["날짜 형식 오류 · 2027-06-03 형식"]);

      const nextYear = Number(toKstDate(new Date()).slice(0, 4)) + 1;
      const duplicate = await addHolidayAction({ date: `${nextYear}-01-01`, kind: "temporary", name: "x" });
      expect(duplicate?.validationErrors?.date?._errors?.[0]).toMatch(/^이미 공휴일\(.+\) · 다른 날짜 고르기$/);

      const ok = await addHolidayAction({ date: `${nextYear}-06-08`, kind: "election", name: "  선거  " });
      expect(ok?.data).toEqual({ date: `${nextYear}-06-08`, year: nextYear });
      expect((await rowsBetween(`${nextYear}-06-08`, `${nextYear}-06-08`)).map((row) => row.name)).toEqual(["선거"]);
    } finally {
      session.viewer = null;
    }
    expect(await dateKindsOf(outside)).toHaveLength(0);
  });

  it("이름 50자 넘으면 이름 칸 오류로 돌아오고 행이 생기지 않는다", async () => {
    session.viewer = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const nextYear = Number(toKstDate(new Date()).slice(0, 4)) + 1;
    try {
      const tooLong = await addHolidayAction({
        date: `${nextYear}-03-03`,
        kind: "temporary",
        name: "가".repeat(51),
      });
      expect(tooLong?.validationErrors?.name?._errors).toEqual(["이름 50자 이하 · 이름 줄이기"]);
    } finally {
      session.viewer = null;
    }
    expect(await rowsBetween(`${nextYear}-03-03`, `${nextYear}-03-03`)).toHaveLength(0);
  });
});

// 04.2-12 Task 2 — 수동 미래 행 삭제(D-4210 「삭제」 · D-4209 개정 · Codex #2·#12 · Codex 2차 #4·#5)
// 와 결과 줄 `되돌리기`(같은 추가 경로 — #1).
async function idOf(date: string): Promise<string> {
  const [row] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, date));
  if (!row) throw new Error(`${date} 행이 없다`);
  return row.id;
}

async function logsForDate(date: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "holiday_change"), sql`${actionLog.detail}->>'date' = ${date}`))
    .orderBy(actionLog.seq);
}

describe("deleteHoliday — 수동 미래 행 삭제(04.2-12)", () => {
  it("규칙 행·지난 수동 행·오늘 수동 행은 HolidayNotDeletableError이고 그대로 남는다 · 미래 수동 행은 지워지고 원래 값 + op delete 로그(금지 회상)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const deps = { now: NOW_0924 };
    await ensureHolidayCandidates(2027, { now: () => NOW_0924 });
    await db.insert(holidays).values([
      { date: "2026-09-01", name: "지난 임시", kind: "temporary" },
      { date: "2026-09-24", name: "오늘 임시", kind: "temporary" },
    ]);

    for (const date of ["2027-10-03", "2027-10-04", "2026-09-01", "2026-09-24"]) {
      const id = await idOf(date);
      await expect(deleteHoliday(admin, id, deps)).rejects.toBeInstanceOf(HolidayNotDeletableError);
      expect(await rowsBetween(date, date)).toHaveLength(1);
    }
    expect(await holidayLogs("delete")).toHaveLength(0);

    const added = await addHoliday(admin, { date: "2027-06-08", kind: "election", name: "보궐선거" }, deps);
    const result = await deleteHoliday(admin, added.id, deps);

    expect(result).toEqual({ deleted: true, date: "2027-06-08", name: "보궐선거", kind: "election" });
    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(0);
    const logs = await holidayLogs("delete");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "holiday", entityId: added.id, actorId: admin.id });
    expect(logs[0]?.detail).toEqual({ op: "delete", date: "2027-06-08", name: "보궐선거", kind: "election" });
  });

  it("보기 전용 viewer의 삭제는 HolidayForbiddenError다(T-4.2-76)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const added = await addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "x" }, { now: NOW_0924 });
    const viewOnly = await createViewOnlyViewer();

    await expect(deleteHoliday(viewOnly, added.id, { now: NOW_0924 })).rejects.toBeInstanceOf(HolidayForbiddenError);
    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(1);
  });

  it("같은 행을 동시에 두 번 지우면 둘 다 오류 없이 끝나고 행 0 · 삭제 로그 1줄(Codex #12)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const added = await addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "x" }, { now: NOW_0924 });

    const results = await Promise.all([
      deleteHoliday(admin, added.id, { now: NOW_0924 }),
      deleteHoliday(admin, added.id, { now: NOW_0924 }),
    ]);

    expect(results.filter((result) => result.deleted)).toHaveLength(1);
    expect(results).toContainEqual({ deleted: false });
    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(0);
    expect(await holidayLogs("delete")).toHaveLength(1);
  });

  it("로그 쓰기가 실패하면 삭제도 되돌려진다(Codex #12)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const added = await addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "x" }, { now: NOW_0924 });

    await expect(
      deleteHoliday(admin, added.id, {
        now: NOW_0924,
        recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")),
      }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect(await rowsBetween("2027-06-08", "2027-06-08")).toHaveLength(1);
  });

  it("2027-10-04 임시공휴일을 지우면 개천절 대체일이 10-04로 돌아오고 2027 표가 추가 전과 같다(Codex #2)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    await ensureHolidayCandidates(2027, { now: () => NOW_0924 });
    const before = await dateKindsOf(2027);
    const added = await addHoliday(
      admin,
      { date: "2027-10-04", kind: "temporary", name: "임시공휴일 테스트" },
      { now: NOW_0924 },
    );

    await deleteHoliday(admin, added.id, { now: NOW_0924 });

    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
    expect(await rowsBetween("2027-10-05", "2027-10-05")).toHaveLength(0);
    expect(await dateKindsOf(2027)).toEqual(before);
  });

  it("해 넘김: 2028-01-03 임시공휴일을 지우면 2027 기독탄신일 대체일이 다시 2028-01-03 하나다(Codex 2차 #5)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    for (const date of ["2027-12-27", "2027-12-28", "2027-12-29", "2027-12-30", "2027-12-31"]) {
      await addHoliday(admin, { date, kind: "temporary", name: "연말 임시" }, { now: NOW_0924 });
    }
    const added = await addHoliday(
      admin,
      { date: "2028-01-03", kind: "temporary", name: "임시공휴일 테스트" },
      { now: NOW_0924 },
    );

    await deleteHoliday(admin, added.id, { now: NOW_0924 });

    expect(await substitutesBetween("2027-12-26", "2028-01-10")).toEqual([{ date: "2028-01-03", originYear: 2027 }]);
  });

  it("겹친 동시 삭제(10-05 · 10-04, 장벽으로 겹침 확인) 뒤 개천절 대체일은 정확히 2027-10-04 하나다(Codex 2차 #4)", async () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(3);
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const first = await addHoliday(admin, { date: "2027-10-04", kind: "temporary", name: "임시 가" }, { now: NOW_0924 });
    const second = await addHoliday(admin, { date: "2027-10-05", kind: "temporary", name: "임시 나" }, { now: NOW_0924 });
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-06", originYear: 2027 }]);

    let releaseFirst: () => void = () => {};
    const firstMayContinue = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered: () => void = () => {};
    const firstHoldsLock = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });

    const firstDelete = deleteHoliday(admin, second.id, {
      now: NOW_0924,
      recompute: async (fromOriginYear, opts, tx) => {
        firstEntered();
        await firstMayContinue;
        await recomputeFutureSubstitutes(fromOriginYear, opts, tx);
      },
    });
    await firstHoldsLock;
    const secondDelete = deleteHoliday(admin, first.id, { now: NOW_0924 });

    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_stat_activity where wait_event_type = 'Lock' and query like '%pg_advisory_xact_lock%'`,
      );
      if ((waiting.rows[0]?.count ?? 0) >= 1) break;
      if (Date.now() > deadline) {
        releaseFirst();
        throw new Error("두 번째 삭제가 5초 안에 잠금 대기에 들어가지 않았다");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    releaseFirst();
    const results = await Promise.all([firstDelete, secondDelete]);

    expect(results.every((result) => result.deleted)).toBe(true);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
    expect(await holidayLogs("delete")).toHaveLength(2);
  });

  it("되돌리기: 삭제가 돌려준 값으로 addHoliday를 다시 부르면 행·대체일이 삭제 전으로 돌아오고 로그가 add → delete → add(#1)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const added = await addHoliday(
      admin,
      { date: "2027-10-04", kind: "temporary", name: "임시공휴일 테스트" },
      { now: NOW_0924 },
    );
    const beforeDelete = await dateKindsOf(2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);

    const deleted = await deleteHoliday(admin, added.id, { now: NOW_0924 });
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
    if (!deleted.deleted) throw new Error("삭제되지 않았다");

    await addHoliday(admin, { date: deleted.date, name: deleted.name, kind: deleted.kind }, { now: NOW_0924 });

    expect(await rowsBetween("2027-10-04", "2027-10-04")).toEqual([
      { date: "2027-10-04", kind: "temporary", originYear: null, name: "임시공휴일 테스트" },
    ]);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);
    expect(await dateKindsOf(2027)).toEqual(beforeDelete);
    const logs = await logsForDate("2027-10-04");
    expect(logs.map((log) => (log.detail as { op: string }).op)).toEqual(["add", "delete", "add"]);
    expect(logs[2]?.detail).toEqual({ op: "add", date: "2027-10-04", name: "임시공휴일 테스트", kind: "temporary" });
  });

  it("되돌리기 거절: 그사이 다른 공휴일이 들어섰거나 그 날이 오늘이 됐으면 오류이고 로그가 늘지 않는다(#1)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID, "관리자");
    const added = await addHoliday(admin, { date: "2027-06-08", kind: "temporary", name: "원래 이름" }, { now: NOW_0924 });
    const deleted = await deleteHoliday(admin, added.id, { now: NOW_0924 });
    if (!deleted.deleted) throw new Error("삭제되지 않았다");
    const undo = { date: deleted.date, name: deleted.name, kind: deleted.kind };

    const onTheDay = new Date("2027-06-08T03:00:00Z");
    await expect(addHoliday(admin, undo, { now: onTheDay })).rejects.toBeInstanceOf(PastHolidayDateError);
    expect(await logsForDate("2027-06-08")).toHaveLength(2);

    await addHoliday(admin, { date: "2027-06-08", kind: "election", name: "다른 이름" }, { now: NOW_0924 });
    const logCount = (await logsForDate("2027-06-08")).length;
    const duplicate = addHoliday(admin, undo, { now: NOW_0924 });
    await expect(duplicate).rejects.toBeInstanceOf(DuplicateHolidayError);
    await expect(duplicate).rejects.toThrow("이미 공휴일(다른 이름) · 다른 날짜 고르기");
    expect(await logsForDate("2027-06-08")).toHaveLength(logCount);
  });
});
