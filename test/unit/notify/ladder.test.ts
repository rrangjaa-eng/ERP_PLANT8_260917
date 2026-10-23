import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { ladderFinishedBefore, ladderRounds } from "@/domain/notify/ladder";

const none: HolidayLookup = () => new Set();
const withHoliday = (...dates: string[]): HolidayLookup => () => new Set(dates);

// 2026-10-12 월 · 15 목 · 20 화(15+3영업일=10-20? 목+3 = 금·월·화) · 21 수.
describe("ladderRounds — 3영업일마다 회차, 3회 상한", () => {
  it("첫 기한 당일 → [1]", () => {
    expect(ladderRounds("2026-10-12", "2026-10-12", none)).toEqual([1]);
  });

  it("기한 전 → 회차 없음", () => {
    expect(ladderRounds("2026-10-12", "2026-10-09", none)).toEqual([]);
  });

  it("+3영업일 → [1,2] · +6 → [1,2,3] · +9 → [1,2,3](상한)", () => {
    expect(ladderRounds("2026-10-12", "2026-10-15", none)).toEqual([1, 2]);
    expect(ladderRounds("2026-10-12", "2026-10-14", none)).toEqual([1]);
    expect(ladderRounds("2026-10-12", "2026-10-20", none)).toEqual([1, 2, 3]);
    expect(ladderRounds("2026-10-12", "2026-10-27", none)).toEqual([1, 2, 3]);
  });

  it("사이에 공휴일이 있으면 그만큼 뒤로", () => {
    expect(ladderRounds("2026-10-12", "2026-10-15", withHoliday("2026-10-13"))).toEqual([1]);
    expect(ladderRounds("2026-10-12", "2026-10-16", withHoliday("2026-10-13"))).toEqual([1, 2]);
  });

  it("첫 기한이 주말이면 다음 영업일부터 센다", () => {
    expect(ladderRounds("2026-10-17", "2026-10-19", none)).toEqual([1]);
  });
});

describe("ladderFinishedBefore — 3회차 기한이 floor보다 이른가", () => {
  it("3회차 기한(10-20)이 floor 10-21보다 이르면 참, 같거나 늦으면 거짓", () => {
    expect(ladderFinishedBefore("2026-10-12", "2026-10-21", none)).toBe(true);
    expect(ladderFinishedBefore("2026-10-12", "2026-10-20", none)).toBe(false);
    expect(ladderFinishedBefore("2026-10-12", "2026-10-13", none)).toBe(false);
  });
});
