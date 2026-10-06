import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { ProjectLineEditCtx } from "@/domain/rules/register";
import { moneyFromRow, type Money } from "@/domain/money";
import type { TaxRates } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { lineRoom, lineRoomHint, purchaseEstimateSupply, type LineRoomBasis } from "@/domain/corp-card-usages/link-targets";
import type { LineLinks } from "@/repositories/quote-line-links";

// 06-07(D-609 · Q3 · U-8 · Q-E · X-5 · X-6 · N-3): 카드 쪽 게이트 둘 · 남은 실행가 식 · 04 `project.line-edit`의 D-47 ③ 갈래와 보관 붙잡기.

function krw(amount: number): Money {
  return moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: amount });
}

function rates(): TaxRates {
  return {
    asOf: "2026-10-06",
    vatRate: 0.1,
    vatUnit: 1,
    withholdingOtherRate: 0.088,
    withholdingBusinessRate: 0.033,
    withholdingOtherExemptThreshold: 125_000,
    withholdingUnit: 10,
    minWithholding: 1_000,
    companyBorneRate: 0.033,
    companyBorneMethod: "flat",
    basisWithholding: "payment_date",
    basisVat: "evidence_date",
  };
}

const VAT: TaxRule = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };
const NONE: TaxRule = { ruleKind: "none" };
const WITHHOLDING: TaxRule = { ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 1000, basisDate: "payment_date" };
const COMPANY_BORNE: TaxRule = { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" };

function basisWith(rule: TaxRule): LineRoomBasis {
  return { rates: rates(), rules: { L: rule }, defaultRule: VAT };
}

function links(partial: Partial<LineLinks>): LineLinks {
  return { currentLineId: "L", currentExecution: krw(1_000_000), expenses: [], cardUsages: [], purchaseRequests: [], ...partial };
}

const EXPENSE = {
  id: "e1",
  quoteLineId: "L",
  number: "26001-0007",
  installment: false,
  installmentSeq: null,
  supplyCurrency: "KRW",
  supplyForeignAmount: null,
  supplyFxRate: "1.0000",
  supplyAmountKrw: 500_000,
  submittedAt: new Date("2026-10-01T00:00:00Z"),
};

describe("card.dual-link-block", () => {
  it("side card · 이어진 지출결의 있음 → 막힘 `지출결의 {번호} 연결됨 · 다른 줄 고르기`", async () => {
    await expect(gate(null, "card.dual-link-block", { side: "card", links: links({ expenses: [EXPENSE] }) })).resolves.toEqual({
      allowed: false,
      reason: "지출결의 26001-0007 연결됨 · 다른 줄 고르기",
    });
  });

  it("side card · 카드 사용만 있음 → 통과(같은 쪽 여러 건)", async () => {
    const cardUsages = [
      { id: "u1", quoteLineId: "L", supplyKrw: 100 },
      { id: "u2", quoteLineId: "L", supplyKrw: 200 },
    ];
    await expect(gate(null, "card.dual-link-block", { side: "card", links: links({ cardUsages }) })).resolves.toEqual({ allowed: true });
  });

  it("side card · 연결 0 → 통과", async () => {
    await expect(gate(null, "card.dual-link-block", { side: "card", links: links({}) })).resolves.toEqual({ allowed: true });
  });

  it("side expense · 보관 안 된 카드 사용 있음 → 막힘 `카드 사용 {N}건 연결됨 · 지출결의는 다른 줄`", async () => {
    const cardUsages = [
      { id: "u1", quoteLineId: "L", supplyKrw: 100 },
      { id: "u2", quoteLineId: "L", supplyKrw: 200 },
    ];
    await expect(gate(null, "card.dual-link-block", { side: "expense", links: links({ cardUsages }) })).resolves.toEqual({
      allowed: false,
      reason: "카드 사용 2건 연결됨 · 지출결의는 다른 줄",
    });
  });
});

describe("card.execution-cap", () => {
  const base = { execution: krw(5_000_000), otherSupplies: [krw(1_200_000)], amountVisible: true };

  it("실행가 5,000,000 · 다른 1,200,000 · 이번 3,800,000 · entry → 통과", async () => {
    const ctx = { ...base, supply: { currency: "KRW" as const, amount: 3_800_000, fxRate: 1 }, source: "entry" as const, link: "pickable" as const };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: true });
  });

  it("이번 3,800,001 · entry · pickable → 막힘 `실행가 초과 · 남은 실행가 3,800,000 · 다른 줄 고르기`", async () => {
    const ctx = { ...base, supply: { currency: "KRW" as const, amount: 3_800_001, fxRate: 1 }, source: "entry" as const, link: "pickable" as const };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: false, reason: "실행가 초과 · 남은 실행가 3,800,000 · 다른 줄 고르기" });
  });

  it("같은 초과 · fixed · pmName 박서연 → 막힘 `… · 견적 줄은 담당 PM 박서연`", async () => {
    const ctx = {
      ...base,
      supply: { currency: "KRW" as const, amount: 3_800_001, fxRate: 1 },
      source: "entry" as const,
      link: "fixed" as const,
      pmName: "박서연",
    };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: false, reason: "실행가 초과 · 남은 실행가 3,800,000 · 견적 줄은 담당 PM 박서연" });
  });

  it("같은 초과 · quote.amount 못 봄(CSO-2) → 막힘 · 남은 실행가 숫자 없음 `실행가 초과 · 다른 줄 고르기`", async () => {
    const ctx = { ...base, amountVisible: false, supply: { currency: "KRW" as const, amount: 3_800_001, fxRate: 1 }, source: "entry" as const, link: "pickable" as const };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: false, reason: "실행가 초과 · 다른 줄 고르기" });
  });

  it("같은 초과 · source reconciliation → 통과(U-8)", async () => {
    const ctx = { ...base, supply: { currency: "KRW" as const, amount: 3_800_001, fxRate: 1 }, source: "reconciliation" as const, link: "pickable" as const };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: true });
  });

  it("같은 초과 · source settled · fixed → 통과(Q-E)", async () => {
    const ctx = { ...base, supply: { currency: "KRW" as const, amount: 3_800_001, fxRate: 1 }, source: "settled" as const, link: "fixed" as const, pmName: "박서연" };
    await expect(gate(null, "card.execution-cap", ctx)).resolves.toEqual({ allowed: true });
  });
});

describe("purchaseEstimateSupply (X-5)", () => {
  const estimate = { currency: "KRW" as const, amount: 1_100_000, fxRate: 1 };

  it("vat_surcharge · 세율 0.1 · 1,100,000 → 1,000,000", () => {
    expect(purchaseEstimateSupply(estimate, basisWith(VAT), "L")).toBe(1_000_000);
  });

  it("none · 1,100,000 → 1,100,000", () => {
    expect(purchaseEstimateSupply(estimate, basisWith(NONE), "L")).toBe(1_100_000);
  });

  it("withholding · 1,100,000 → 1,100,000(부가세 가르지 않음)", () => {
    expect(purchaseEstimateSupply(estimate, basisWith(WITHHOLDING), "L")).toBe(1_100_000);
  });

  it("company_borne · 1,100,000 → 1,100,000(부가세 가르지 않음)", () => {
    expect(purchaseEstimateSupply(estimate, basisWith(COMPANY_BORNE), "L")).toBe(1_100_000);
  });
});

describe("lineRoom", () => {
  // 카드 사용 600,000 하나 · `신청됨` 요청 하나(예상 금액 110,000 → vat_surcharge 예상 공급가 100,000).
  const linkMap = new Map([
    [
      "L",
      links({
        cardUsages: [{ id: "u1", quoteLineId: "L", supplyKrw: 600_000 }],
        purchaseRequests: [{ id: "r1", quoteLineId: "L", estimate: krw(110_000) }],
      }),
    ],
  ]);
  const basis = basisWith(VAT);

  it("exclude 없음 → otherSupplies 합 700,000 · 카드 1건 600,000 · 요청 1건 100,000", () => {
    const room = lineRoom({ links: linkMap, basis, lineId: "L", exclude: {} });
    expect(room.otherSupplies.map((money) => money.amountKrw)).toEqual([600_000, 100_000]);
    expect(room.cards).toEqual({ count: 1, sum: 600_000 });
    expect(room.requests).toEqual({ count: 1, sum: 100_000 });
  });

  it("exclude usageId → 요청 100,000만", () => {
    const room = lineRoom({ links: linkMap, basis, lineId: "L", exclude: { usageId: "u1" } });
    expect(room.otherSupplies.map((money) => money.amountKrw)).toEqual([100_000]);
  });

  it("exclude requestId → 카드 600,000만", () => {
    const room = lineRoom({ links: linkMap, basis, lineId: "L", exclude: { requestId: "r1" } });
    expect(room.otherSupplies.map((money) => money.amountKrw)).toEqual([600_000]);
  });

  it("lineRoomHint — 둘 다 0건 · 남은 1,000,000 → `남은 실행가 1,000,000`", () => {
    expect(lineRoomHint({ remaining: 1_000_000, cards: { count: 0, sum: 0 }, requests: { count: 0, sum: 0 } })).toBe("남은 실행가 1,000,000");
  });

  it("lineRoomHint — 카드 1건 · 요청 1건 · 남은 300,000", () => {
    expect(lineRoomHint({ remaining: 300_000, cards: { count: 1, sum: 600_000 }, requests: { count: 1, sum: 100_000 } })).toBe(
      "남은 실행가 300,000 · 카드 사용 1건 600,000 · 구매 요청 1건 100,000",
    );
  });

  it("lineRoomHint — 요청만 · 남은 900,000", () => {
    expect(lineRoomHint({ remaining: 900_000, cards: { count: 0, sum: 0 }, requests: { count: 1, sum: 100_000 } })).toBe("남은 실행가 900,000 · 구매 요청 1건 100,000");
  });
});

function lineEdit(partial: Partial<ProjectLineEditCtx> & Pick<ProjectLineEditCtx, "status" | "lineKind" | "change">): ProjectLineEditCtx {
  return { actorCanWrite: true, actorCanAdjust: false, hasLinkedDocuments: false, ...partial };
}

describe("project.line-edit D-47 ③", () => {
  it("completed · out_of_quote · insert · completedOutOfQuote → 통과", async () => {
    const ctx = lineEdit({ status: "completed", lineKind: "out_of_quote", change: { kind: "insert", quoteCellsZero: true }, completedOutOfQuote: true });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: true });
  });

  it("같은데 completedOutOfQuote 없음 → 막힘 `완료 · 견적 줄 잠김`", async () => {
    const ctx = lineEdit({ status: "completed", lineKind: "out_of_quote", change: { kind: "insert", quoteCellsZero: true } });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
  });

  it("completed · quote · insert · completedOutOfQuote → 막힘(예외는 견적 외 비용 줄 추가만)", async () => {
    const ctx = lineEdit({ status: "completed", lineKind: "quote", change: { kind: "insert", quoteCellsZero: true }, completedOutOfQuote: true });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
  });

  it("settling · out_of_quote · insert · quoteCellsZero → 통과", async () => {
    const ctx = lineEdit({ status: "settling", lineKind: "out_of_quote", change: { kind: "insert", quoteCellsZero: true } });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: true });
  });
});

describe("project.line-edit N-3 보관 붙잡기", () => {
  it("draft · quote · archive · hasCardSideLinks → 막힘 `연결 문서 있음 · 삭제 대신 취소`", async () => {
    const ctx = lineEdit({ status: "draft", lineKind: "quote", change: { kind: "archive" }, hasCardSideLinks: true });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: false, reason: "연결 문서 있음 · 삭제 대신 취소" });
  });

  it("같은데 hasCardSideLinks 없음 → 통과", async () => {
    const ctx = lineEdit({ status: "draft", lineKind: "quote", change: { kind: "archive" } });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: true });
  });

  it("update · execution · hasCardSideLinks → 통과(금액 셀은 붙잡지 않는다 — UC-1)", async () => {
    const ctx = lineEdit({ status: "draft", lineKind: "quote", change: { kind: "update", fields: ["execution"] }, hasCardSideLinks: true });
    await expect(gate(null, "project.line-edit", ctx)).resolves.toEqual({ allowed: true });
  });
});
