import { and, asc, gte, lte, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { holidays, holidayYearConfirmations, holidayYearGenerations } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { addBusinessDaysKst, isBusinessDayKst, loadHolidayLookup } from "@/domain/holidays/calendar";
import { ensureHolidayCandidates } from "@/domain/holidays/candidates";
import { INITIAL_MANUAL_HOLIDAYS, LunarTableRangeError } from "@/domain/holidays/rules";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertHolidayRows } from "@/repositories/holidays";
import { OFFICIAL_2027, type OfficialHoliday } from "@/test/unit/holidays/official-calendar";

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

async function rowsOf(year: number) {
  return db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)))
    .orderBy(asc(holidays.date));
}

async function dateKindsOf(year: number): Promise<{ date: string; kind: string }[]> {
  return (await rowsOf(year)).map(({ date, kind }) => ({ date, kind }));
}

function expectedRowsOf(year: number, official: readonly OfficialHoliday[]): { date: string; kind: string }[] {
  return [
    ...official.map(({ date, kind }) => ({ date, kind })),
    ...INITIAL_MANUAL_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`)).map(({ date, kind }) => ({ date, kind })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

async function generatedYears(): Promise<number[]> {
  const rows = await db.select({ year: holidayYearGenerations.year }).from(holidayYearGenerations);
  return rows.map((row) => row.year).sort((a, b) => a - b);
}

async function clearHolidayTables(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE holidays, holiday_year_generations, holiday_year_confirmations`);
}

// 적재 함수를 감싸 계산이 요청한 해 목록을 기록한다.
function spyLoader(): { requested: number[][]; loadHolidayLookup: typeof loadHolidayLookup } {
  const requested: number[][] = [];
  return {
    requested,
    loadHolidayLookup: (years) => {
      requested.push([...years]);
      return loadHolidayLookup(years);
    },
  };
}

describe("공휴일 후보 보장 · 영업일 계산", () => {
  it("빈 표에서 2027-02-09(설 대체)는 영업일이 아니고 2027 행이 공식 목록과 같다", async () => {
    expect(await isBusinessDayKst("2027-02-09")).toBe(false);
    expect(await dateKindsOf(2027)).toEqual(expectedRowsOf(2027, OFFICIAL_2027));
  });

  it("같은 해 보장을 두 번 해도 행 집합이 그대로다", async () => {
    await ensureHolidayCandidates(2026);
    const first = await rowsOf(2026);
    await ensureHolidayCandidates(2026);
    expect(await rowsOf(2026)).toEqual(first);
  });

  it("법정 행 하나만 있고 생성 표시가 없는 해는 한 번에 생성한 것과 같은 행으로 채워진다", async () => {
    await ensureHolidayCandidates(2028);
    const whole = await dateKindsOf(2028);
    await clearHolidayTables();

    await insertHolidayRows(SYSTEM_VIEWER, [{ date: "2028-01-01", name: "1월 1일", kind: "statutory" }]);
    expect(await generatedYears()).toEqual([]);
    await ensureHolidayCandidates(2028);
    expect(await dateKindsOf(2028)).toEqual(whole);
    expect(await generatedYears()).toContain(2028);
  });

  it("수동 행이 먼저 있으면 보장 뒤에도 그 행의 구분·이름·만든 사람이 남는다", async () => {
    const admin = await createUser("holiday-admin");
    await insertHolidayRows(SYSTEM_VIEWER, [
      { date: "2026-06-03", name: "선거일", kind: "election", createdBy: admin },
      { date: "2026-12-25", name: "임시", kind: "temporary", createdBy: admin },
    ]);
    await ensureHolidayCandidates(2026);
    const rows = await rowsOf(2026);
    expect(rows.filter((row) => row.date === "2026-06-03")).toEqual([
      expect.objectContaining({ kind: "election", name: "선거일", createdBy: admin }),
    ]);
    expect(rows.filter((row) => row.date === "2026-12-25")).toEqual([
      expect.objectContaining({ kind: "temporary", name: "임시", createdBy: admin }),
    ]);
  });

  it("확정된 해도 보장은 행을 바꾸지 않는다", async () => {
    const admin = await createUser("holiday-confirm");
    await ensureHolidayCandidates(2026);
    const before = await rowsOf(2026);
    await db.insert(holidayYearConfirmations).values({ year: 2026, confirmedBy: admin });
    await ensureHolidayCandidates(2026);
    expect(await rowsOf(2026)).toEqual(before);
  });

  it("두 연결의 동시 보장 → 2027 행 집합이 한 번 생성한 것과 같고 오류 없음", async () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(2);
    await Promise.all([ensureHolidayCandidates(2027), ensureHolidayCandidates(2027)]);
    expect(pool.totalCount).toBeGreaterThanOrEqual(2);
    expect(await dateKindsOf(2027)).toEqual(expectedRowsOf(2027, OFFICIAL_2027));
    expect(await generatedYears()).toEqual([2027]);
  });

  it("addBusinessDaysKst(2026-12-31, 1) = 2027-01-04이고 2027 행이 생긴다", async () => {
    expect(await addBusinessDaysKst("2026-12-31", 1)).toBe("2027-01-04");
    expect(await generatedYears()).toContain(2027);
    expect(await dateKindsOf(2027)).toEqual(expectedRowsOf(2027, OFFICIAL_2027));
  });

  it("표 첫 해·마지막 해 안의 계산은 표 밖의 해를 요청하지 않고, 표 밖으로 넘어가면 LunarTableRangeError", async () => {
    const spy = spyLoader();
    expect(await isBusinessDayKst("2025-01-02", spy)).toBe(true);
    expect(await addBusinessDaysKst("2025-01-02", 0, spy)).toBe("2025-01-02");
    expect(await addBusinessDaysKst("2035-06-01", 0, spy)).toMatch(/^2035-/);
    const requested = spy.requested.flat();
    expect(requested).not.toContain(2024);
    expect(requested).not.toContain(2036);

    await expect(addBusinessDaysKst("2035-12-31", 1)).rejects.toBeInstanceOf(LunarTableRangeError);
    await expect(addBusinessDaysKst("2025-01-02", -1)).rejects.toBeInstanceOf(LunarTableRangeError);
  });

  it("12월 평일이 전부 수동 공휴일이면 2026-11-30 + 1영업일은 해를 넘어 2027년 첫 영업일이다", async () => {
    const december: { date: string; name: string; kind: "temporary" }[] = [];
    for (let day = 1; day <= 31; day += 1) {
      const date = `2026-12-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (weekday !== 0 && weekday !== 6) december.push({ date, name: "임시", kind: "temporary" });
    }
    await insertHolidayRows(SYSTEM_VIEWER, december);
    const spy = spyLoader();
    expect(await addBusinessDaysKst("2026-11-30", 1, spy)).toBe("2027-01-04");
    expect(spy.requested).toEqual([[2026], [2026, 2027]]);
  });

  it("ensureHolidayCandidates(2036) → LunarTableRangeError, 2036 행 0", async () => {
    await expect(ensureHolidayCandidates(2036)).rejects.toBeInstanceOf(LunarTableRangeError);
    expect(await rowsOf(2036)).toHaveLength(0);
    expect(await generatedYears()).not.toContain(2036);
  });
});

