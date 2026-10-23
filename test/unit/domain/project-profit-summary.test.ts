import { describe, expect, it } from "vitest";
import { summarizeProjectProfit } from "@/domain/projects/profit-summary";

// 07-18 사후 고침 — 정보 면 `손익`은 목록의 한 정의를 쓴다: 수익금 · 수익률은 리포지토리 행 식이 구하고, 이 함수는 기준 ≤ 0이면
// `계산 불가`(이유는 hover / 폰 탭 `계산 불가 · {이유}`)로 바꾸는 판정만 한다.
describe("summarizeProjectProfit", () => {
  it("기준이 있으면 수익금과 수익률(%)을 그대로 돌려준다", () => {
    expect(summarizeProjectProfit({ profitBasis: "quote", basisKrw: 3_000_000, profitKrw: 750_000, profitRate: 0.25 })).toEqual({
      kind: "ok",
      profitKrw: 750_000,
      ratePct: 25,
    });
  });

  it("수익금이 음수여도 기준이 있으면 계산한다", () => {
    expect(summarizeProjectProfit({ profitBasis: "issued", basisKrw: 1_000_000, profitKrw: -200_000, profitRate: -0.2 })).toEqual({
      kind: "ok",
      profitKrw: -200_000,
      ratePct: -20,
    });
  });

  it("견적 기준이 0 이하이면 계산 불가 · 견적 없음", () => {
    expect(summarizeProjectProfit({ profitBasis: "quote", basisKrw: 0, profitKrw: 0, profitRate: null })).toEqual({ kind: "unavailable", reason: "견적 없음" });
    expect(summarizeProjectProfit({ profitBasis: "quote", basisKrw: -5, profitKrw: 5, profitRate: null })).toEqual({ kind: "unavailable", reason: "견적 없음" });
  });

  it("발행 기준이 0 이하이면 계산 불가 · 발행액 없음", () => {
    expect(summarizeProjectProfit({ profitBasis: "issued", basisKrw: 0, profitKrw: -300_000, profitRate: null })).toEqual({ kind: "unavailable", reason: "발행액 없음" });
  });
});
