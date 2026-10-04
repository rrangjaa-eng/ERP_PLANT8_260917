import { describe, expect, it } from "vitest";
import { incomeTypeFor, pickTaxDates } from "@/domain/expenses/tax";

// 05-03 — 세금 호출자의 순수 조각. 규칙 전 칸 · 기준일 사슬 · 세율 바뀜은 05-06이 굳힌다.
describe("incomeTypeFor", () => {
  it("사업소득 증빙은 business다", () => {
    expect(incomeTypeFor("business_income")).toBe("business");
  });

  it.each(["other_income", "tax_invoice", null])("%s는 other다", (evidenceType) => {
    expect(incomeTypeFor(evidenceType)).toBe("other");
  });
});

describe("pickTaxDates (D-101)", () => {
  // 작성 시각 2026-09-30 23:30 서울(UTC 14:30) — 서울 날짜로 읽어야 9월 30일이다.
  const createdAt = new Date("2026-09-30T14:30:00Z");

  it("지급일이 없으면 지급 쪽은 지급 예정일이다", () => {
    const dates = pickTaxDates({ scheduledPaymentDate: "2026-10-05", createdAt }, { todayKst: "2026-10-04" });
    expect(dates.paymentDate).toBe("2026-10-05");
  });

  it("지급 예정일도 없으면 지급 쪽은 서울 오늘이다", () => {
    const dates = pickTaxDates({ scheduledPaymentDate: null, createdAt }, { todayKst: "2026-10-04" });
    expect(dates.paymentDate).toBe("2026-10-04");
  });

  it("증빙일이 없으면 증빙 쪽은 작성일(created_at의 서울 날짜)이다", () => {
    const dates = pickTaxDates({ scheduledPaymentDate: null, createdAt }, { todayKst: "2026-10-04" });
    expect(dates.evidenceDate).toBe("2026-09-30");
  });
});
