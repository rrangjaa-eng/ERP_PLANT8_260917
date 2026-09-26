import { UserFacingError } from "@/lib/actions/user-facing-error";
import { LUNAR_HOLIDAY_TABLE, type LunarHolidayDates } from "./lunar-table";

// 관공서의 공휴일에 관한 규정 제2조(법정 공휴일)·제3조(대체공휴일)로 그 해 후보를 만든다.
// 선거일·임시공휴일은 규칙이 만들지 않는다(관리자 수동 — 04.2-12).
export const HOLIDAY_KINDS = ["statutory", "substitute", "temporary", "election"] as const;

export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const HOLIDAY_KIND_LABELS: Record<HolidayKind, string> = {
  statutory: "법정 공휴일",
  substitute: "대체공휴일",
  temporary: "임시공휴일",
  election: "선거일",
};

export type RuleHoliday = { date: string; name: string; kind: "statutory" | "substitute" };

export class LunarTableRangeError extends UserFacingError {
  readonly year: number;

  constructor(year: number) {
    super(`${year}년 후보 생성 실패 · 음력 표에 없는 해 · 음력 표 갱신 필요`);
    this.year = year;
  }
}

export type StatutoryHoliday = {
  name: string;
  rule: { month: number; day: number } | { lunar: keyof LunarHolidayDates };
  // 설·추석은 전날·당일·다음날 사흘이다(전날·다음날 이름은 `{name} 연휴`).
  span?: "eve-and-next";
  substitutable: boolean;
  fromYear: number;
  toYear: number | null;
};

// 효력 해가 있는 법정 공휴일 목록.
// 노동절·제헌절(A1-b)은 미확인 기본값이다 — 공식 출처(law.go.kr lsiSeq=285779) 접속 불가, 코디네이터 지시로 카드 추천값(2026 시행 · 대체 대상) 적용, 사용자 확인 필요.
export const STATUTORY_HOLIDAYS: readonly StatutoryHoliday[] = [
  { name: "1월 1일", rule: { month: 1, day: 1 }, substitutable: false, fromYear: 2025, toYear: null },
  { name: "설날", rule: { lunar: "seollal" }, span: "eve-and-next", substitutable: true, fromYear: 2025, toYear: null },
  { name: "3·1절", rule: { month: 3, day: 1 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "노동절", rule: { month: 5, day: 1 }, substitutable: true, fromYear: 2026, toYear: null },
  { name: "어린이날", rule: { month: 5, day: 5 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "부처님오신날", rule: { lunar: "buddhasBirthday" }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "현충일", rule: { month: 6, day: 6 }, substitutable: false, fromYear: 2025, toYear: null },
  { name: "제헌절", rule: { month: 7, day: 17 }, substitutable: true, fromYear: 2026, toYear: null },
  { name: "광복절", rule: { month: 8, day: 15 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "추석", rule: { lunar: "chuseok" }, span: "eve-and-next", substitutable: true, fromYear: 2025, toYear: null },
  { name: "개천절", rule: { month: 10, day: 3 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "한글날", rule: { month: 10, day: 9 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "기독탄신일", rule: { month: 12, day: 25 }, substitutable: true, fromYear: 2025, toYear: null },
];

// 이 시스템을 켜기 전에 지난 선거일·임시공휴일(미확인 기본값 — 사용자 확인 필요). 04.2-06이 규칙 후보와 함께 넣는다.
export const INITIAL_MANUAL_HOLIDAYS: readonly { date: string; name: string; kind: "temporary" | "election" }[] = [
  { date: "2026-06-03", name: "제9회 전국동시지방선거", kind: "election" },
];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function isWeekend(date: string): boolean {
  const day = weekdayOf(date);
  return day === 0 || day === 6;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

type StatutoryDay = { date: string; name: string; base: string; substitutable: boolean; spanEnd: string | null };

// 그 해 효력 있는 법정 공휴일 날짜(연휴 사흘 포함). 음력 날짜가 없으면 음력 항목은 뺀다.
function statutoryDays(year: number, lunar: LunarHolidayDates | undefined): StatutoryDay[] {
  const days: StatutoryDay[] = [];
  for (const holiday of STATUTORY_HOLIDAYS) {
    if (holiday.fromYear > year || (holiday.toYear !== null && holiday.toYear < year)) continue;
    if ("lunar" in holiday.rule) {
      if (!lunar) continue;
      const date = lunar[holiday.rule.lunar];
      if (holiday.span === "eve-and-next") {
        const spanEnd = shiftDate(date, 1);
        const day = { base: holiday.name, substitutable: holiday.substitutable, spanEnd };
        days.push({ ...day, date: shiftDate(date, -1), name: `${holiday.name} 연휴` });
        days.push({ ...day, date, name: holiday.name });
        days.push({ ...day, date: spanEnd, name: `${holiday.name} 연휴` });
        continue;
      }
      days.push({ date, name: holiday.name, base: holiday.name, substitutable: holiday.substitutable, spanEnd: null });
      continue;
    }
    const date = `${year}-${pad2(holiday.rule.month)}-${pad2(holiday.rule.day)}`;
    days.push({ date, name: holiday.name, base: holiday.name, substitutable: holiday.substitutable, spanEnd: null });
  }
  return days;
}

// 제3조: 대체를 일으키는 날은 법정 공휴일뿐이고, blockers(수동 공휴일·다른 원래 해의 대체일)는 대체일 자리만 막는다.
export function generateHolidayRules(year: number, opts: { blockers?: ReadonlySet<string> } = {}): RuleHoliday[] {
  const lunar = LUNAR_HOLIDAY_TABLE[year];
  if (!lunar) throw new LunarTableRangeError(year);
  const nextLunar = LUNAR_HOLIDAY_TABLE[year + 1];

  const byDate = new Map<string, StatutoryDay[]>();
  for (const day of statutoryDays(year, lunar)) byDate.set(day.date, [...(byDate.get(day.date) ?? []), day]);
  const dates = [...byDate.keys()].sort();

  const taken = new Set([
    ...dates,
    ...(opts.blockers ?? []),
    ...statutoryDays(year + 1, nextLunar).map((day) => day.date),
  ]);
  const searchLimit = `${year + 1}-12-31`;
  const firstPossibleSeollal = `${year + 1}-01-20`;

  const substitutes: RuleHoliday[] = [];
  for (const date of dates) {
    const entries = byDate.get(date) ?? [];
    // (가) 토·일 · (나) 연휴 속 일요일 · (다) 다른 공휴일과 같은 날 — 날마다 대체일 하나.
    const lost = entries.filter(
      (entry) =>
        entry.substitutable &&
        (entries.length > 1 || (entry.spanEnd ? weekdayOf(date) === 0 : isWeekend(date))),
    );
    if (lost.length === 0) continue;

    const from = lost.reduce((last, entry) => (entry.spanEnd && entry.spanEnd > last ? entry.spanEnd : last), date);
    let candidate = shiftDate(from, 1);
    while (isWeekend(candidate) || taken.has(candidate)) {
      candidate = shiftDate(candidate, 1);
      if (candidate > searchLimit) throw new Error(`${year}년 대체공휴일 자리 없음`);
      if (!nextLunar && candidate >= firstPossibleSeollal) throw new LunarTableRangeError(year + 1);
    }
    taken.add(candidate);
    substitutes.push({ date: candidate, name: [...new Set(lost.map((entry) => entry.base))].join(" · "), kind: "substitute" });
  }

  const statutory: RuleHoliday[] = dates.map((date) => ({
    date,
    name: (byDate.get(date) ?? []).map((entry) => entry.name).join(" · "),
    kind: "statutory",
  }));
  return [...statutory, ...substitutes].sort((a, b) => a.date.localeCompare(b.date));
}
