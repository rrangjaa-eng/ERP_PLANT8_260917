// 06.3: 연차 일수 · 겹침의 서버 쪽 재료 — 결과만 돌려주고 오류는 index.ts · resubmit.ts가 던진다.
// 휴일 조회는 트랜잭션 밖에서 부른다 — 후보 보장이 별도 달력 잠금 트랜잭션을 연다(D-6303).
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_FIRST_YEAR, LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { LunarTableRangeError } from "@/domain/holidays/rules";
import { NO_HOLIDAYS, type LeaveYearRange } from "@/domain/leave/days";

export async function loadLeaveHolidays(
  startDate: string,
  range: LeaveYearRange,
  deps?: { loadHolidayLookup?: (years: number[]) => Promise<HolidayLookup> },
): Promise<HolidayLookup> {
  // 형식 오류는 `countLeaveQuarters`가 낸다.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NO_HOLIDAYS;
  const year = Number(startDate.slice(0, 4));
  // 범위 밖 해는 휴일 조회보다 `연도 범위 밖` 오류가 먼저다.
  if (year < range.minYear || year > range.maxYear) return NO_HOLIDAYS;
  // D-6306(확정 · 카드 2026-10-10): 음력 표 밖 해는 주말만 — 260907도 휴일 표가 비면 주말만 뺐다(`O: docs/06_업무/11_연차.md:303-306`). 연차 입구 연도 범위(2000~올해+1)는 바꾸지 않는다
  if (year < LUNAR_TABLE_FIRST_YEAR || year > LUNAR_TABLE_LAST_YEAR) return NO_HOLIDAYS;
  // 신청은 해를 넘지 않으므로 해 하나(D-6303).
  try {
    return await (deps?.loadHolidayLookup ?? loadHolidayLookup)([year]);
  } catch (error) {
    if (error instanceof LunarTableRangeError) return NO_HOLIDAYS;
    throw error;
  }
}
