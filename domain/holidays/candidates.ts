import { SYSTEM_VIEWER } from "@/domain/viewer";
import { toKstDate } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { generateHolidayRules, INITIAL_MANUAL_HOLIDAYS } from "@/domain/holidays/rules";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  deleteFutureSubstitutes,
  findBlockingDates,
  findGeneratedYears,
  findYearGeneration,
  insertHolidayRows,
  insertSubstituteRows,
  insertYearGeneration,
  withHolidayCalendarTx,
  type SubstituteRowInsert,
} from "@/repositories/holidays";

export type CandidateDeps = { now?: () => Date };

export type RecomputeDeps = { insertSubstituteRows?: typeof insertSubstituteRows };

// 표를 바꾸는 모든 길(후보 생성 · 수동 추가·삭제와 재계산 · 연도 확정)이 이 안에서만 돈다.
export async function withHolidayCalendarLock<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return withHolidayCalendarTx(SYSTEM_VIEWER, fn);
}

// 대체일 배정 — 생성된 원래 해를 오름차순으로 훑으며 점유 집합 하나(수동 날짜 ∪
// 남긴 대체일 ∪ 앞 해가 방금 정한 대체일)를 막는 날로 쓴다. 지난 대체일(today 이하)은
// 지우지 않고, 생성 중인 해만 날짜와 무관하게 전부 넣는다. 충돌은 삼키지 않는다.
async function allocateSubstitutes(
  tx: DbOrTx,
  opts: {
    fromOriginYear: number;
    today: string;
    generatingYear?: number;
    generatedYears?: readonly number[];
    insertSubstituteRows?: typeof insertSubstituteRows;
  },
): Promise<void> {
  const years = (opts.generatedYears ?? (await findGeneratedYears(SYSTEM_VIEWER, tx)))
    .filter((year) => year >= opts.fromOriginYear && year <= LUNAR_TABLE_LAST_YEAR)
    .sort((a, b) => a - b);
  if (years.length === 0) return;

  const blocking = await findBlockingDates(
    SYSTEM_VIEWER,
    { from: `${opts.fromOriginYear}-01-01`, to: `${LUNAR_TABLE_LAST_YEAR + 1}-12-31` },
    tx,
  );
  await deleteFutureSubstitutes(SYSTEM_VIEWER, { fromOriginYear: opts.fromOriginYear, after: opts.today }, tx);

  const occupied = new Set(blocking.manual);
  const keptByOrigin = new Map<number, Set<string>>();
  for (const row of blocking.substitutes) {
    const deleted = row.originYear >= opts.fromOriginYear && row.date > opts.today;
    if (deleted) continue;
    occupied.add(row.date);
    keptByOrigin.set(row.originYear, (keptByOrigin.get(row.originYear) ?? new Set()).add(row.date));
  }

  const rows: SubstituteRowInsert[] = [];
  for (const year of years) {
    const kept = keptByOrigin.get(year) ?? new Set<string>();
    const blockers = new Set([...occupied].filter((date) => !kept.has(date)));
    for (const holiday of generateHolidayRules(year, { blockers })) {
      if (holiday.kind !== "substitute") continue;
      if (year !== opts.generatingYear && holiday.date <= opts.today) continue;
      rows.push({ date: holiday.date, name: holiday.name, originYear: year });
      occupied.add(holiday.date);
    }
  }

  await (opts.insertSubstituteRows ?? insertSubstituteRows)(SYSTEM_VIEWER, rows, tx);
}

// 부르는 쪽이 달력 잠금을 잡은 트랜잭션 안에서 부른다. 그 해 생성 표시가 있으면
// 아무것도 하지 않는다. 범위 밖 해는 LunarTableRangeError가 그대로 전파된다.
export async function ensureHolidayCandidatesLocked(year: number, tx: DbOrTx, deps?: CandidateDeps): Promise<boolean> {
  const generatedYears = await findGeneratedYears(SYSTEM_VIEWER, tx);
  if (generatedYears.includes(year)) return false;

  const statutory = generateHolidayRules(year).filter((holiday) => holiday.kind !== "substitute");
  const manual = INITIAL_MANUAL_HOLIDAYS.filter((holiday) => holiday.date.startsWith(`${year}-`));
  await insertHolidayRows(
    SYSTEM_VIEWER,
    [...statutory, ...manual].map(({ date, name, kind }) => ({ date, name, kind })),
    tx,
  );
  await insertYearGeneration(SYSTEM_VIEWER, year, tx);
  await allocateSubstitutes(tx, {
    fromOriginYear: year,
    today: toKstDate((deps?.now ?? (() => new Date()))()),
    generatingYear: year,
    generatedYears: [...generatedYears, year],
  });
  return true;
}

// 지연 생성 — 잠금 없는 빠른 길로 생성 표시를 보고, 없을 때만 달력 잠금 안에서 이중 확인 뒤 만든다.
export async function ensureHolidayCandidates(year: number, deps?: CandidateDeps): Promise<void> {
  if (await findYearGeneration(SYSTEM_VIEWER, year)) return;
  await withHolidayCalendarLock((tx) => ensureHolidayCandidatesLocked(year, tx, deps));
}

// 수동 날짜가 바뀐 해 Y에 대해 부르는 쪽(04.2-12)이 달력 잠금 트랜잭션 안에서 Y - 1로 한 번 부른다 —
// 원래 해 Y-1부터 표 끝까지 미래 대체일(today 뒤)만 다시 정한다. 지난 대체일은 소급해 바꾸지 않는다.
export async function recomputeFutureSubstitutes(
  fromOriginYear: number,
  opts: { today: string },
  tx: DbOrTx,
  deps?: RecomputeDeps,
): Promise<void> {
  await allocateSubstitutes(tx, {
    fromOriginYear,
    today: opts.today,
    insertSubstituteRows: deps?.insertSubstituteRows,
  });
}
