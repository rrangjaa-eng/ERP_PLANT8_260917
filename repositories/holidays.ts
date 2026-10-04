import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { withDeadlineTransaction } from "@/db/deadline-transaction";
import { holidays, holidayYearConfirmations, holidayYearGenerations, users } from "@/db/schema";
import type { HolidayKind } from "@/domain/holidays/rules";
import type { Viewer } from "@/domain/viewer";

// 달력 전체 advisory 잠금 키 — tick 잠금(NOTIFY_TICK_LOCK_KEY 420_401)과 다른 값.
export const HOLIDAYS_LOCK_KEY = 420_601;

// 빠른 길 읽기의 클라이언트 마감 — 풀 대기 5 + 5 = 04.2-10 예산의 몫 10초.
export const HOLIDAY_READ_DEADLINE_MS = 5_000;

// 달력 잠금 트랜잭션의 클라이언트 마감 — 잠금 대기 5 + 문장 여섯 × 5.
export const HOLIDAY_TX_DEADLINE_MS = 35_000;

export type HolidayRow = InferSelectModel<typeof holidays>;

export type HolidayYearConfirmationRow = InferSelectModel<typeof holidayYearConfirmations>;

export type HolidayRowInsert = { date: string; name: string; kind: HolidayKind; createdBy?: string | null };

export type SubstituteRowInsert = { date: string; name: string; originYear: number };

// 표를 바꾸는 모든 길이 이 잠금을 잡은 트랜잭션 안에서 돈다 — 두 재계산이
// READ COMMITTED에서 서로의 새 대체일을 못 보고 둘 남기는 일을 막는다.
// 기다리는 잠금이다(수동 추가·삭제는 건너뛰면 안 된다). 대기는 lock_timeout 5s.
export async function lockHolidayCalendar(viewer: Viewer, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
  await tx.execute(sql`select pg_advisory_xact_lock(${HOLIDAYS_LOCK_KEY})`);
}

// BEGIN~COMMIT·ROLLBACK 전체가 클라이언트 마감 안 — 넘으면 연결을 파기하고 DbDeadlineError.
export async function withHolidayCalendarTx<T>(viewer: Viewer, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return withDeadlineTransaction(HOLIDAY_TX_DEADLINE_MS, async (tx) => {
    await lockHolidayCalendar(viewer, tx);
    return fn(tx);
  });
}

// tx가 없으면 자기 짧은 마감 트랜잭션에서 statement_timeout 5s 뒤 읽는다.
async function readWithin<T>(tx: DbOrTx | undefined, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return withDeadlineTransaction(HOLIDAY_READ_DEADLINE_MS, async (own) => {
    await own.execute(sql`SET LOCAL statement_timeout = '5s'`);
    return fn(own);
  });
}

function yearRange(year: number) {
  return and(gte(holidays.date, `${year}-01-01`), lt(holidays.date, `${year + 1}-01-01`));
}

export async function findYearGeneration(
  viewer: Viewer,
  year: number,
  tx?: DbOrTx,
): Promise<{ year: number; generatedAt: Date } | null> {
  void viewer;
  return readWithin(tx, async (reader) => {
    const [row] = await reader
      .select()
      .from(holidayYearGenerations)
      .where(eq(holidayYearGenerations.year, year))
      .limit(1);
    return row ?? null;
  });
}

export async function findGeneratedYears(viewer: Viewer, tx: DbOrTx = db): Promise<number[]> {
  void viewer;
  const rows = await tx
    .select({ year: holidayYearGenerations.year })
    .from(holidayYearGenerations)
    .orderBy(asc(holidayYearGenerations.year));
  return rows.map((row) => row.year);
}

export async function insertYearGeneration(viewer: Viewer, year: number, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const inserted = await tx
    .insert(holidayYearGenerations)
    .values({ year })
    .onConflictDoNothing()
    .returning({ year: holidayYearGenerations.year });
  return inserted.length > 0;
}

// 법정·수동 행 전용 — 같은 날짜의 활성(보관 안 된) 행(관리자 수동 행 포함)이 있으면 남는다.
export async function insertHolidayRows(
  viewer: Viewer,
  rows: readonly HolidayRowInsert[],
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  if (rows.some((row) => row.kind === "substitute")) {
    throw new Error("대체공휴일 행은 insertSubstituteRows로 넣습니다.");
  }
  if (rows.length === 0) return 0;
  const inserted = await tx
    .insert(holidays)
    .values(rows.map((row) => ({ ...row, createdBy: row.createdBy ?? null })))
    .onConflictDoNothing({ target: holidays.date, where: isNull(holidays.archivedAt) })
    .returning({ id: holidays.id });
  return inserted.length;
}

// 충돌을 삼키지 않는다 — 같은 날짜의 활성(보관 안 된) 행이 있으면 유니크 위반(23505)으로 트랜잭션 전체가 되돌려진다.
export async function insertSubstituteRows(
  viewer: Viewer,
  rows: readonly SubstituteRowInsert[],
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  if (rows.length === 0) return 0;
  const inserted = await tx
    .insert(holidays)
    .values(rows.map((row) => ({ ...row, kind: "substitute" })))
    .returning({ id: holidays.id });
  return inserted.length;
}

export async function deleteFutureSubstitutes(
  viewer: Viewer,
  input: { fromOriginYear: number; after: string },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const deleted = await tx
    .delete(holidays)
    .where(
      and(
        eq(holidays.kind, "substitute"),
        gte(holidays.originYear, input.fromOriginYear),
        gt(holidays.date, input.after),
      ),
    )
    .returning({ id: holidays.id });
  return deleted.length;
}

export async function findHolidayDates(viewer: Viewer, years: readonly number[], tx?: DbOrTx): Promise<string[]> {
  void viewer;
  if (years.length === 0) return [];
  return readWithin(tx, async (reader) => {
    const rows = await reader
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(isNull(holidays.archivedAt), or(...years.map(yearRange))))
      .orderBy(asc(holidays.date));
    return rows.map((row) => row.date);
  });
}

// 대체일 배정의 막는 날 — 수동 날짜와 대체 행(원래 해 포함)을 한 문장으로 읽는다.
export async function findBlockingDates(
  viewer: Viewer,
  range: { from: string; to: string },
  tx: DbOrTx = db,
): Promise<{ manual: string[]; substitutes: { date: string; originYear: number }[] }> {
  void viewer;
  const rows = await tx
    .select({ date: holidays.date, kind: holidays.kind, originYear: holidays.originYear })
    .from(holidays)
    .where(
      and(
        isNull(holidays.archivedAt),
        inArray(holidays.kind, ["temporary", "election", "substitute"]),
        gte(holidays.date, range.from),
        lte(holidays.date, range.to),
      ),
    )
    .orderBy(asc(holidays.date));
  const manual: string[] = [];
  const substitutes: { date: string; originYear: number }[] = [];
  for (const row of rows) {
    if (row.kind === "substitute" && row.originYear !== null) {
      substitutes.push({ date: row.date, originYear: row.originYear });
    } else {
      manual.push(row.date);
    }
  }
  return { manual, substitutes };
}

// 관리자 화면(04.2-11·12)용 — 날짜 오름차순, 만든 사람 이름(규칙·초기 행은 null).
export async function listHolidaysForYear(
  viewer: Viewer,
  year: number,
): Promise<(HolidayRow & { createdByName: string | null })[]> {
  void viewer;
  const rows = await db
    .select({ holiday: holidays, createdByName: users.name })
    .from(holidays)
    .leftJoin(users, eq(users.id, holidays.createdBy))
    .where(and(isNull(holidays.archivedAt), yearRange(year)))
    .orderBy(asc(holidays.date));
  return rows.map((row) => ({ ...row.holiday, createdByName: row.createdByName }));
}

export async function listHolidayYears(viewer: Viewer): Promise<number[]> {
  void viewer;
  const year = sql<number>`extract(year from ${holidays.date})::int`;
  const rows = await db.selectDistinct({ year }).from(holidays).where(isNull(holidays.archivedAt)).orderBy(year);
  return rows.map((row) => row.year);
}

export async function findYearConfirmation(
  viewer: Viewer,
  year: number,
  tx: DbOrTx = db,
): Promise<HolidayYearConfirmationRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(holidayYearConfirmations)
    .where(eq(holidayYearConfirmations.year, year))
    .limit(1);
  return row ?? null;
}

export async function insertYearConfirmation(
  viewer: Viewer,
  row: { year: number; confirmedBy: string },
  tx: DbOrTx = db,
): Promise<boolean> {
  void viewer;
  const inserted = await tx
    .insert(holidayYearConfirmations)
    .values(row)
    .onConflictDoNothing()
    .returning({ year: holidayYearConfirmations.year });
  return inserted.length > 0;
}

export async function insertManualHoliday(
  viewer: Viewer,
  row: { date: string; name: string; kind: "temporary" | "election"; createdBy: string | null },
  tx: DbOrTx = db,
): Promise<boolean> {
  void viewer;
  const inserted = await tx
    .insert(holidays)
    .values(row)
    .onConflictDoNothing({ target: holidays.date, where: isNull(holidays.archivedAt) })
    .returning({ id: holidays.id });
  return inserted.length > 0;
}

export async function findHolidayByDate(viewer: Viewer, date: string, tx: DbOrTx = db): Promise<HolidayRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(holidays)
    .where(and(eq(holidays.date, date), isNull(holidays.archivedAt)))
    .limit(1);
  return row ?? null;
}

// 대체공휴일 행만 물리 삭제한다 — 규칙이 다시 만드는 파생 행이다. 수동 행은 보관한다(ADMN-12 · quick 261001-hfi A-5).
export async function deleteSubstituteById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<HolidayRow | null> {
  void viewer;
  const [row] = await tx
    .delete(holidays)
    .where(and(eq(holidays.id, id), eq(holidays.kind, "substitute")))
    .returning();
  return row ?? null;
}

// 보관 여부와 무관하게 id로 찾는다(복원 · 보관함용).
export async function findHolidayById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<HolidayRow | null> {
  void viewer;
  const [row] = await tx.select().from(holidays).where(eq(holidays.id, id)).limit(1);
  return row ?? null;
}

// 조건부 UPDATE — 이미 보관된 행 · 없는 id는 null(동시 중복 삭제의 뒤 사람).
export async function archiveHolidayById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<HolidayRow | null> {
  const [row] = await tx
    .update(holidays)
    .set({ archivedAt: new Date(), archivedBy: viewer.id })
    .where(and(eq(holidays.id, id), isNull(holidays.archivedAt)))
    .returning();
  return row ?? null;
}

// 조건부 UPDATE — 보관되지 않은 행 · 없는 id는 null(동시 중복 복원의 뒤 사람).
export async function restoreHolidayById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<HolidayRow | null> {
  void viewer;
  const [row] = await tx
    .update(holidays)
    .set({ archivedAt: null, archivedBy: null })
    .where(and(eq(holidays.id, id), isNotNull(holidays.archivedAt)))
    .returning();
  return row ?? null;
}

export async function listArchivedHolidays(
  viewer: Viewer,
): Promise<{ id: string; name: string; date: string; archivedAt: Date; archivedBy: string | null; dateTaken: boolean }[]> {
  void viewer;
  // 그 날짜에 활성 공휴일(대체일 제외)이 있는가 — restoreHoliday가 거부하는 경우(quick 261002-4jn).
  const active = alias(holidays, "active_holidays");
  const rows = await db
    .select({
      id: holidays.id,
      date: holidays.date,
      name: holidays.name,
      archivedAt: holidays.archivedAt,
      archivedBy: holidays.archivedBy,
      dateTaken: sql<boolean>`exists (${db
        .select({ one: sql`1` })
        .from(active)
        .where(and(eq(active.date, holidays.date), isNull(active.archivedAt), ne(active.kind, "substitute")))})`,
    })
    .from(holidays)
    .where(isNotNull(holidays.archivedAt));
  return rows.map((row) => ({
    id: row.id,
    name: `${row.date} ${row.name}`,
    date: row.date,
    archivedAt: row.archivedAt as Date,
    archivedBy: row.archivedBy,
    dateTaken: row.dateTaken,
  }));
}
