import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { HolidayYearNotLoadedError } from "@/domain/holidays/calendar";
import { prevBusinessOnOrBefore, resolvePaySchedule, type PayScheduleConfig } from "@/domain/payments/pay-schedule";

// 07-01 Task 1(D-715 · D-741 · D-749): 자동 지급 예정일 — 기한 창(기준일 < d ≤ 기준일 + 기한) 안 마지막 지급 요일을 영업일로 맞춘 날,
// 창에 지급 요일이 없으면 기한 이하 마지막 영업일(no-slot). 공휴일은 고정 Set을 HolidayLookup 꼴로 주입한다(DB 없음).
const CFG: PayScheduleConfig = { termDays: 60, payWeekday: "fri", cutoffHHmm: "14:00" };

function holidays(dates: readonly string[] = [], years: readonly number[] = [2026, 2027]): HolidayLookup {
  const set = new Set(dates);
  return (year) => {
    if (!years.includes(year)) throw new HolidayYearNotLoadedError(year);
    return new Set([...set].filter((date) => date.startsWith(`${year}-`)));
  };
}

// 승인을 기준일 전날 0시로 두어 마감 넘김 밀림(Task 2)이 끼지 않게 한다(D-749 지급일 = 기준일이면 마감이 기준일 전날 14:00).
function resolve(input: { baseDate: string; termDays?: number; manualDate?: string | null; lookup?: HolidayLookup; cfg?: PayScheduleConfig }) {
  const approvedAt = new Date(new Date(`${input.baseDate}T00:00:00+09:00`).getTime() - 24 * 60 * 60 * 1000);
  return resolvePaySchedule({
    baseDate: input.baseDate,
    termDays: input.termDays ?? 60,
    manualDate: input.manualDate ?? null,
    approvedAt,
    now: approvedAt,
    lookup: input.lookup ?? holidays(),
    cfg: input.cfg ?? CFG,
  });
}

describe("prevBusinessOnOrBefore", () => {
  it("영업일이면 그 날 그대로", () => {
    expect(prevBusinessOnOrBefore("2026-07-10", holidays())).toBe("2026-07-10");
  });

  it("주말 · 공휴일이면 앞 영업일 — addBusinessDays(d, 0)처럼 앞으로 구르지 않는다", () => {
    expect(prevBusinessOnOrBefore("2026-07-12", holidays())).toBe("2026-07-10");
    expect(prevBusinessOnOrBefore("2026-07-10", holidays(["2026-07-10"]))).toBe("2026-07-09");
  });
});

describe("resolvePaySchedule — 자동 지급 예정일 (D-715)", () => {
  it("기준 07-03(금) · 기한 60 → limit 09-01(화) 이하 마지막 금요일 08-28 · pushReason null", () => {
    const schedule = resolve({ baseDate: "2026-07-03" });
    expect(schedule).toMatchObject({ payDate: "2026-08-28", autoPayDate: "2026-08-28", manual: false, pushReason: null });
  });

  it("60일째가 정확히 금요일이면 그 금요일 당일", () => {
    // 2026-06-29(월) + 60 = 2026-08-28(금)
    expect(resolve({ baseDate: "2026-06-29" }).autoPayDate).toBe("2026-08-28");
  });

  it("그 금요일이 공휴일이면 목요일", () => {
    expect(resolve({ baseDate: "2026-07-03", lookup: holidays(["2026-08-28"]) }).autoPayDate).toBe("2026-08-27");
  });

  it("금 · 목 연휴(추석 주 흉내)면 그 앞 영업일", () => {
    expect(resolve({ baseDate: "2026-07-03", lookup: holidays(["2026-08-27", "2026-08-28"]) }).autoPayDate).toBe("2026-08-26");
  });

  it("월~금 전부 공휴일인 주면 그 앞 주 마지막 영업일", () => {
    const week = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
    expect(resolve({ baseDate: "2026-07-03", lookup: holidays(week) }).autoPayDate).toBe("2026-08-21");
  });

  it("지급 요일 설정을 읽는다 — 수요일이면 limit 이하 마지막 수요일", () => {
    expect(resolve({ baseDate: "2026-07-03", cfg: { ...CFG, payWeekday: "wed" } }).autoPayDate).toBe("2026-08-26");
  });
});

describe("resolvePaySchedule — 기한 안 지급 요일 없음 (D-741 · D-749)", () => {
  it("D-741: 기한 6일 · 기준 07-03(금) → 창(07-04~07-09)에 금요일 없음 → 07-09(목) · no-slot (다음 금요일 07-10으로 밀지 않음)", () => {
    const schedule = resolve({ baseDate: "2026-07-03", termDays: 6 });
    expect(schedule).toMatchObject({ payDate: "2026-07-09", autoPayDate: "2026-07-09", pushReason: "no-slot" });
  });

  it("D-741: 기한 끝 07-09가 공휴일이면 07-08(수) · no-slot", () => {
    expect(resolve({ baseDate: "2026-07-03", termDays: 6, lookup: holidays(["2026-07-09"]) })).toMatchObject({ autoPayDate: "2026-07-08", pushReason: "no-slot" });
  });

  it("D-749: 기준 07-03(금) · 기한 2 → 창(07-04 · 07-05)에 영업일 0 → 기준일 당일 07-03 · no-slot", () => {
    expect(resolve({ baseDate: "2026-07-03", termDays: 2 })).toMatchObject({ autoPayDate: "2026-07-03", pushReason: "no-slot" });
  });

  it("기준일 당일이 지급 요일이어도 창 밖이다 — 기한 6일 · 기준 금요일은 그 금요일이 아니라 no-slot", () => {
    expect(resolve({ baseDate: "2026-07-03", termDays: 6 }).autoPayDate).not.toBe("2026-07-03");
  });
});

describe("resolvePaySchedule — 해 경계 · 수동 값", () => {
  it("기준 12월 말 + 60 → 다음 해 lookup이 필요하다", () => {
    // 2026-12-28(월) + 60 = 2027-02-26(금)
    expect(resolve({ baseDate: "2026-12-28" }).autoPayDate).toBe("2027-02-26");
  });

  it("lookup이 그 해를 안 읽었으면 HolidayYearNotLoadedError가 그대로 올라온다", () => {
    expect(() => resolve({ baseDate: "2026-12-28", lookup: holidays([], [2026]) })).toThrow(HolidayYearNotLoadedError);
  });

  it("수동 값이 있으면 payDate = 수동 값 · manual · pushReason null · autoPayDate는 따로 계산", () => {
    const schedule = resolve({ baseDate: "2026-07-03", manualDate: "2026-07-17" });
    expect(schedule).toMatchObject({ payDate: "2026-07-17", autoPayDate: "2026-08-28", manual: true, pushReason: null });
  });
});
