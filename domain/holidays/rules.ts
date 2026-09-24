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
    super(`${year}년 후보를 만들지 못했습니다 · 음력 표에 없는 해 · 음력 표 갱신 필요`);
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

// 효력 해가 있는 법정 공휴일 목록. 확인이 필요한 항목(A1-b)은 공식 출처 확인(04.2-02 Task 2) 전이라 넣지 않았다.
export const STATUTORY_HOLIDAYS: readonly StatutoryHoliday[] = [
  { name: "1월 1일", rule: { month: 1, day: 1 }, substitutable: false, fromYear: 2025, toYear: null },
  { name: "설날", rule: { lunar: "seollal" }, span: "eve-and-next", substitutable: true, fromYear: 2025, toYear: null },
  { name: "3·1절", rule: { month: 3, day: 1 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "어린이날", rule: { month: 5, day: 5 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "부처님오신날", rule: { lunar: "buddhasBirthday" }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "현충일", rule: { month: 6, day: 6 }, substitutable: false, fromYear: 2025, toYear: null },
  { name: "광복절", rule: { month: 8, day: 15 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "추석", rule: { lunar: "chuseok" }, span: "eve-and-next", substitutable: true, fromYear: 2025, toYear: null },
  { name: "개천절", rule: { month: 10, day: 3 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "한글날", rule: { month: 10, day: 9 }, substitutable: true, fromYear: 2025, toYear: null },
  { name: "기독탄신일", rule: { month: 12, day: 25 }, substitutable: true, fromYear: 2025, toYear: null },
];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function generateHolidayRules(year: number): RuleHoliday[] {
  const lunar = LUNAR_HOLIDAY_TABLE[year];
  if (!lunar) throw new LunarTableRangeError(year);

  const statutory: RuleHoliday[] = [];
  const needsSubstitute: RuleHoliday[] = [];
  for (const holiday of STATUTORY_HOLIDAYS) {
    if (holiday.fromYear > year || (holiday.toYear !== null && holiday.toYear < year)) continue;
    const date =
      "lunar" in holiday.rule ? lunar[holiday.rule.lunar] : `${year}-${pad2(holiday.rule.month)}-${pad2(holiday.rule.day)}`;
    const row: RuleHoliday = { date, name: holiday.name, kind: "statutory" };
    statutory.push(row);
    if (holiday.span === "eve-and-next") {
      statutory.push({ date: shiftDate(date, -1), name: `${holiday.name} 연휴`, kind: "statutory" });
      statutory.push({ date: shiftDate(date, 1), name: `${holiday.name} 연휴`, kind: "statutory" });
    } else if (holiday.substitutable && isWeekend(date)) {
      // 제3조 (가)의 토·일 가지. 연휴 속 일요일·겹침·같은 날 병합·막는 날은 Task 3.
      needsSubstitute.push(row);
    }
  }

  const taken = new Set(statutory.map((row) => row.date));
  const substitutes: RuleHoliday[] = [];
  for (const original of needsSubstitute.sort((a, b) => a.date.localeCompare(b.date))) {
    let candidate = shiftDate(original.date, 1);
    while (isWeekend(candidate) || taken.has(candidate)) candidate = shiftDate(candidate, 1);
    taken.add(candidate);
    substitutes.push({ date: candidate, name: original.name, kind: "substitute" });
  }

  return [...statutory, ...substitutes].sort((a, b) => a.date.localeCompare(b.date));
}
