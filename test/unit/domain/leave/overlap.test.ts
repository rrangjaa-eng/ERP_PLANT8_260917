import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { findLeaveOverlap, overlapMessage, type LeaveSpan } from "@/domain/leave/overlap";

// 06.3(D-6308 · D-6309): 겹침 = 같은 영업일을 하나라도 먹음, 예외는 반차 오전 + 반차 오후뿐.
// 휴일 = 2026 공휴일 집합(days.test.ts와 같은 표).
const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-01", "2026-05-05",
  "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17", "2026-09-24",
  "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
]);
const lookup2026: HolidayLookup = () => HOLIDAYS_2026;

function day(kind: LeaveSpan["kind"], date: string, half: LeaveSpan["half"] = null): LeaveSpan {
  return { kind, half, startDate: date, endDate: date };
}

describe("findLeaveOverlap — 갈래 행렬(D-6309)", () => {
  it("반차 09-22 오전 vs 살아 있는 종일 09-21~23 → 09-22 종일", () => {
    const live: LeaveSpan = { kind: "full_day", half: null, startDate: "2026-09-21", endDate: "2026-09-23" };
    expect(findLeaveOverlap(day("half_day", "2026-09-22", "am"), [live], lookup2026)).toEqual({ date: "2026-09-22", kind: "full_day" });
  });

  it("반차 오전 vs 반차 오후 같은 날 → 겹침 아님", () => {
    expect(findLeaveOverlap(day("half_day", "2026-09-22", "am"), [day("half_day", "2026-09-22", "pm")], lookup2026)).toBeNull();
  });

  it.each([
    ["반차 오전 vs 반차 오전", day("half_day", "2026-09-22", "am"), day("half_day", "2026-09-22", "am"), "half_day"],
    ["반반차 오전 vs 반반차 오후", day("quarter_day", "2026-09-22", "am"), day("quarter_day", "2026-09-22", "pm"), "quarter_day"],
    ["반차 오전 vs 반반차 오후", day("half_day", "2026-09-22", "am"), day("quarter_day", "2026-09-22", "pm"), "quarter_day"],
    ["반반차 오전 vs 반차 오후", day("quarter_day", "2026-09-22", "am"), day("half_day", "2026-09-22", "pm"), "half_day"],
    ["재택 vs 종일", day("remote", "2026-09-22"), day("full_day", "2026-09-22"), "full_day"],
    ["재택 vs 재택", day("remote", "2026-09-22"), day("remote", "2026-09-22"), "remote"],
    ["종일 vs 반차 오후", day("full_day", "2026-09-22"), day("half_day", "2026-09-22", "pm"), "half_day"],
  ] as const)("%s → 겹침", (_name, candidate, live, kind) => {
    expect(findLeaveOverlap(candidate, [live], lookup2026)).toEqual({ date: "2026-09-22", kind });
  });
});

describe("findLeaveOverlap — 영업일 단위(D-6308)", () => {
  it("살아 있는 종일 10-02~05(영업일 10-02뿐) vs 후보 종일 10-05~06(영업일 10-06뿐) → 겹침 아님", () => {
    const live: LeaveSpan = { kind: "full_day", half: null, startDate: "2026-10-02", endDate: "2026-10-05" };
    const candidate: LeaveSpan = { kind: "full_day", half: null, startDate: "2026-10-05", endDate: "2026-10-06" };
    expect(findLeaveOverlap(candidate, [live], lookup2026)).toBeNull();
  });

  it("겹치는 살아 있는 신청이 둘이면 가장 이른 영업일과 그 신청의 갈래", () => {
    const later: LeaveSpan = { kind: "full_day", half: null, startDate: "2026-09-23", endDate: "2026-09-23" };
    const earlier = day("half_day", "2026-09-22", "pm");
    const candidate: LeaveSpan = { kind: "full_day", half: null, startDate: "2026-09-21", endDate: "2026-09-23" };
    expect(findLeaveOverlap(candidate, [later, earlier], lookup2026)).toEqual({ date: "2026-09-22", kind: "half_day" });
  });

  it("살아 있는 신청이 없으면 null", () => {
    expect(findLeaveOverlap(day("full_day", "2026-09-22"), [], lookup2026)).toBeNull();
  });
});

describe("overlapMessage(D-6315)", () => {
  it("9월 7일 반차 → `9월 7일 반차 신청과 겹침 · 날짜 바꾸기`(앞자리 0 없음)", () => {
    expect(overlapMessage({ date: "2026-09-07", kind: "half_day" })).toBe("9월 7일 반차 신청과 겹침 · 날짜 바꾸기");
  });

  it("10월 22일 종일 → `10월 22일 종일 신청과 겹침 · 날짜 바꾸기`", () => {
    expect(overlapMessage({ date: "2026-10-22", kind: "full_day" })).toBe("10월 22일 종일 신청과 겹침 · 날짜 바꾸기");
  });
});
