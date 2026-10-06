import { describe, expect, it } from "vitest";
import { moneyFromRow, toKrw, type Money } from "@/domain/money";
import type { TaxRates } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import {
  cardEvidenceDefault,
  cardExecutionCap,
  cardUsedOnError,
  isCardEvidenceRule,
  splitCardTotal,
} from "@/domain/corp-card-usages/amounts";

// 06-05(D-607 · O-7 · CROSS R-1 · Q3 · U-8 · Q6): 카드 결제 합계 역산 · 증빙 종류 옵션 · 사용일 상한 · 카드 쪽 실행가 상한 — 순수 함수.

function rates(vatUnit: 1 | 10): TaxRates {
  return {
    asOf: "2026-10-06",
    vatRate: 0.1,
    vatUnit,
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

function krw(amount: number): Money {
  return moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: amount });
}

describe("splitCardTotal — 결제 합계 → 원화 · 공급가 · 부가세 · 잔차", () => {
  it("KRW 1,240,000 · vat_surcharge · 부가세율 0.1 · 단위 1 → 공급가 1,127,273 · 부가세 112,727 · 잔차 0", () => {
    expect(splitCardTotal({ money: { currency: "KRW", amount: 1_240_000, fxRate: 1 }, rule: VAT }, rates(1))).toEqual({
      totalKrw: 1_240_000,
      supplyKrw: 1_127_273,
      vatKrw: 112_727,
      residualKrw: 0,
    });
  });

  it("(CROSS R-1, 단위 10) 합계 1,000,001 → 공급가 909,090 · 저장 부가세 90,911 · 재계산 부가세 90,910 · 잔차 −1", () => {
    expect(splitCardTotal({ money: { currency: "KRW", amount: 1_000_001, fxRate: 1 }, rule: VAT }, rates(10))).toEqual({
      totalKrw: 1_000_001,
      supplyKrw: 909_090,
      vatKrw: 90_911,
      residualKrw: -1,
    });
  });

  it("(CROSS R-1, 단위 1) 합계 1,000,004 → 공급가 909,095 · 저장 부가세 90,909 · 재계산 부가세 90,910 · 잔차 +1", () => {
    expect(splitCardTotal({ money: { currency: "KRW", amount: 1_000_004, fxRate: 1 }, rule: VAT }, rates(1))).toEqual({
      totalKrw: 1_000_004,
      supplyKrw: 909_095,
      vatKrw: 90_909,
      residualKrw: 1,
    });
  });

  it("none 규칙 → 공급가 = 합계 · 부가세 0 · 잔차 0", () => {
    expect(splitCardTotal({ money: { currency: "KRW", amount: 48_000, fxRate: 1 }, rule: NONE }, rates(1))).toEqual({
      totalKrw: 48_000,
      supplyKrw: 48_000,
      vatKrw: 0,
      residualKrw: 0,
    });
  });

  it("USD 900.00 @1,474.89 → 원화 = toKrw 값(1,327,401), 그 원화로 역산", () => {
    const money = { currency: "USD" as const, amount: 900, fxRate: 1_474.89 };
    const split = splitCardTotal({ money, rule: VAT }, rates(1));
    expect(split.totalKrw).toBe(toKrw(money));
    expect(split.totalKrw).toBe(1_327_401);
    expect(split).toMatchObject({ supplyKrw: 1_206_728, vatKrw: 120_673, residualKrw: 0 });
  });
});

describe("카드 증빙 종류 옵션", () => {
  it("규칙이 vat_surcharge · none인 종류만 카드 옵션이다 / 원천징수 · 회사 대납은 아니다", () => {
    expect(isCardEvidenceRule(VAT)).toBe(true);
    expect(isCardEvidenceRule(NONE)).toBe(true);
    expect(isCardEvidenceRule({ ...VAT, ruleKind: "withholding" })).toBe(false);
    expect(isCardEvidenceRule({ ...VAT, ruleKind: "company_borne" })).toBe(false);
  });

  it("가맹점 기본 종류가 옵션 밖이면 카드 전표(옵션 안에 있을 때만), 옵션 안이면 그 종류", () => {
    const options = ["card_receipt", "tax_invoice"];
    expect(cardEvidenceDefault("business_income", options)).toEqual({ code: "card_receipt", outsideDefault: "business_income" });
    expect(cardEvidenceDefault("business_income", ["tax_invoice"])).toEqual({ code: null, outsideDefault: "business_income" });
    expect(cardEvidenceDefault("tax_invoice", options)).toEqual({ code: "tax_invoice", outsideDefault: null });
    expect(cardEvidenceDefault(null, options)).toEqual({ code: "card_receipt", outsideDefault: null });
  });
});

describe("사용일 상한(Q6)", () => {
  it("사용일 = 내일(KST) → `사용일 미래 · 오늘까지 날짜로` / 오늘 · 어제 → 통과", () => {
    expect(cardUsedOnError("2026-10-07", "2026-10-06")).toBe("사용일 미래 · 오늘까지 날짜로");
    expect(cardUsedOnError("2026-10-06", "2026-10-06")).toBeNull();
    expect(cardUsedOnError("2026-10-05", "2026-10-06")).toBeNull();
  });
});

describe("cardExecutionCap — 카드 쪽 실행가 상한(Q3 · U-8 · Q-E)", () => {
  const execution = krw(5_000_000);
  const others = [krw(1_200_000)];
  const supply = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

  it("실행가 5,000,000 · 다른 공급가 1,200,000 · 이번 3,800,000 → 남은 3,800,000 · 넘지 않음 · 막히지 않음", () => {
    const cap = cardExecutionCap({ execution, otherSupplies: others, supply: supply(3_800_000), source: "entry" });
    expect(cap.remaining.amountKrw).toBe(3_800_000);
    expect(cap).toMatchObject({ exceeds: false, blocked: false });
  });

  it("이번 3,800,001 · entry → 넘음 · 막힘", () => {
    expect(cardExecutionCap({ execution, otherSupplies: others, supply: supply(3_800_001), source: "entry" })).toMatchObject({ exceeds: true, blocked: true });
  });

  it("같은 초과 · reconciliation(6.1 대사 덮기) → 넘음 · 막히지 않음(U-8 표시만)", () => {
    expect(cardExecutionCap({ execution, otherSupplies: others, supply: supply(3_800_001), source: "reconciliation" })).toMatchObject({ exceeds: true, blocked: false });
  });

  it("같은 초과 · settled(완료 프로젝트 줄의 구매 완료) → 넘음 · 막히지 않음 · 남은 3,800,000(Q-E 기록 · 표시)", () => {
    const cap = cardExecutionCap({ execution, otherSupplies: others, supply: supply(3_800_001), source: "settled" });
    expect(cap).toMatchObject({ exceeds: true, blocked: false });
    expect(cap.remaining.amountKrw).toBe(3_800_000);
  });

  it("다른 공급가 없음 · 실행가 0 → 남은 0 · 이번 1 → 막힘", () => {
    const cap = cardExecutionCap({ execution: krw(0), otherSupplies: [], supply: supply(1), source: "entry" });
    expect(cap.remaining.amountKrw).toBe(0);
    expect(cap).toMatchObject({ exceeds: true, blocked: true });
  });
});
