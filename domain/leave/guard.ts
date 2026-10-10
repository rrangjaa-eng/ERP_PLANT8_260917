// 06.3: 연차 일수 · 겹침의 서버 쪽 재료 — 결과만 돌려주고 오류는 index.ts · resubmit.ts가 던진다.
// 휴일 조회는 트랜잭션 밖에서 부른다 — 후보 보장이 별도 달력 잠금 트랜잭션을 연다(D-6303).
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_FIRST_YEAR, LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { LunarTableRangeError } from "@/domain/holidays/rules";
import { NO_HOLIDAYS, type HalfPeriod, type LeaveKind, type LeaveYearRange } from "@/domain/leave/days";
import { findLeaveOverlap, type LeaveOverlapHit, type LeaveSpan } from "@/domain/leave/overlap";
import { LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { listLiveLeaveInRange } from "@/repositories/leave-usage";
import type { DbOrTx } from "@/repositories/document-counters";
import type { Viewer } from "@/domain/viewer";

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

// 06.3-02(D-6307 · D-6308): 같은 기안자의 살아 있는 신청과 겹치는 첫 영업일. 트랜잭션 안에서는 그 `tx`를 넘긴다
// (전역 db로 읽으면 풀 고갈 교착 — CEO-2).
export async function findLiveLeaveOverlap(
  viewer: Viewer,
  input: { drafterId: string; candidate: LeaveSpan & { fiscalYear: number }; holidays: HolidayLookup; excludeId?: string },
  tx?: DbOrTx,
): Promise<LeaveOverlapHit | null> {
  const { candidate } = input;
  const rows = await listLiveLeaveInRange(
    viewer,
    {
      drafterId: input.drafterId,
      fiscalYear: candidate.fiscalYear,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      documentKind: LEAVE_DOCUMENT_KIND,
      excludeId: input.excludeId,
    },
    tx,
  );
  const live = rows.map((row) => ({
    kind: row.kind as LeaveKind,
    half: row.half as HalfPeriod | null,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
  return findLeaveOverlap(candidate, live, input.holidays);
}
