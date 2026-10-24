import { describe, expect, it } from "vitest";
import { addDays, kstDateOf, kstDateTimeOf, kstDateTimeSecondsOf, kstDayStart, kstToday, kstYear } from "@/lib/kst-date";

// RESEARCH.md Pitfall 7 — 날짜 경계는 서버·DB 시간대와 무관해야 한다. 이
// 모듈은 현재 시각을 스스로 읽지 않는다(인자로만 받는다) — 04-21의 E2E가
// kstToday 기준 상대 날짜를 쓰기 위한 전제(A-18).

describe("kstToday — 경계 두 시각(KST 자정)", () => {
  it("2026-09-17T14:59:59Z(= KST 09-17 23:59:59)는 2026-09-17이다", () => {
    expect(kstToday(new Date("2026-09-17T14:59:59Z"))).toBe("2026-09-17");
  });

  it("2026-09-17T15:00:00Z(= KST 09-18 00:00:00)는 2026-09-18이다", () => {
    expect(kstToday(new Date("2026-09-17T15:00:00Z"))).toBe("2026-09-18");
  });
});

describe("kstDateOf · kstYear — 연말 넘김", () => {
  it("kstDateOf(2026-12-31T15:30:00Z) → 2027-01-01(연도 경계)", () => {
    expect(kstDateOf(new Date("2026-12-31T15:30:00Z"))).toBe("2027-01-01");
  });

  it("kstYear(2026-12-31T15:00:00Z) → 2027", () => {
    expect(kstYear(new Date("2026-12-31T15:00:00Z"))).toBe(2027);
  });
});

describe("addDays — 달력 날짜 산술", () => {
  it("2026-09-17 + 1 → 2026-09-18", () => {
    expect(addDays("2026-09-17", 1)).toBe("2026-09-18");
  });

  it("2026-12-31 + 1 → 2027-01-01(연말)", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("2024-02-28 + 1 → 2024-02-29(윤년)", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("kstDayStart — KST 날짜 ↔ 그날 00:00 시각 왕복(B-25)", () => {
  it("kstDayStart(2026-09-19) → 2026-09-18T15:00:00.000Z", () => {
    expect(kstDayStart("2026-09-19").toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });

  it.each(["2026-01-01", "2026-09-19", "2026-12-31", "2024-02-29", "2025-02-28"])(
    "kstDateOf(kstDayStart(%s)) === %s(왕복)",
    (ymd) => {
      expect(kstDateOf(kstDayStart(ymd))).toBe(ymd);
    },
  );
});

describe("kstDateTimeOf — `YYYY-MM-DD HH:mm` KST (06.5 V11)", () => {
  it("2026-10-13T10:50:00Z(UTC)는 KST 2026-10-13 19:50이다", () => {
    expect(kstDateTimeOf(new Date("2026-10-13T10:50:00Z"))).toBe("2026-10-13 19:50");
  });

  it("2026-12-31T15:00:00Z는 KST 새해 경계 2027-01-01 00:00이다", () => {
    expect(kstDateTimeOf(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01 00:00");
  });

  it("초는 버린다(…T10:50:59Z → 19:50)", () => {
    expect(kstDateTimeOf(new Date("2026-10-13T10:50:59Z"))).toBe("2026-10-13 19:50");
  });
});

describe("kstDateTimeSecondsOf — `YYYY-MM-DD HH:mm:ss` KST (07-25 감사 로그: 같은 분 안 순서)", () => {
  it("UTC 2026-10-22 15:30:07은 KST 2026-10-23 00:30:07이다", () => {
    expect(kstDateTimeSecondsOf(new Date("2026-10-22T15:30:07Z"))).toBe("2026-10-23 00:30:07");
  });

  it("새해 경계 2026-12-31T15:00:00Z는 2027-01-01 00:00:00이다(자정이 24가 아니다)", () => {
    expect(kstDateTimeSecondsOf(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01 00:00:00");
  });

  it("같은 분의 두 순간이 초로 구별된다", () => {
    const a = kstDateTimeSecondsOf(new Date("2026-10-13T10:50:01Z"));
    const b = kstDateTimeSecondsOf(new Date("2026-10-13T10:50:59Z"));
    expect(a).toBe("2026-10-13 19:50:01");
    expect(b).toBe("2026-10-13 19:50:59");
  });
});
