import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { holidays, holidayYearConfirmations, holidayYearGenerations } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { addBusinessDaysKst, isBusinessDayKst, loadHolidayLookup } from "@/domain/holidays/calendar";
import { ensureHolidayCandidates, recomputeFutureSubstitutes, withHolidayCalendarLock } from "@/domain/holidays/candidates";
import { INITIAL_MANUAL_HOLIDAYS, LunarTableRangeError } from "@/domain/holidays/rules";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  deleteHolidayById,
  findHolidayByDate,
  findYearConfirmation,
  insertHolidayRows,
  insertManualHoliday,
  insertSubstituteRows,
  insertYearConfirmation,
  listHolidaysForYear,
  listHolidayYears,
} from "@/repositories/holidays";
import { isUniqueViolation } from "@/lib/pg-errors";
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


type SubstituteRow = { date: string; originYear: number | null };

async function substitutesBetween(from: string, to: string): Promise<SubstituteRow[]> {
  return db
    .select({ date: holidays.date, originYear: holidays.originYear })
    .from(holidays)
    .where(and(eq(holidays.kind, "substitute"), gte(holidays.date, from), lte(holidays.date, to)))
    .orderBy(asc(holidays.date));
}

async function rowsBetween(from: string, to: string) {
  return db
    .select({ date: holidays.date, kind: holidays.kind, originYear: holidays.originYear })
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to)))
    .orderBy(asc(holidays.date));
}

const TODAY = { today: "2026-09-24" };

async function addManual(date: string): Promise<void> {
  expect(await insertManualHoliday(SYSTEM_VIEWER, { date, name: "임시", kind: "temporary", createdBy: null })).toBe(true);
}

// 04.2-12의 수동 추가 모양 — 그 날짜의 대체 행이 있으면 지우고 수동 행을 넣은 뒤 Y-1 재계산.
async function addManualAndRecompute(date: string, fromOriginYear: number, today = TODAY): Promise<void> {
  await withHolidayCalendarLock(async (tx) => {
    const existing = await findHolidayByDate(SYSTEM_VIEWER, date, tx);
    if (existing) await deleteHolidayById(SYSTEM_VIEWER, existing.id, tx);
    expect(await insertManualHoliday(SYSTEM_VIEWER, { date, name: "임시", kind: "temporary", createdBy: null }, tx)).toBe(true);
    await recomputeFutureSubstitutes(fromOriginYear, today, tx);
  });
}

async function removeManualAndRecompute(date: string, fromOriginYear: number, today = TODAY): Promise<void> {
  await withHolidayCalendarLock(async (tx) => {
    const existing = await findHolidayByDate(SYSTEM_VIEWER, date, tx);
    expect(existing?.kind).toBe("temporary");
    if (existing) await deleteHolidayById(SYSTEM_VIEWER, existing.id, tx);
    await recomputeFutureSubstitutes(fromOriginYear, today, tx);
  });
}

function weekdaysBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (;;) {
    const date = d.toISOString().slice(0, 10);
    if (date > to) return dates;
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(date);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

const DENSE_2032_2033 = [...weekdaysBetween("2032-12-27", "2032-12-31"), ...weekdaysBetween("2033-01-03", "2033-01-28")];

describe("관리자 저장소 · 미래 대체일 재계산 (D-4210)", () => {
  it("저장소: 해별 목록은 날짜 오름차순, 해 목록 오름차순, 중복 확정·수동 추가는 false, 없는 id 삭제는 null", async () => {
    const admin = await createUser("holiday-repo");
    await ensureHolidayCandidates(2027);
    await ensureHolidayCandidates(2026);
    const list = await listHolidaysForYear(SYSTEM_VIEWER, 2026);
    expect(list.map((row) => row.date)).toEqual([...list.map((row) => row.date)].sort());
    expect(list.every((row) => row.date.startsWith("2026-"))).toBe(true);
    expect(await listHolidayYears(SYSTEM_VIEWER)).toEqual([2026, 2027]);

    expect(await insertYearConfirmation(SYSTEM_VIEWER, { year: 2026, confirmedBy: admin })).toBe(true);
    expect(await insertYearConfirmation(SYSTEM_VIEWER, { year: 2026, confirmedBy: admin })).toBe(false);
    expect(await findYearConfirmation(SYSTEM_VIEWER, 2026)).toMatchObject({ year: 2026, confirmedBy: admin });

    const manual = { date: "2026-11-02", name: "임시", kind: "temporary" as const, createdBy: admin };
    expect(await insertManualHoliday(SYSTEM_VIEWER, manual)).toBe(true);
    expect(await insertManualHoliday(SYSTEM_VIEWER, manual)).toBe(false);
    const found = await findHolidayByDate(SYSTEM_VIEWER, "2026-11-02");
    expect(found).toMatchObject({ date: "2026-11-02", kind: "temporary", createdBy: admin });
    expect((await listHolidaysForYear(SYSTEM_VIEWER, 2026)).find((row) => row.date === "2026-11-02")?.createdByName).toBe(
      "holiday-repo",
    );

    expect(await deleteHolidayById(SYSTEM_VIEWER, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await deleteHolidayById(SYSTEM_VIEWER, found?.id ?? "")).toMatchObject({ date: "2026-11-02" });
    expect(await findHolidayByDate(SYSTEM_VIEWER, "2026-11-02")).toBeNull();
  });

  it("순서 1(수동 먼저)과 순서 2(후보 먼저 → 수동 추가 + 재계산)의 2027 행 집합이 같고 개천절 대체일은 10-05", async () => {
    await addManual("2027-10-04");
    await ensureHolidayCandidates(2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);
    const first = await dateKindsOf(2027);
    await clearHolidayTables();

    await ensureHolidayCandidates(2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
    await addManualAndRecompute("2027-10-04", 2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);
    expect(await dateKindsOf(2027)).toEqual(first);
  });

  it("수동 행을 지우고 재계산하면 개천절 대체일이 10-04로 돌아온다", async () => {
    await ensureHolidayCandidates(2027);
    await addManualAndRecompute("2027-10-04", 2027);
    await removeManualAndRecompute("2027-10-04", 2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
  });

  it("소급 금지: today가 대체일보다 뒤면 재계산은 그 대체일을 옮기지 않는다", async () => {
    await ensureHolidayCandidates(2027);
    await addManualAndRecompute("2027-10-04", 2027);
    await removeManualAndRecompute("2027-10-04", 2027, { today: "2027-10-06" });
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-05", originYear: 2027 }]);
  });

  it("재계산 도중 insertSubstituteRows가 던지면(삭제 뒤) 전부 롤백되어 대체 행이 그대로다", async () => {
    await ensureHolidayCandidates(2027);
    const before = await substitutesBetween("2027-01-01", "2028-12-31");
    let calls = 0;
    let countAfterDelete = -1;
    const failing: typeof insertSubstituteRows = async (_viewer, _rows, tx) => {
      calls += 1;
      const result = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from holidays where kind = 'substitute' and origin_year >= 2027 and date > '2026-09-24'`,
      );
      countAfterDelete = result.rows[0]?.count ?? -1;
      throw new Error("주입한 삽입 실패");
    };
    await expect(
      withHolidayCalendarLock((tx) => recomputeFutureSubstitutes(2027, TODAY, tx, { insertSubstituteRows: failing })),
    ).rejects.toThrow("주입한 삽입 실패");
    expect(calls).toBe(1);
    expect(countAfterDelete).toBe(0);
    expect(await substitutesBetween("2027-01-01", "2028-12-31")).toEqual(before);
  });

  it("동시 삭제: 두 트랜잭션이 겹쳐 10-05·10-04 수동 행을 지워도 개천절 대체일은 10-04 하나다", async () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(3);
    await ensureHolidayCandidates(2027);
    await addManualAndRecompute("2027-10-04", 2027);
    await addManualAndRecompute("2027-10-05", 2027);
    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-06", originYear: 2027 }]);

    let releaseFirst: () => void = () => {};
    const firstMayContinue = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstDeleted: () => void = () => {};
    const firstHasDeleted = new Promise<void>((resolve) => {
      firstDeleted = resolve;
    });

    const first = withHolidayCalendarLock(async (tx) => {
      const row = await findHolidayByDate(SYSTEM_VIEWER, "2027-10-05", tx);
      if (row) await deleteHolidayById(SYSTEM_VIEWER, row.id, tx);
      firstDeleted();
      await firstMayContinue;
      await recomputeFutureSubstitutes(2027, TODAY, tx);
    });
    await firstHasDeleted;
    const second = withHolidayCalendarLock(async (tx) => {
      const row = await findHolidayByDate(SYSTEM_VIEWER, "2027-10-04", tx);
      if (row) await deleteHolidayById(SYSTEM_VIEWER, row.id, tx);
      await recomputeFutureSubstitutes(2027, TODAY, tx);
    });

    // 두 번째 연결이 달력 잠금을 기다리는 것을 확인한 뒤에야 첫 번째를 풀어 준다.
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_stat_activity where wait_event_type = 'Lock' and query like '%pg_advisory_xact_lock%'`,
      );
      if ((waiting.rows[0]?.count ?? 0) >= 1) break;
      if (Date.now() > deadline) {
        releaseFirst();
        throw new Error("두 번째 트랜잭션이 5초 안에 잠금 대기에 들어가지 않았다");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    releaseFirst();
    await Promise.all([first, second]);

    expect(await substitutesBetween("2027-10-01", "2027-10-08")).toEqual([{ date: "2027-10-04", originYear: 2027 }]);
  });

  it("교차 연도: 2027 성탄절 대체일 2028-01-03 → 수동 01-03 추가 뒤 01-04 → 삭제 뒤 다시 01-03", async () => {
    await ensureHolidayCandidates(2027);
    await ensureHolidayCandidates(2028);
    await withHolidayCalendarLock(async (tx) => {
      for (const date of weekdaysBetween("2027-12-27", "2027-12-31")) {
        const existing = await findHolidayByDate(SYSTEM_VIEWER, date, tx);
        if (existing) await deleteHolidayById(SYSTEM_VIEWER, existing.id, tx);
        await insertManualHoliday(SYSTEM_VIEWER, { date, name: "임시", kind: "temporary", createdBy: null }, tx);
      }
      await recomputeFutureSubstitutes(2026, TODAY, tx);
    });
    const christmas = () => substitutesBetween("2027-12-26", "2028-01-10");
    expect(await christmas()).toEqual([{ date: "2028-01-03", originYear: 2027 }]);

    await addManualAndRecompute("2028-01-03", 2027);
    expect(await christmas()).toEqual([{ date: "2028-01-04", originYear: 2027 }]);

    await removeManualAndRecompute("2028-01-03", 2027);
    expect(await christmas()).toEqual([{ date: "2028-01-03", originYear: 2027 }]);
  });

  it("생성 표시가 없는 해부터의 재계산은 아무 행도 바꾸지 않는다", async () => {
    await ensureHolidayCandidates(2027);
    const before = await db.select().from(holidays).orderBy(asc(holidays.date));
    await withHolidayCalendarLock((tx) => recomputeFutureSubstitutes(2031, TODAY, tx));
    expect(await db.select().from(holidays).orderBy(asc(holidays.date))).toEqual(before);
  });

  it("두 생성 순서(2032→2033 · 2033→2032)가 같은 표를 만들고 대체일은 2033-02-02(2032)·2033-02-03(2033)", async () => {
    for (const date of DENSE_2032_2033) await addManual(date);
    expect(DENSE_2032_2033).toHaveLength(25);
    await ensureHolidayCandidates(2032);
    await ensureHolidayCandidates(2033);
    const forward = await rowsBetween("2032-01-01", "2034-12-31");
    await clearHolidayTables();

    for (const date of DENSE_2032_2033) await addManual(date);
    await ensureHolidayCandidates(2033);
    await ensureHolidayCandidates(2032);
    const backward = await rowsBetween("2032-01-01", "2034-12-31");

    expect(backward).toEqual(forward);
    expect(forward).toContainEqual({ date: "2033-02-02", kind: "substitute", originYear: 2032 });
    expect(forward).toContainEqual({ date: "2033-02-03", kind: "substitute", originYear: 2033 });
  });

  it("막는 날 변경의 사슬: 수동 2033-01-28을 지우면 01-28/02-02, 되돌리면 02-02/02-03", async () => {
    for (const date of DENSE_2032_2033) await addManual(date);
    await ensureHolidayCandidates(2032);
    await ensureHolidayCandidates(2033);
    const chain = () => substitutesBetween("2033-01-20", "2033-02-10");

    await removeManualAndRecompute("2033-01-28", 2032);
    expect(await chain()).toEqual([
      { date: "2033-01-28", originYear: 2032 },
      { date: "2033-02-02", originYear: 2033 },
    ]);

    await addManualAndRecompute("2033-01-28", 2032);
    expect(await chain()).toEqual([
      { date: "2033-02-02", originYear: 2032 },
      { date: "2033-02-03", originYear: 2033 },
    ]);
  });

  it("Y-1 한 번의 재계산이 다음다음 해의 대체일(2028-01-03)까지 하나로 다시 넣는다", async () => {
    for (const date of weekdaysBetween("2027-12-27", "2027-12-31")) await addManual(date);
    await ensureHolidayCandidates(2026);
    await ensureHolidayCandidates(2027);
    await ensureHolidayCandidates(2028);
    const before = await substitutesBetween("2026-01-01", "2028-12-31");
    expect(before).toContainEqual({ date: "2028-01-03", originYear: 2027 });

    await addManualAndRecompute("2026-11-02", 2025);
    const after = await substitutesBetween("2026-01-01", "2028-12-31");
    expect(after.filter((row) => row.date === "2028-01-03")).toEqual([{ date: "2028-01-03", originYear: 2027 }]);
    expect(after).toEqual(before);
  });

  it("충돌하는 대체 행 삽입은 유니크 위반(23505)으로 던지고 되돌려진다", async () => {
    await ensureHolidayCandidates(2027);
    const before = await substitutesBetween("2027-01-01", "2028-12-31");
    const error = await withHolidayCalendarLock((tx) =>
      insertSubstituteRows(SYSTEM_VIEWER, [{ date: "2027-10-04", name: "충돌", originYear: 2026 }], tx),
    ).catch((caught: unknown) => caught);
    expect(isUniqueViolation(error, "holidays_date_key")).toBe(true);
    expect(await substitutesBetween("2027-01-01", "2028-12-31")).toEqual(before);
  });
});
