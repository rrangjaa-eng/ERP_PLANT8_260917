import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { resolvePaySchedule, type PayScheduleConfig } from "@/domain/payments/pay-schedule";

// 사용자 결정 2026-10-22 19:26 KST 카드 「지금처럼 앞 영업일」: 기준일이 비영업일이어도 지급일은 기준일 앞 영업일로 둔다(뒤 첫 영업일로 바꾸지 않는다).
const CFG: PayScheduleConfig = { termDays: 60, payWeekday: "fri", cutoffHHmm: "14:00" };

// 공휴일 고정 Set을 HolidayLookup 꼴로 주입한다(DB 없음).
function holidays(dates: readonly string[] = []): HolidayLookup {
  return (year) => new Set(dates.filter((date) => date.startsWith(`${year}-`)));
}

// 승인을 기준일보다 훨씬 앞(06-29 월 0시)에 두어 마감 넘김 밀림이 끼지 않게 한다.
function resolve(baseDate: string, termDays: number, lookup: HolidayLookup) {
  const approvedAt = new Date("2026-06-29T00:00:00+09:00");
  return resolvePaySchedule({ baseDate, termDays, manualDate: null, approvedAt, now: approvedAt, lookup, cfg: CFG });
}

describe("D-749 · 기준일이 비영업일 — 사용자 결정 2026-10-22: 앞 영업일 유지", () => {
  it("기준 07-04(토) · 기한 1일 → 07-03(금, 기준일 앞 영업일) · no-slot", () => {
    expect(resolve("2026-07-04", 1, holidays())).toMatchObject({ payDate: "2026-07-03", pushReason: "no-slot" });
  });

  it("기준 07-03(금)이 공휴일 · 기한 2일 → 07-02(목) · no-slot", () => {
    expect(resolve("2026-07-03", 2, holidays(["2026-07-03"]))).toMatchObject({ payDate: "2026-07-02", pushReason: "no-slot" });
  });
});
