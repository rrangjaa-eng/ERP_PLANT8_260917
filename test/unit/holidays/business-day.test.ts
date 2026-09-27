import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  formatKstMinute,
  formatKstTime,
  isBusinessDay,
  toKstDate,
  type HolidayLookup,
} from "@/domain/holidays/business-day";
import { generateHolidayRules } from "@/domain/holidays/rules";

// 04.2-02 Task 1(트레이서) — 규칙 후보 위의 영업일 계산과 KST 경계.
function ruleLookup(): { lookup: HolidayLookup; requested: number[] } {
  const requested: number[] = [];
  const lookup: HolidayLookup = (year) => {
    requested.push(year);
    return new Set(generateHolidayRules(year).map((row) => row.date));
  };
  return { lookup, requested };
}

describe("addBusinessDays", () => {
  it("2026-02-13(금) + 1영업일은 주말과 설 연휴를 건너 02-19(목)이다", () => {
    expect(addBusinessDays("2026-02-13", 1, ruleLookup().lookup)).toBe("2026-02-19");
  });

  it("N=0이면 영업일은 그 날 자신이다", () => {
    expect(addBusinessDays("2026-10-07", 0, ruleLookup().lookup)).toBe("2026-10-07");
  });

  it("N=0이면 비영업일(토)은 다음 영업일로 굴린다", () => {
    expect(addBusinessDays("2026-10-10", 0, ruleLookup().lookup)).toBe("2026-10-12");
  });

  it("N<0은 N영업일 전이다 — 10-06 - 1영업일은 대체공휴일·주말을 건너 10-02다", () => {
    expect(addBusinessDays("2026-10-06", -1, ruleLookup().lookup)).toBe("2026-10-02");
  });

  it("연말을 넘으면 다음 해 공휴일 집합을 요청한다 — 2026-12-31 + 1영업일 = 2027-01-04", () => {
    const { lookup, requested } = ruleLookup();
    expect(addBusinessDays("2026-12-31", 1, lookup)).toBe("2027-01-04");
    expect(requested).toContain(2027);
  });

  it("조회 함수가 모르는 해에 던진 오류는 그대로 전파된다", () => {
    const unknownYear = new Error("2027년 공휴일 표 없음");
    const lookup: HolidayLookup = (year) => {
      if (year !== 2026) throw unknownYear;
      return new Set(generateHolidayRules(2026).map((row) => row.date));
    };
    let caught: unknown;
    try {
      addBusinessDays("2026-12-31", 1, lookup);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(unknownYear);
  });
});

describe("isBusinessDay", () => {
  it("추석(2026-09-25)은 영업일이 아니다", () => {
    expect(isBusinessDay("2026-09-25", ruleLookup().lookup)).toBe(false);
  });

  it("2026-10-07(수)은 영업일이다", () => {
    expect(isBusinessDay("2026-10-07", ruleLookup().lookup)).toBe(true);
  });
});

describe("KST 날짜·시각 문자열", () => {
  it("toKstDate는 KST 자정 직전과 자정에서 하루를 정확히 가른다", () => {
    expect(toKstDate(new Date("2026-10-06T14:59:59Z"))).toBe("2026-10-06");
    expect(toKstDate(new Date("2026-10-06T15:00:00Z"))).toBe("2026-10-07");
  });

  it("formatKstMinute·formatKstTime은 같은 순간을 KST 시각으로 적는다", () => {
    const instant = new Date("2026-09-24T00:00:00Z");
    expect(formatKstMinute(instant)).toBe("2026-09-24 09:00");
    expect(formatKstTime(instant)).toBe("09:00");
  });

  // 04.2-09 Task 3 사후 수정(Opus 편차 판정 (b)) — 삭제된
  // inbox-list-format-time.test.ts가 덮지 않던 KST 자정 경계. hourCycle:
  // "h23"이 없으면 자정이 "24:00"으로 나오는 회귀를 잡는다.
  it("formatKstTime은 KST 자정 경계에서 24:00이 아니라 00:00이다", () => {
    expect(formatKstTime(new Date("2026-09-24T15:00:00Z"))).toBe("00:00");
    expect(formatKstTime(new Date("2026-09-24T14:59:00Z"))).toBe("23:59");
  });
});
