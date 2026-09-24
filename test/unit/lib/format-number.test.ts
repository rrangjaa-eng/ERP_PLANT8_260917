import { describe, expect, it } from "vitest";
import { formatKrw, formatForeignAmount, formatFxRate, formatQuantity, formatPercent, formatCount, formatForeignLine } from "@/lib/format-number";

// D-95 — 숫자는 모두 천 단위 쉼표. 04-UI-SPEC.md rev 5 `## Typography`
// 「숫자 서식(D-95)」 237–245행의 표시 규칙 원문을 그대로 고정한다.
describe("format-number — 표시 서식", () => {
  it("formatKrw — 쉼표, 소수 없음", () => {
    expect(formatKrw(12400000)).toBe("12,400,000");
    expect(formatKrw(-120000)).toBe("-120,000");
    expect(formatKrw(0)).toBe("0");
  });

  it("formatForeignAmount — 쉼표 + 소수 2 고정", () => {
    expect(formatForeignAmount(4400)).toBe("4,400.00");
    expect(formatForeignAmount(1000000)).toBe("1,000,000.00");
  });

  it("formatFxRate — 쉼표 + 끝의 0을 뗀 최대 4자리", () => {
    expect(formatFxRate(1350)).toBe("1,350");
    expect(formatFxRate(1318.18)).toBe("1,318.18");
    expect(formatFxRate(1318.1818)).toBe("1,318.1818");
  });

  it("formatQuantity — 쉼표 + 끝의 0을 뗀 최대 2자리", () => {
    expect(formatQuantity(1)).toBe("1");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(1200)).toBe("1,200");
  });

  it("formatPercent — 소수 1자리 + %, null이면 —", () => {
    expect(formatPercent(25.24)).toBe("25.2%");
    expect(formatPercent(-3.44)).toBe("-3.4%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formatCount — 쉼표 정수", () => {
    expect(formatCount(1250)).toBe("1,250");
  });

  it("formatForeignLine — 외화 2행 한 줄, KRW면 null", () => {
    expect(formatForeignLine({ currency: "USD", amount: 4400, fxRate: 1318.1818 })).toBe("USD 4,400.00 @1,318.1818");
    expect(formatForeignLine({ currency: "KRW", amount: 1000, fxRate: 1 })).toBe(null);
  });

  it("(C-15) 비유한 값은 — 로 보인다", () => {
    expect(formatKrw(NaN)).toBe("—");
    expect(formatKrw(Infinity)).toBe("—");
    expect(formatForeignAmount(-Infinity)).toBe("—");
    expect(formatPercent(NaN)).toBe("—");
  });

  it("(C-15) -0과 반올림 뒤 0이 되는 음수는 부호 없이 0", () => {
    expect(formatKrw(-0)).toBe("0");
    expect(formatPercent(-0.04)).toBe("0.0%");
    expect(formatQuantity(-0)).toBe("0");
  });
});
