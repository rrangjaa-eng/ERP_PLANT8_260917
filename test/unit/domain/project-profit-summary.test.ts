import { describe, expect, it } from "vitest";
import { summarizeProjectProfit } from "@/domain/projects/profit-summary";

// 07-18(SC-19 · U16) — 정보 면 `손익` 섹션의 숫자. 취소된 줄은 빼고, 견적이 없으면 비율을 못 구해 `계산 불가 · 견적 없음`이다.
describe("summarizeProjectProfit", () => {
  it("취소하지 않은 줄의 차익 합과 차익 ÷ 견적 합(소수 1자리 %)을 돌려준다", () => {
    const result = summarizeProjectProfit([
      { lineStatus: "active", quoteAmountKrw: 1_000_000, profitKrw: 250_000 },
      { lineStatus: "active", quoteAmountKrw: 2_000_000, profitKrw: 504_000 },
      { lineStatus: "cancelled", quoteAmountKrw: 9_000_000, profitKrw: 9_000_000 },
    ]);
    expect(result).toEqual({ kind: "ok", profitKrw: 754_000, ratePct: 25.1 });
  });

  it("조정 줄(견적 0 · 음수 차익)도 합에 든다", () => {
    const result = summarizeProjectProfit([
      { lineStatus: "active", quoteAmountKrw: 1_000_000, profitKrw: 400_000 },
      { lineStatus: "active", quoteAmountKrw: 0, profitKrw: -100_000 },
    ]);
    expect(result).toEqual({ kind: "ok", profitKrw: 300_000, ratePct: 30 });
  });

  it("견적 합이 0이면 계산 불가 · 견적 없음", () => {
    expect(summarizeProjectProfit([])).toEqual({ kind: "unavailable", reason: "견적 없음" });
    expect(summarizeProjectProfit([{ lineStatus: "cancelled", quoteAmountKrw: 5, profitKrw: 5 }])).toEqual({ kind: "unavailable", reason: "견적 없음" });
  });
});
