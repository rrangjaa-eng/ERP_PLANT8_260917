import { describe, expect, it } from "vitest";
import { evidenceAgeDays, isAgeWarn, ORPHAN_EVIDENCE_RULE, orphanCreatedBefore } from "@/domain/evidence-records/aging";
import { addDays, kstDayStart } from "@/lib/kst-date";

// 07.1-01(D-7102 · U-3): 증빙 목록 「며칠째」와 임자 없는 증빙 독촉(07 D-721)이 같은 경계를 쓴다 — 등록 KST 날짜 차.

describe("evidenceAgeDays", () => {
  it("오늘 등록은 0일", () => {
    expect(evidenceAgeDays(new Date("2026-10-27T01:00:00+09:00"), "2026-10-27")).toBe(0);
  });

  it("어제 등록은 1일", () => {
    expect(evidenceAgeDays(new Date("2026-10-26T23:59:00+09:00"), "2026-10-27")).toBe(1);
  });

  it("KST 자정 직전(UTC 14:59) 등록은 그 KST 날짜로 센다", () => {
    expect(evidenceAgeDays(new Date("2026-10-26T14:59:00Z"), "2026-10-26")).toBe(0);
    expect(evidenceAgeDays(new Date("2026-10-26T15:00:00Z"), "2026-10-27")).toBe(0);
    expect(evidenceAgeDays(new Date("2026-10-26T14:59:00Z"), "2026-10-27")).toBe(1);
  });

  it("월 · 해를 넘겨도 날짜 차다", () => {
    expect(evidenceAgeDays(new Date("2025-12-30T10:00:00+09:00"), "2026-01-02")).toBe(3);
  });
});

describe("orphanCreatedBefore", () => {
  it("값은 오늘 − days + 1 일의 KST 자정이다(독촉 기존 식)", () => {
    expect(orphanCreatedBefore("2026-10-27", 7)).toEqual(kstDayStart("2026-10-21"));
  });

  it("createdAt < orphanCreatedBefore(today, days) ⇔ evidenceAgeDays >= days (표본 300개 이상)", () => {
    let samples = 0;
    for (const today of ["2026-01-01", "2026-03-01", "2026-10-27", "2027-02-28"]) {
      for (const days of [1, 2, 7, 30, 60]) {
        const boundary = orphanCreatedBefore(today, days);
        const start = new Date(addDays(today, -days - 2) + "T00:00:00Z").getTime();
        for (let h = 0; h < 24 * 5; h += 1) {
          const createdAt = new Date(start + h * 3_600_000 + 1_800_000);
          expect(createdAt < boundary, `${today} ${days} ${createdAt.toISOString()}`).toBe(evidenceAgeDays(createdAt, today) >= days);
          samples += 1;
        }
      }
    }
    expect(samples).toBeGreaterThanOrEqual(300);
  });
});

describe("ORPHAN_EVIDENCE_RULE", () => {
  it("독촉 기본값 그대로 — 꺼짐 · 7일 · 이메일 켬 · 1~60일", () => {
    expect(ORPHAN_EVIDENCE_RULE.defaults).toEqual({ enabled: false, days: 7, emailEnabled: true });
    expect(ORPHAN_EVIDENCE_RULE.daysRange).toEqual({ min: 1, max: 60 });
  });
});

describe("isAgeWarn", () => {
  it("규칙 꺼짐이면 늘 거짓(U-3 — 색 없음)", () => {
    expect(isAgeWarn({ enabled: false, days: 7 }, "팀 공개", 10)).toBe(false);
  });

  it("켜짐 · 팀 공개/본부 공개 · 경과 >= days만 참", () => {
    expect(isAgeWarn({ enabled: true, days: 7 }, "팀 공개", 7)).toBe(true);
    expect(isAgeWarn({ enabled: true, days: 7 }, "본부 공개", 30)).toBe(true);
    expect(isAgeWarn({ enabled: true, days: 7 }, "팀 공개", 6)).toBe(false);
  });

  it("미공개 · 붙음 · 확인 필요 · 경과일 null은 늘 거짓", () => {
    expect(isAgeWarn({ enabled: true, days: 7 }, "미공개", 30)).toBe(false);
    expect(isAgeWarn({ enabled: true, days: 7 }, "붙음", 30)).toBe(false);
    expect(isAgeWarn({ enabled: true, days: 7 }, "확인 필요", 30)).toBe(false);
    expect(isAgeWarn({ enabled: true, days: 7 }, "팀 공개", null)).toBe(false);
  });
});
