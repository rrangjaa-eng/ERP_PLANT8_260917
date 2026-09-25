import { describe, expect, it } from "vitest";
import { computeQuoteLineAmounts, quoteLineFormatErrors, quoteLineRowInputSchema, resolveLineKind } from "@/domain/quotes/lines";

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

  it("취소 줄은 견적가 0, 차익 = −실행가(PROJ-02)", () => {
    const result = computeQuoteLineAmounts({
      quantity: 3,
      unitPrice: { currency: "KRW", amount: 1_200_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 800_000, fxRate: 1 },
      lineStatus: "cancelled",
    });
    expect(result.quoteAmountKrw).toBe(0);
    expect(result.profitKrw).toBe(-800_000);
    expect(result.unitPriceColumns.amountKrw).toBe(1_200_000);
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

// 04-13(엔지 리뷰 B §2 · GAP 6) — 행 스키마: 소분류는 견적 줄(종류 없음 = 기존 줄 포함)에서만 필수.
describe("quoteLineRowInputSchema — 줄 종류와 소분류(04-13)", () => {
  const row = (patch: Record<string, unknown>) => ({
    itemName: "항목",
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: -10_000, fxRate: 1 },
    ...patch,
  });
  const messages = (input: Record<string, unknown>) => {
    const parsed = quoteLineRowInputSchema.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  };

  it("새 조정 줄 · 새 견적 외 비용 줄은 소분류가 비어도 통과한다", () => {
    expect(messages(row({ isNew: true, lineKind: "adjustment", subcategory: "" }))).toEqual([]);
    expect(messages(row({ isNew: true, lineKind: "out_of_quote", subcategory: "" }))).toEqual([]);
  });

  it("새 견적 줄(종류 quote 또는 없음)의 빈 소분류는 「소분류를 고르세요.」", () => {
    expect(messages(row({ isNew: true, lineKind: "quote", subcategory: "" }))).toEqual(["소분류를 고르세요."]);
    expect(messages(row({ isNew: true, subcategory: "" }))).toEqual(["소분류를 고르세요."]);
  });

  it("기존 줄(종류 없음)의 빈 소분류도 같은 거부", () => {
    expect(messages(row({ id: "4ca0caf1-a0dd-4e04-a56b-3ebed41def03", version: 1, subcategory: "" }))).toEqual(["소분류를 고르세요."]);
  });

  it("모르는 종류는 받지 않는다", () => {
    expect(messages(row({ isNew: true, lineKind: "bonus", subcategory: "a" }))).not.toEqual([]);
  });
});

// 04-13(엔지 리뷰 B §2 · T-04-64) — 판정 종류: 기존 줄은 DB 행의 종류, 새 줄만 요청 값. 다르면 종류 변경 요청(null).
describe("resolveLineKind — 줄 종류는 바뀌지 않는다(04-13)", () => {
  it("새 줄: 종류가 없으면 quote, 있으면 그 값", () => {
    expect(resolveLineKind({ isNew: true }, undefined)).toBe("quote");
    expect(resolveLineKind({ isNew: true, lineKind: "adjustment" }, undefined)).toBe("adjustment");
  });

  it("기존 줄: 요청이 종류를 싣지 않으면 DB 종류", () => {
    expect(resolveLineKind({}, "adjustment")).toBe("adjustment");
  });

  it("기존 조정 줄에 lineKind quote를 실어 보내면 종류 변경 요청(null) — 요청 종류를 믿지 않는다", () => {
    expect(resolveLineKind({ lineKind: "quote" }, "adjustment")).toBeNull();
    expect(resolveLineKind({ lineKind: "adjustment" }, "quote")).toBeNull();
  });

  it("기존 줄에 같은 종류를 실어 보내면 그 종류", () => {
    expect(resolveLineKind({ lineKind: "out_of_quote" }, "out_of_quote")).toBe("out_of_quote");
  });
});

// 04-13(EXP-14) — 실행가 음수는 견적 외 비용·조정 줄만.
describe("quoteLineFormatErrors — 종류별 음수 실행가(04-13)", () => {
  const line = (execution: number) => ({
    id: "row-1",
    subcategory: "a",
    itemName: "항목",
    unitPrice: { currency: "KRW" as const, amount: 0, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: execution, fxRate: 1 },
  });

  it("견적 줄 실행가 −1은 여전히 형식 오류", () => {
    expect(quoteLineFormatErrors(line(-1), 0, "quote").map((error) => error.field)).toEqual(["execution"]);
  });

  it("견적 외 비용 −50,000 · 조정 −120,000은 통과", () => {
    expect(quoteLineFormatErrors(line(-50_000), 0, "out_of_quote")).toEqual([]);
    expect(quoteLineFormatErrors(line(-120_000), 0, "adjustment")).toEqual([]);
  });
});
