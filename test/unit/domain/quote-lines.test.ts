import { describe, expect, it } from "vitest";
import { computeQuoteLineAmounts } from "@/domain/quotes/lines";

// Phase 4 Task 2 ⑫ — PROJ-02: 클라이언트가 보낸 계산 필드가 무시되고 서버
// 재계산값이 나온다. `computeQuoteLineAmounts`는 DB에 닿지 않는 순수
// 계산이고, `saveQuoteLines`가 실제로 부르는 그 함수다 — 입력 타입에
// quoteAmountKrw·profitKrw 필드가 아예 없어 조작된 raw 객체를 흉내내도
// 읽히지 않는다는 것을 런타임으로도 고정한다.
describe("computeQuoteLineAmounts (PROJ-02, D-63)", () => {
  it("조작된 견적가·차익 값이 페이로드에 섞여 있어도 서버 재계산값만 쓰인다", () => {
    const tampered = {
      quantity: 3,
      unitPrice: { currency: "KRW" as const, amount: 1_200_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 2_800_000, fxRate: 1 },
      // 실제 타입에는 없는 필드 — 브라우저가 조작해 실어 보낼 수 있는 값을 흉내낸다.
      quoteAmountKrw: 999_999_999,
      profitKrw: -999_999_999,
    };

    const result = computeQuoteLineAmounts(tampered);

    expect(result.quoteAmountKrw).toBe(3_600_000);
    expect(result.profitKrw).toBe(800_000);
  });

  it("수량을 비우면 기본 1이 적용돼 단가가 곧 견적가다(D-63)", () => {
    const result = computeQuoteLineAmounts({
      unitPrice: { currency: "KRW", amount: 500_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 0, fxRate: 1 },
    });
    expect(result.quoteAmountKrw).toBe(500_000);
    expect(result.profitKrw).toBe(500_000);
  });

  it("외화 단가는 domain/money를 거쳐 원화로 환산된 뒤 계산된다", () => {
    const result = computeQuoteLineAmounts({
      quantity: 2,
      unitPrice: { currency: "USD", amount: 100, fxRate: 1300 },
      execution: { currency: "KRW", amount: 100_000, fxRate: 1 },
    });
    // round(100 * 1300, 1, "round") = 130000, * 수량 2 = 260000
    expect(result.quoteAmountKrw).toBe(260_000);
    expect(result.profitKrw).toBe(160_000);
    expect(result.unitPriceColumns.currency).toBe("USD");
    expect(result.unitPriceColumns.foreignAmount).toBe("100.00");
  });
});
