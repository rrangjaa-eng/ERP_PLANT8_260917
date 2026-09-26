import { describe, expect, it } from "vitest";
import { toKstDate } from "@/domain/holidays/business-day";
import { LUNAR_HOLIDAY_TABLE, LUNAR_TABLE_FIRST_YEAR, LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import {
  generateHolidayRules,
  INITIAL_MANUAL_HOLIDAYS,
  LunarTableRangeError,
  STATUTORY_HOLIDAYS,
} from "@/domain/holidays/rules";
import { OFFICIAL_2026, OFFICIAL_2027 } from "./official-calendar";

// 04.2-02 Task 1(트레이서) — 규정 제2조 법정 공휴일과 제3조 (가) 토·일 대체까지.
// 노동절·제헌절(A1-b)에 기대지 않는 날짜만 단언한다. 전체 목록 대조는 Task 3.
describe("generateHolidayRules", () => {
  it("2026년 결과에 설·추석 연휴 사흘과 3·1절 대체공휴일(03-02)이 있다", () => {
    const rows = generateHolidayRules(2026);
    const dates = rows.map((row) => row.date);

    for (const date of ["2026-02-16", "2026-02-17", "2026-02-18", "2026-09-24", "2026-09-25", "2026-09-26"]) {
      expect(dates).toContain(date);
    }
    expect(rows.find((row) => row.date === "2026-03-02")).toEqual({
      date: "2026-03-02",
      name: "3·1절",
      kind: "substitute",
    });
    expect(dates).toEqual([...dates].sort());
  });

  it("음력 표에 없는 해는 빈 목록 대신 LunarTableRangeError를 던진다", () => {
    expect(() => generateHolidayRules(2036)).toThrow(LunarTableRangeError);
    expect(() => generateHolidayRules(2036)).toThrow(
      "2036년 후보 생성 실패 · 음력 표에 없는 해 · 음력 표 갱신 필요",
    );
  });
});

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weekdaysBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shift(date, 1)) {
    if (weekday(date) !== 0 && weekday(date) !== 6) dates.push(date);
  }
  return dates;
}

function dateKind(rows: readonly { date: string; kind: string }[]): { date: string; kind: string }[] {
  return rows.map((row) => ({ date: row.date, kind: row.kind }));
}

const TABLE_YEARS = Array.from(
  { length: LUNAR_TABLE_LAST_YEAR - LUNAR_TABLE_FIRST_YEAR + 1 },
  (_, i) => LUNAR_TABLE_FIRST_YEAR + i,
);

// 04.2-02 Task 3 — 확인된(미확인 기본값) 달력으로 제3조 대체 가지 전부·막는 날·교차 연도·검색 한도.
describe("generateHolidayRules — 공식 목록 대조", () => {
  it("2026년 날짜·구분이 공식 목록(OFFICIAL_2026)과 같다", () => {
    expect(dateKind(generateHolidayRules(2026))).toEqual(dateKind(OFFICIAL_2026));
  });

  it("2027년 날짜·구분이 공식 목록(OFFICIAL_2027)과 같다 — 설 연휴 속 일요일(02-07)이 02-09 대체를 만든다", () => {
    expect(dateKind(generateHolidayRules(2027))).toEqual(dateKind(OFFICIAL_2027));
    expect(generateHolidayRules(2027).find((row) => row.date === "2027-02-09")).toEqual({
      date: "2027-02-09",
      name: "설날",
      kind: "substitute",
    });
  });
});

describe("generateHolidayRules — 2025 대체 가지", () => {
  const rows = generateHolidayRules(2025);
  const byDate = (date: string) => rows.filter((row) => row.date === date);

  it("3·1절(토) → 03-03 대체", () => {
    expect(byDate("2025-03-03")).toEqual([{ date: "2025-03-03", name: "3·1절", kind: "substitute" }]);
  });

  it("어린이날·부처님오신날이 같은 날이면 한 행으로 합치고 05-06 대체가 생긴다", () => {
    expect(byDate("2025-05-05")).toEqual([{ date: "2025-05-05", name: "어린이날 · 부처님오신날", kind: "statutory" }]);
    expect(byDate("2025-05-06")).toEqual([
      { date: "2025-05-06", name: "어린이날 · 부처님오신날", kind: "substitute" },
    ]);
  });

  it("추석 연휴 속 일요일(10-05) → 연휴 뒤 첫 비공휴일 평일 10-08 대체", () => {
    expect(byDate("2025-10-08")).toEqual([{ date: "2025-10-08", name: "추석", kind: "substitute" }]);
    expect(rows.filter((row) => row.kind === "substitute" && row.date.startsWith("2025-10"))).toHaveLength(1);
  });
});

describe("generateHolidayRules — 막는 날(blockers)", () => {
  it("2027 개천절 대체일 10-04가 막히면 10-05로 간다", () => {
    const rows = generateHolidayRules(2027, { blockers: new Set(["2027-10-04"]) });
    expect(rows.map((row) => row.date)).not.toContain("2027-10-04");
    expect(rows.find((row) => row.name === "개천절" && row.kind === "substitute")?.date).toBe("2027-10-05");
  });

  it("막는 날은 대체를 일으키지 않는다(토·일 막는 날이 있어도 결과가 같다)", () => {
    const blockers = new Set(["2027-06-05", "2027-06-13", "2027-11-20"]);
    expect(generateHolidayRules(2027, { blockers })).toEqual(generateHolidayRules(2027));
  });
});

describe("generateHolidayRules — 교차 연도 대체일", () => {
  const lateDecember = weekdaysBetween("2027-12-27", "2027-12-31");

  it("2027-12-27~31이 막히면 기독탄신일 대체는 2028-01-03이고 마지막 행이다", () => {
    const rows = generateHolidayRules(2027, { blockers: new Set(lateDecember) });
    expect(rows.at(-1)).toEqual({ date: "2028-01-03", name: "기독탄신일", kind: "substitute" });
  });

  it("2028-01-03까지 막히면 2028-01-04다", () => {
    const rows = generateHolidayRules(2027, { blockers: new Set([...lateDecember, "2028-01-03"]) });
    expect(rows.at(-1)).toEqual({ date: "2028-01-04", name: "기독탄신일", kind: "substitute" });
  });

  it("막는 날이 없으면 결과는 그 해 날짜뿐이다", () => {
    expect(generateHolidayRules(2027).every((row) => row.date.startsWith("2027-"))).toBe(true);
  });

  it("다음 해 설 연휴를 공휴일로 치고 건너뛴다(2032 성탄절 → 2033-02-02)", () => {
    const blockers = [...weekdaysBetween("2032-12-27", "2032-12-31"), ...weekdaysBetween("2033-01-03", "2033-01-28")];
    expect(blockers).toHaveLength(25);
    const rows = generateHolidayRules(2032, { blockers: new Set(blockers) });
    expect(rows.at(-1)).toEqual({ date: "2033-02-02", name: "기독탄신일", kind: "substitute" });

    const taken = generateHolidayRules(2032, { blockers: new Set([...blockers, "2033-02-02"]) });
    expect(taken.at(-1)).toEqual({ date: "2033-02-03", name: "기독탄신일", kind: "substitute" });
  });

  it("다음 해 12월 31일까지 자리가 없으면 다다음 해를 고르지 않고 던진다", () => {
    const blockers = new Set(weekdaysBetween("2027-12-27", "2028-12-31"));
    expect(() => generateHolidayRules(2027, { blockers })).toThrow("2027년 대체공휴일 자리 없음");
  });
});

describe("generateHolidayRules — 표의 모든 해 성질", () => {
  it.each(TABLE_YEARS)("%i년: 날짜 유일·오름차순, 대체일은 월~금이고 다른 규칙 공휴일과 겹치지 않는다", (year) => {
    const rows = generateHolidayRules(year);
    const dates = rows.map((row) => row.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual([...dates].sort());
    for (const row of rows.filter((r) => r.kind === "substitute")) {
      expect([1, 2, 3, 4, 5]).toContain(weekday(row.date));
    }
  });

  it.each(TABLE_YEARS)("%i년: 음력 표 세 날짜를 ICU 단기력으로 되읽으면 1.1·4.8·8.15다", (year) => {
    const format = new Intl.DateTimeFormat("ko-KR-u-ca-dangi", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
    const lunarOf = (date: string) => {
      const parts = format.formatToParts(new Date(`${date}T12:00:00+09:00`));
      return `${parts.find((p) => p.type === "month")?.value}.${parts.find((p) => p.type === "day")?.value}`;
    };
    const dates = LUNAR_HOLIDAY_TABLE[year];
    expect(dates).toBeDefined();
    expect(dates && [lunarOf(dates.seollal), lunarOf(dates.buddhasBirthday), lunarOf(dates.chuseok)]).toEqual([
      "1.1",
      "4.8",
      "8.15",
    ]);
  });

  it("효력 시작 해 전에는 그 항목이 결과에 없다", () => {
    const later = STATUTORY_HOLIDAYS.filter((holiday) => holiday.fromYear > LUNAR_TABLE_FIRST_YEAR);
    expect(later.length).toBeGreaterThan(0);
    for (const holiday of later) {
      for (let year = LUNAR_TABLE_FIRST_YEAR; year < holiday.fromYear; year++) {
        const names = generateHolidayRules(year).flatMap((row) => row.name.split(" · "));
        expect(names).not.toContain(holiday.name);
      }
      const names = generateHolidayRules(holiday.fromYear).flatMap((row) => row.name.split(" · "));
      expect(names).toContain(holiday.name);
    }
  });

  it("표 밖의 해(2024)도 LunarTableRangeError를 던진다", () => {
    expect(() => generateHolidayRules(2024)).toThrow(
      "2024년 후보 생성 실패 · 음력 표에 없는 해 · 음력 표 갱신 필요",
    );
    expect(() => generateHolidayRules(2024)).toThrow(LunarTableRangeError);
  });

  it("음력 표 마지막 해가 KST 올해 + 2 이상이다(표 갱신 알림)", () => {
    expect(LUNAR_TABLE_LAST_YEAR).toBeGreaterThanOrEqual(Number(toKstDate(new Date()).slice(0, 4)) + 2);
  });
});

describe("INITIAL_MANUAL_HOLIDAYS", () => {
  it("날짜는 ISO, 구분은 임시공휴일·선거일, 규칙 결과와 날짜가 겹치지 않는다", () => {
    expect(INITIAL_MANUAL_HOLIDAYS).toContainEqual({ date: "2026-06-03", name: "제9회 전국동시지방선거", kind: "election" });
    for (const holiday of INITIAL_MANUAL_HOLIDAYS) {
      expect(holiday.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["temporary", "election"]).toContain(holiday.kind);
      const year = Number(holiday.date.slice(0, 4));
      expect(generateHolidayRules(year).map((row) => row.date)).not.toContain(holiday.date);
    }
  });
});
