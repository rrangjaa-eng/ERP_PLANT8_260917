import { describe, expect, it } from "vitest";
import { computeQuoteLineAmounts, quoteLineFormatErrors, quoteLineRowInputSchema, resolveLineKind } from "@/domain/quotes/lines";
import { counterpartSet, lockOrder, pairedMoneyColumns, pairLocked, pairRequestError, planPairWrites } from "@/domain/quotes/adjustment-pair";

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

  it("새 견적 줄(종류 quote 또는 없음)의 빈 소분류는 「소분류 필요 · 소분류 고르기」", () => {
    expect(messages(row({ isNew: true, lineKind: "quote", subcategory: "" }))).toEqual(["소분류 필요 · 소분류 고르기"]);
    expect(messages(row({ isNew: true, subcategory: "" }))).toEqual(["소분류 필요 · 소분류 고르기"]);
  });

  it("기존 줄(종류 없음)의 빈 소분류도 같은 거부", () => {
    expect(messages(row({ id: "4ca0caf1-a0dd-4e04-a56b-3ebed41def03", version: 1, subcategory: "" }))).toEqual(["소분류 필요 · 소분류 고르기"]);
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

// 07.2 PU6(D-7230) — 일수는 수량과 같은 세 검사(0 이하 · 상한 · 소수 2자리), 같은 상한 상수(numeric(12,2) 넘침 22003이 화면에 닿지 않게).
describe("quoteLineFormatErrors — 일수(07.2-06)", () => {
  const line = (days: number) => ({
    id: "row-1",
    subcategory: "a",
    itemName: "항목",
    days,
    unitPrice: { currency: "KRW" as const, amount: 1_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
  });
  const daysErrors = (days: number) => quoteLineFormatErrors(line(days), 0, "quote").filter((error) => error.field === "days");

  it("일수 1e10 → 상한 오류", () => {
    expect(daysErrors(1e10).map((error) => error.reason)).toEqual(["일수 상한 초과 · 일수 수정"]);
  });

  it("소수 3자리 1.255 → 형식 오류(소수 2자리까지)", () => {
    expect(daysErrors(1.255)).toHaveLength(1);
  });

  it("0 · 음수 → 오류", () => {
    expect(daysErrors(0)).toHaveLength(1);
    expect(daysErrors(-1)).toHaveLength(1);
  });

  it("3 · 0.5 · 1.25는 통과", () => {
    expect(daysErrors(3)).toEqual([]);
    expect(daysErrors(0.5)).toEqual([]);
    expect(daysErrors(1.25)).toEqual([]);
  });

  it("행 스키마: 일수를 숫자로 받고 고객 비고 · 대 · 중분류 글자를 받는다", () => {
    const parsed = quoteLineRowInputSchema.parse({
      isNew: true,
      subcategory: "a",
      itemName: "항목",
      days: "3",
      clientRemark: "고객에게",
      midCategory: "중",
      majorCategory: "대",
      unitPrice: { currency: "KRW", amount: 1_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 0, fxRate: 1 },
    });
    expect(parsed).toMatchObject({ days: 3, clientRemark: "고객에게", midCategory: "중", majorCategory: "대" });
  });
});

describe("computeQuoteLineAmounts — 일수(07.2-06 · D-7230)", () => {
  it("수량 2 · 단가 1,000 · 일수 3 → 견적가 6,000", () => {
    const result = computeQuoteLineAmounts({
      quantity: 2,
      days: 3,
      unitPrice: { currency: "KRW", amount: 1_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 0, fxRate: 1 },
    });
    expect(result.quoteAmountKrw).toBe(6_000);
  });
});

// 07.2 PU3(D-7222) — 수수료 줄(commission)은 청구 전용 줄: 음수 단가를 받고(할인 · 감액), 단가는 원화만(조용히 환산하지 않는다 · eng r2 B N7).
describe("quoteLineFormatErrors — 수수료 줄(07.2-06)", () => {
  const line = (unitPrice: { currency: "KRW" | "USD"; amount: number; fxRate: number }) => ({
    id: "row-1",
    subcategory: "commission",
    itemName: "대행 수수료",
    unitPrice,
    execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
  });

  it("수수료 줄 단가 −50,000은 통과 · 견적 줄 단가 음수는 여전히 형식 오류", () => {
    expect(quoteLineFormatErrors(line({ currency: "KRW", amount: -50_000, fxRate: 1 }), 0, "commission")).toEqual([]);
    expect(quoteLineFormatErrors(line({ currency: "KRW", amount: -50_000, fxRate: 1 }), 0, "quote").map((error) => error.field)).toEqual(["unitPrice"]);
  });

  it("수수료 줄 단가 통화가 원화가 아니면 단가 칸 형식 오류(기존 글자)", () => {
    const errors = quoteLineFormatErrors(line({ currency: "USD", amount: 100, fxRate: 1300 }), 0, "commission");
    expect(errors.map((error) => [error.field, error.reason])).toEqual([["unitPrice", "숫자 형식 오류 · 12,400,000처럼"]]);
  });

  it("행 스키마 — 새 수수료 줄은 소분류가 비어도 통과한다", () => {
    const parsed = quoteLineRowInputSchema.safeParse({ ...line({ currency: "KRW", amount: 300_000, fxRate: 1 }), id: undefined, isNew: true, lineKind: "commission", subcategory: "" });
    expect(parsed.success).toBe(true);
  });
});

// 07.2-12(D7298-B · D-7300) — 프로젝트 사이 조정 쌍의 순수 판정.
describe("조정 쌍 순수 판정 (D7298-B)", () => {
  const base = { projectId: "a", isNew: true, kind: "adjustment" as const, storedCounterpartProjectId: null };

  it("상대는 새 조정 줄에만 — 자기 프로젝트 · 견적 줄 · 기존 줄(규칙 줄 포함)에 새 상대를 실으면 거부", () => {
    expect(pairRequestError({ ...base, counterpartProjectId: "b" })).toBeNull();
    expect(pairRequestError({ ...base, counterpartProjectId: undefined })).toBeNull();
    expect(pairRequestError({ ...base, counterpartProjectId: "a" })).toBe("조정 쌍은 새 조정 줄만 · 새로 고침");
    expect(pairRequestError({ ...base, kind: "quote", counterpartProjectId: "b" })).toBe("조정 쌍은 새 조정 줄만 · 새로 고침");
    expect(pairRequestError({ ...base, isNew: false, counterpartProjectId: "b" })).toBe("조정 쌍은 새 조정 줄만 · 새로 고침");
    expect(pairRequestError({ ...base, isNew: false, counterpartProjectId: "b", storedCounterpartProjectId: "b" })).toBeNull();
  });

  it("상대 집합은 새 줄의 요청 상대 + 기존 쌍 줄의 저장 상대(정렬 · 중복 없음), 잠금 순서는 자기 포함 id 오름차순", () => {
    expect(counterpartSet([{ counterpartProjectId: "c" }, {}], [{ counterpartProjectId: "b" }, { counterpartProjectId: null }, { counterpartProjectId: "c" }])).toEqual(["b", "c"]);
    expect(lockOrder("m", ["z", "a", "m"])).toEqual(["a", "m", "z"]);
  });

  it("완료만 잠김 — 진행 · 정산 · 실주는 쌍을 고칠 수 있다", () => {
    expect(pairLocked("completed")).toBe(true);
    for (const status of ["in_progress", "settling", "lost", "sales"]) expect(pairLocked(status)).toBe(false);
  });

  it("짝 쓰기 — 새 쌍 줄은 만들고, 항목명 · 실행가가 바뀐 쌍 줄만 따라 고치고(비고는 따로), 보관한 쌍 줄은 짝도 보관", () => {
    const writes = planPairWrites({
      inserted: [{ id: "n1", counterpartProjectId: "b" }, { id: "n2" }],
      updated: [
        { id: "u1", adjustmentPairId: "p1", counterpartProjectId: "b", changed: ["execution"] },
        { id: "u2", adjustmentPairId: "p2", counterpartProjectId: "b", changed: ["note"] },
        { id: "u3", adjustmentPairId: null, counterpartProjectId: null, changed: ["itemName"] },
      ],
      archived: [{ id: "x1", adjustmentPairId: "p3", counterpartProjectId: "c" }, { id: "x2", adjustmentPairId: null, counterpartProjectId: null }],
    });
    expect(writes).toEqual([
      { kind: "insert", lineId: "n1", counterpartProjectId: "b" },
      { kind: "sync", lineId: "u1", pairId: "p1", counterpartProjectId: "b" },
      { kind: "archive", lineId: "x1", pairId: "p3", counterpartProjectId: "c" },
    ]);
  });

  it("짝 줄 돈 칸 — 저장 칸을 부호만 바꿔 복사한다(USD 외화 금액 · 환율 그대로, 원화 합 0)", () => {
    const paired = pairedMoneyColumns({
      unitPriceCurrency: "KRW",
      unitPriceForeignAmount: null,
      unitPriceFxRate: "1",
      unitPriceAmountKrw: 0,
      executionCurrency: "USD",
      executionForeignAmount: "-0.35",
      executionFxRate: "1350",
      executionAmountKrw: -472,
      quoteAmountKrw: 0,
      profitKrw: 472,
    });
    expect(paired.executionForeignAmount).toBe("0.35");
    expect(paired.executionFxRate).toBe("1350");
    expect(paired.executionAmountKrw).toBe(472);
    expect(paired.profitKrw).toBe(-472);
    expect(Object.is(paired.unitPriceAmountKrw, -0)).toBe(false);
    expect(Object.is(paired.quoteAmountKrw, -0)).toBe(false);
  });
});
