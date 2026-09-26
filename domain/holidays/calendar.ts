import { SYSTEM_VIEWER } from "@/domain/viewer";
import { addBusinessDays, isBusinessDay, type HolidayLookup } from "@/domain/holidays/business-day";
import { ensureHolidayCandidates } from "@/domain/holidays/candidates";
import { findHolidayDates } from "@/repositories/holidays";

// 계산이 읽지 않은 해에 닿았다 — 그 해만 보장·읽고 처음부터 다시 계산한다.
export class HolidayYearNotLoadedError extends Error {
  readonly year: number;

  constructor(year: number) {
    super(`${year}년 공휴일 안 읽음`);
    this.name = "HolidayYearNotLoadedError";
    this.year = year;
  }
}

export type CalendarDeps = { loadHolidayLookup?: (years: number[]) => Promise<HolidayLookup> };

// 영업일 판정·N영업일 계산의 DB 쪽 진입점 — 해마다 후보를 먼저 보장한 뒤 표 하나를 읽는다.
export async function loadHolidayLookup(years: number[]): Promise<HolidayLookup> {
  for (const year of years) await ensureHolidayCandidates(year);
  const byYear = new Map(years.map((year) => [year, new Set<string>()]));
  for (const date of await findHolidayDates(SYSTEM_VIEWER, years)) byYear.get(Number(date.slice(0, 4)))?.add(date);
  return (year) => {
    const dates = byYear.get(year);
    if (!dates) throw new HolidayYearNotLoadedError(year);
    return dates;
  };
}

export async function isBusinessDayKst(date: string, deps?: CalendarDeps): Promise<boolean> {
  const load = deps?.loadHolidayLookup ?? loadHolidayLookup;
  return isBusinessDay(date, await load([Number(date.slice(0, 4))]));
}

export async function addBusinessDaysKst(date: string, n: number, deps?: CalendarDeps): Promise<string> {
  const load = deps?.loadHolidayLookup ?? loadHolidayLookup;
  const years = [Number(date.slice(0, 4))];
  for (;;) {
    const lookup = await load([...years]);
    try {
      return addBusinessDays(date, n, lookup);
    } catch (error) {
      if (!(error instanceof HolidayYearNotLoadedError) || years.includes(error.year)) throw error;
      years.push(error.year);
    }
  }
}
