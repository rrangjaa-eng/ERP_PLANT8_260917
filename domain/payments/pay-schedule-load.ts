// 07-01(D-715): 지급 일정의 읽기 경로 — 설정 · 공휴일 · 기준일을 모아 문서마다 pay-schedule.ts 순수 함수를 부른다. 자동값은 저장하지 않고
// 읽을 때마다 셈하므로 공휴일 확정 · 추가 · 삭제가 다음 읽기에서 그대로 반영된다(D-705 · J4 — 트리거 · 재계산 작업 없음).
import type { Viewer } from "@/domain/viewer";
import { toKstDate, type HolidayLookup } from "@/domain/holidays/business-day";
import { loadHolidayLookup, type CalendarDeps } from "@/domain/holidays/calendar";
import { LUNAR_TABLE_FIRST_YEAR, LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { getSettingValue } from "@/domain/settings/registry";
import { PAYMENT_TERM_DAYS, PAYMENT_WEEKDAY } from "@/domain/settings/keys";
import { resolvePaySchedule, type PaySchedule, type PayScheduleConfig } from "@/domain/payments/pay-schedule";
import { listEarliestIssuedOnForExpenses } from "@/repositories/evidence-record-links";

export type PayScheduleSource = {
  id: string;
  submittedAt: Date | null;
  scheduledPaymentDate: string | null;
  // 거래처 지급 기한(07-02 칸 · 07-06 읽기) — 없으면 회사 기본.
  vendorTermDays?: number | null;
};

const NO_DATES: ReadonlySet<string> = new Set();

export async function loadPayScheduleConfig(): Promise<PayScheduleConfig> {
  const [termDays, payWeekday] = await Promise.all([getSettingValue(PAYMENT_TERM_DAYS), getSettingValue(PAYMENT_WEEKDAY)]);
  return { termDays, payWeekday, cutoffHHmm: "14:00" };
}

// 기준일 해들과 오늘 해의 [최소-1, 최대+2]를 음력 표 범위로 잘라 한 번에 읽는다. 표 밖 해는 주말만 뺀다(domain/leave/guard.ts D-6306 선례 —
// LunarTableRangeError가 목록을 깨지 않게, AQ-08).
async function holidayLookupFor(years: readonly number[], deps?: CalendarDeps): Promise<HolidayLookup> {
  const from = Math.min(...years) - 1;
  const to = Math.max(...years) + 2;
  const inTable: number[] = [];
  for (let year = Math.max(from, LUNAR_TABLE_FIRST_YEAR); year <= Math.min(to, LUNAR_TABLE_LAST_YEAR); year += 1) inTable.push(year);
  const loaded = inTable.length > 0 ? await (deps?.loadHolidayLookup ?? loadHolidayLookup)(inTable) : null;
  return (year) => (year < LUNAR_TABLE_FIRST_YEAR || year > LUNAR_TABLE_LAST_YEAR || !loaded ? NO_DATES : loaded(year));
}

// 기준일 = 살아 있는 붙임 증빙 기록의 가장 이른 작성일 → 없으면 제출 시각의 KST 날짜 → 없으면 오늘(expenses.evidence_date는 쓰지 않는다 — AQ-03).
export async function loadPaySchedules(
  viewer: Viewer,
  rows: readonly PayScheduleSource[],
  opts: { today: string; now: Date },
  deps?: CalendarDeps,
): Promise<Map<string, PaySchedule>> {
  if (rows.length === 0) return new Map();
  const [cfg, issuedOn] = await Promise.all([loadPayScheduleConfig(), listEarliestIssuedOnForExpenses(viewer, rows.map((row) => row.id))]);
  const bases = new Map(rows.map((row) => [row.id, issuedOn.get(row.id) ?? (row.submittedAt ? toKstDate(row.submittedAt) : opts.today)]));
  const lookup = await holidayLookupFor([...[...bases.values()].map((date) => Number(date.slice(0, 4))), Number(opts.today.slice(0, 4))], deps);
  const schedules = new Map<string, PaySchedule>();
  for (const row of rows) {
    schedules.set(
      row.id,
      resolvePaySchedule({
        baseDate: bases.get(row.id) ?? opts.today,
        termDays: row.vendorTermDays ?? cfg.termDays,
        manualDate: row.scheduledPaymentDate,
        approvedAt: null,
        now: opts.now,
        lookup,
        cfg,
      }),
    );
  }
  return schedules;
}
