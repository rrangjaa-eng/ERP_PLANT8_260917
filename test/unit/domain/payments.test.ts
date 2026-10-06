import { describe, expect, it, vi } from "vitest";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { loadTaxRates, type TaxRates } from "@/domain/money/tax";
import { computeExpenseTax, incomeTypeFor, pickTaxDates } from "@/domain/expenses/tax";
import { GateBlockedError } from "@/domain/rules/gate";
import {
  BasisChangedSignal,
  DIFF_REASON_REQUIRED,
  DiffReasonRequiredError,
  decidePayable,
  judgeLockedPayment,
  PayableChangedError,
  pickPaymentAmount,
  type LockedExpense,
  type PayableInput,
  type PaymentInputs,
  type PaymentShared,
} from "@/domain/payments";
import { approvalGateDecision, resolveExpenseActionRow } from "@/domain/payments/action-row";

// 06-03 — 지급 총액 · 금액 원천(R-4) · 공급가 역산(R-5) · 결재 게이트 · 「지출결의 상태 → 1차」(P0 · P4 · P6). DB 없이 돈다.

const RATES: TaxRates = {
  asOf: "2026-09-22",
  vatRate: 0.1,
  vatUnit: 1,
  withholdingOtherRate: 0.088,
  withholdingBusinessRate: 0.033,
  withholdingOtherExemptThreshold: 125_000,
  withholdingUnit: 10,
  minWithholding: 0,
  companyBorneRate: 0.088,
  companyBorneMethod: "flat",
  basisWithholding: "payment_date",
  basisVat: "evidence_date",
};

const SETTING_VALUES: Record<string, unknown> = {
  "tax.vat.rate": RATES.vatRate,
  "tax.rounding.vat_unit": RATES.vatUnit,
  "tax.withholding.other_income.rate": RATES.withholdingOtherRate,
  "tax.withholding.business_income.rate": RATES.withholdingBusinessRate,
  "tax.withholding.other_income.exempt_threshold": RATES.withholdingOtherExemptThreshold,
  "tax.rounding.withholding_unit": RATES.withholdingUnit,
  "tax.rounding.min_withholding": RATES.minWithholding,
  "tax.company_borne.rate": RATES.companyBorneRate,
  "tax.company_borne.method": RATES.companyBorneMethod,
  "tax.basis_date.withholding": RATES.basisWithholding,
  "tax.basis_date.vat": RATES.basisVat,
};

const VAT_RULE: TaxRule = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };
const WITHHOLDING_RULE: TaxRule = { ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" };
const COMPANY_BORNE_RULE: TaxRule = { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "payment_date" };
const OPTS = { paymentDate: "2026-09-22", evidenceDate: "2026-09-22" };

function vatInput(amountKrw: number, transferKrw?: number, rule: TaxRule = VAT_RULE) {
  return { amount: { source: "supply" as const, amountKrw }, taxRule: rule, applyOpts: OPTS, incomeType: "other" as const, transferKrw };
}

describe("pickPaymentAmount (R-4 · E-7)", () => {
  it("파일 0 · 증빙 금액만 → 공급가", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: false, evidenceAmountKrw: 900_000, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "supply",
      amountKrw: 1_000_000,
    });
  });

  it("파일 있음 · 증빙 금액 → 증빙 금액", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: 900_000, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "evidence",
      amountKrw: 900_000,
    });
  });

  it("파일 있음 · 증빙 금액 없음 → 공급가", () => {
    expect(pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: null, supplyAmountKrw: 1_000_000 })).toEqual({
      source: "supply",
      amountKrw: 1_000_000,
    });
  });
});

describe("decidePayable", () => {
  it("금액은 pickPaymentAmount 결과만 쓴다 — 증빙 금액 원천이면 증빙 금액으로 셈한다", async () => {
    const amount = pickPaymentAmount({ hasLiveEvidence: true, evidenceAmountKrw: 500_000, supplyAmountKrw: 1_000_000 });
    const result = await decidePayable({ amount, taxRule: VAT_RULE, applyOpts: OPTS, incomeType: "other" }, RATES);
    expect(result.payableKrw).toBe(550_000);
  });

  const SAME_AS_05: [string, TaxRule, string][] = [
    ["부가세", VAT_RULE, "tax_invoice"],
    ["원천징수", WITHHOLDING_RULE, "other_income"],
    ["회사 대납", COMPANY_BORNE_RULE, "company_borne"],
  ];
  for (const [label, rule, evidenceType] of SAME_AS_05) {
    it(`같은 입력의 05 computeExpenseTax payable과 같다 — ${label}`, async () => {
      const doc = { evidenceType, supplyAmountKrw: 712_500, scheduledPaymentDate: "2026-09-22", evidenceDate: "2026-09-22", createdAt: new Date("2026-09-01T00:00:00Z") };
      const tax = await computeExpenseTax({ id: "u1" } as never, doc, {
        listCodeItems: vi.fn(() => Promise.resolve([{ value: evidenceType, taxRule: rule }])) as never,
        getSettingValue: vi.fn((def: { key: string }) => Promise.resolve(SETTING_VALUES[def.key])) as never,
        getSettingEntry: vi.fn((def: { key: string }) => Promise.resolve({ value: SETTING_VALUES[def.key], historizedId: null, effectiveFrom: null })) as never,
        now: new Date("2026-09-22T03:00:00Z"),
      });
      if (tax.unavailable) throw new Error("계산 불가");
      const dates = pickTaxDates(doc, { ruleKind: rule.ruleKind, codeBasis: rule.basisDate, basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: "2026-09-22" });
      const result = await decidePayable(
        { amount: { source: "supply", amountKrw: 712_500 }, taxRule: rule, applyOpts: dates.applyOpts, incomeType: evidenceType === "business_income" ? "business" : "other" },
        RATES,
      );
      expect(result.payableKrw).toBe(tax.payableKrw);
    });
  }

  it("vat_surcharge만 공급가 역산 값이 있고 원천징수 · 회사 대납 · 규칙 없음은 null이다(UA-619)", async () => {
    expect((await decidePayable(vatInput(1_000_000), RATES)).grossSupplyKrw).toBe(1_000_000);
    expect((await decidePayable(vatInput(1_000_000, undefined, WITHHOLDING_RULE), RATES)).grossSupplyKrw).toBeNull();
    expect((await decidePayable(vatInput(1_000_000, undefined, COMPANY_BORNE_RULE), RATES)).grossSupplyKrw).toBeNull();
    expect((await decidePayable(vatInput(1_000_000, undefined, { ruleKind: "none" }), RATES)).grossSupplyKrw).toBeNull();
  });

  it("역산 경계 — 이체액 1100 → 1,000 · 1,000,010 → 909,100 · 33 → 30", async () => {
    expect((await decidePayable(vatInput(1_000, 1_100), RATES)).grossSupplyKrw).toBe(1_000);
    expect((await decidePayable(vatInput(909_100, 1_000_010), RATES)).grossSupplyKrw).toBe(909_100);
    expect((await decidePayable(vatInput(30, 33), RATES)).grossSupplyKrw).toBe(30);
  });

  it("역산 경계 — 정방향 절사", async () => {
    const truncateRule: TaxRule = { ...VAT_RULE, roundingMethod: "truncate" };
    const forward = await decidePayable(vatInput(909_096, undefined, truncateRule), RATES);
    // 정방향은 코드표 절사(반올림이었다면 1,000,006), 역산은 "round" 고정 — 1원 차이를 그대로 기대값으로 못박는다(R-5).
    expect(forward.vatKrw).toBe(90_909);
    expect(forward.payableKrw).toBe(1_000_005);
    expect(forward.grossSupplyKrw).toBe(909_095);
    expect((await decidePayable(vatInput(909_096, 1_000_006, truncateRule), RATES)).grossSupplyKrw).toBe(909_096);
  });

  it("이체액을 주지 않으면 이체액 = 지급 총액 · 차이 0이다", async () => {
    const result = await decidePayable(vatInput(1_000_000), RATES);
    expect(result.transferKrw).toBe(1_100_000);
    expect(result.diffKrw).toBe(0);
  });
});

describe("미래 지급일 (RS-11 · Q6)", () => {
  it("pickTaxDates의 payment_date 기준일은 미래 지급일 그대로다", () => {
    const dates = pickTaxDates(
      { paidDate: "2027-03-02", scheduledPaymentDate: "2026-09-30", createdAt: new Date("2026-09-01T00:00:00Z") },
      { ruleKind: "withholding", codeBasis: "payment_date", basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: "2026-09-22" },
    );
    expect(dates.basisDate).toBe("2027-03-02");
  });
});

describe("approvalGateDecision", () => {
  it("approved는 통과한다(자기 승인도 approved로 끝난다 — UA-607)", () => {
    expect(approvalGateDecision({ approvalState: "approved", stepName: null })).toEqual({ allowed: true });
  });

  it("결재 중이면 `결재 통과 전 · {단계} 결재 중`", () => {
    expect(approvalGateDecision({ approvalState: "in_review", stepName: "팀장" })).toEqual({ allowed: false, reason: "결재 통과 전 · 팀장 결재 중" });
    expect(approvalGateDecision({ approvalState: "submitted", stepName: "본부장" })).toEqual({ allowed: false, reason: "결재 통과 전 · 본부장 결재 중" });
  });

  it("반려 · 회수 · 결재 없음은 막힌다", () => {
    expect(approvalGateDecision({ approvalState: "rejected", stepName: null })).toEqual({ allowed: false, reason: "결재 통과 전 · 반려" });
    expect(approvalGateDecision({ approvalState: "withdrawn", stepName: null })).toEqual({ allowed: false, reason: "결재 통과 전 · 회수" });
    expect(approvalGateDecision({ approvalState: null, stepName: null }).allowed).toBe(false);
  });
});

describe("resolveExpenseActionRow", () => {
  const payer = { canPay: true };
  const other = { canPay: false };

  it("결재 통과 전 → P0(버튼 0 · 섹션 없음)", () => {
    expect(resolveExpenseActionRow({ approvalState: "in_review", paid: false }, payer)).toEqual({ row: "P0", primary: null, ownerNote: null });
  });

  it("통과 · 지급 전 → P4(1차 `지급 완료`)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: false }, payer)).toEqual({ row: "P4", primary: "pay", ownerNote: null });
  });

  it("지급 뒤 → P6(1차 없음)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: true }, payer)).toEqual({ row: "P6", primary: null, ownerNote: null });
  });

  it("지급 권한 없음 → 버튼 0 + 담당 표기(지급 전)", () => {
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: false }, other)).toEqual({ row: "P4", primary: null, ownerNote: "지급은 경영관리" });
    expect(resolveExpenseActionRow({ approvalState: "approved", paid: true }, other)).toEqual({ row: "P6", primary: null, ownerNote: null });
  });
});

// Task 2 — 세율 변경 전후 · 원천징수 두 코드 · 조작 필드 무시. 세율은 이력 설정 대역 두 값(2027-01-01부터 12%)을 가짜 읽기로 준다.
function bandedGetSettingValue() {
  return vi.fn((def: { key: string }, opts?: { asOf?: Date }) => {
    if (def.key === "tax.vat.rate") return Promise.resolve(opts?.asOf && opts.asOf >= new Date("2027-01-01T00:00:00Z") ? 0.12 : 0.1);
    return Promise.resolve(SETTING_VALUES[def.key]);
  });
}

describe("decidePayable — 기준일 세율 · 소득 종류 · 조작 필드", () => {
  it("부가세 역산 세율 — 기준일이 세율 변경 전이면 변경 전 세율, 뒤면 뒤 세율", async () => {
    const getSettingValue = bandedGetSettingValue();
    const before = await loadTaxRates("2026-12-31", { getSettingValue: getSettingValue as never });
    const after = await loadTaxRates("2027-01-01", { getSettingValue: getSettingValue as never });
    const at = (date: string) => ({ ...vatInput(1_000_000, 1_100_000), applyOpts: { paymentDate: date, evidenceDate: date } });
    const old = await decidePayable(at("2026-12-31"), before);
    const next = await decidePayable(at("2027-01-01"), after);
    expect([old.payableKrw, old.grossSupplyKrw]).toEqual([1_100_000, 1_000_000]);
    expect([next.payableKrw, next.grossSupplyKrw]).toEqual([1_120_000, 982_143]);
  });

  it("원천징수 business_income · other_income — 역산 null이고 incomeType만 다르다", async () => {
    const input = (incomeType: "business" | "other") => ({ ...vatInput(1_000_000, undefined, WITHHOLDING_RULE), incomeType });
    const business = await decidePayable(input("business"), RATES);
    const other = await decidePayable(input("other"), RATES);
    expect([business.withholdingKrw, business.payableKrw, business.grossSupplyKrw]).toEqual([33_000, 967_000, null]);
    expect([other.withholdingKrw, other.payableKrw, other.grossSupplyKrw]).toEqual([88_000, 912_000, null]);
    expect([incomeTypeFor("business_income"), incomeTypeFor("other_income")]).toEqual(["business", "other"]);
  });

  it("지급 총액 · 역산 필드를 담은 조작 입력도 결과는 재계산값과 같다(필드를 읽지 않는다)", async () => {
    const clean = await decidePayable(vatInput(1_000_000), RATES);
    const tampered = { ...vatInput(1_000_000), payableKrw: 1, grossSupplyKrw: 1, vatKrw: 0 } as PayableInput;
    expect(await decidePayable(tampered, RATES)).toEqual(clean);
  });
});

// 잠금 뒤 판정 — 트랜잭션 콜백이 tx로 읽은 값(잠근 행 · 결재 상태 · 살아 있는 증빙 유무)을 주입한다. DB 없음.
const TODAY = "2026-09-22";
const PAY_DATE = "2026-09-22";
const RULES: Record<string, TaxRule> = { tax_invoice: VAT_RULE, other_income: WITHHOLDING_RULE };
const SHARED: PaymentShared = {
  taxRuleOf: (evidenceType) => (evidenceType ? (RULES[evidenceType] ?? null) : null),
  basisWithholding: "payment_date",
  basisVat: "evidence_date",
  ratesFor: () => Promise.reject(new Error("트랜잭션 안에서 세율을 읽지 않는다")),
};
const ROW: LockedExpense = {
  id: "00000000-0000-4000-8000-000000000001",
  evidenceType: "tax_invoice",
  supplyAmountKrw: 1_000_000,
  evidenceAmount: 900_000,
  scheduledPaymentDate: null,
  evidenceDate: PAY_DATE,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  paymentMethod: "bank_transfer",
};

// 사전 조회 결과(loadPaymentInputs와 같은 규칙 — 05 pickTaxDates · incomeTypeFor · pickPaymentAmount).
function preOf(row: LockedExpense, hasLiveEvidence: boolean): PaymentInputs {
  const taxRule = SHARED.taxRuleOf(row.evidenceType);
  if (!taxRule || row.supplyAmountKrw === null) throw new Error("테스트 행에 규칙 · 공급가 필요");
  const dates = pickTaxDates(
    { paidDate: PAY_DATE, scheduledPaymentDate: row.scheduledPaymentDate, evidenceDate: row.evidenceDate, createdAt: row.createdAt },
    { ruleKind: taxRule.ruleKind, codeBasis: taxRule.basisDate, basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: TODAY },
  );
  return {
    expenseId: row.id,
    today: TODAY,
    payDate: PAY_DATE,
    approvalState: "approved",
    stepName: null,
    evidenceType: row.evidenceType,
    hasLiveEvidence,
    amount: pickPaymentAmount({ hasLiveEvidence, evidenceAmountKrw: row.evidenceAmount, supplyAmountKrw: row.supplyAmountKrw }),
    tax: { taxRule, dates, incomeType: incomeTypeFor(row.evidenceType), rates: { ...RATES, asOf: dates.basisDate } },
  };
}

function judge(over: { pre?: PaymentInputs; locked?: LockedExpense; approvalState?: string; lockedHasEvidence?: boolean; expectedPayableKrw: number }) {
  return judgeLockedPayment({
    pre: over.pre ?? preOf(ROW, false),
    locked: over.locked ?? ROW,
    approvalState: over.approvalState ?? "approved",
    lockedHasEvidence: over.lockedHasEvidence ?? false,
    payDate: PAY_DATE,
    expectedPayableKrw: over.expectedPayableKrw,
    shared: SHARED,
  });
}

describe("judgeLockedPayment (잠금 뒤 판정)", () => {
  it("기준이 같고 화면 값이 같으면 지급 총액 · 지급 방식을 돌려준다", async () => {
    const result = await judge({ expectedPayableKrw: 1_100_000 });
    expect([result.payable.payableKrw, result.payable.grossSupplyKrw, result.paymentMethod]).toEqual([1_100_000, 1_000_000, "bank_transfer"]);
  });

  it("화면이 본 지급 총액이 1원 달라도 PayableChangedError에 새 값이 실린다", async () => {
    const error = await judge({ expectedPayableKrw: 1_099_999 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PayableChangedError);
    expect((error as PayableChangedError).payableKrw).toBe(1_100_000);
  });

  it("잠금 뒤 증빙 종류 바뀜 → PayableChangedError(잠근 행 기준 새 값)", async () => {
    const error = await judge({ locked: { ...ROW, evidenceType: "other_income" }, expectedPayableKrw: 1_100_000 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PayableChangedError);
    expect((error as PayableChangedError).payableKrw).toBe(912_000);
  });

  it("잠금 뒤 기준일 바뀜 → BasisChangedSignal(그날 세율은 트랜잭션 밖에서 읽어 PayableChangedError로 바꾼다)", async () => {
    await expect(judge({ locked: { ...ROW, evidenceDate: "2026-09-01" }, expectedPayableKrw: 1_100_000 })).rejects.toBeInstanceOf(BasisChangedSignal);
  });

  it("금액 원천 바뀜(R-4) — 사전 조회 때 살아 있던 증빙이 잠금 뒤 무효면 공급가 기준 새 값으로 PayableChangedError", async () => {
    const pre = preOf(ROW, true);
    expect(pre.amount).toEqual({ source: "evidence", amountKrw: 900_000 });
    const error = await judge({ pre, lockedHasEvidence: false, expectedPayableKrw: 990_000 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PayableChangedError);
    expect((error as PayableChangedError).payableKrw).toBe(1_100_000);
  });

  it("결재 게이트가 막는 문서는 기준이 달라도 게이트 이유가 나온다(CROSS-R1 F-3)", async () => {
    const error = await judge({ pre: preOf(ROW, true), approvalState: "rejected", lockedHasEvidence: false, expectedPayableKrw: 990_000 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as GateBlockedError).message).toBe("결재 통과 전 · 반려");
  });

  it("미래 지급일 — 원천징수 기준일 = 그 지급일, 사전 조회 세율로 그대로 셈한다", async () => {
    const future = "2027-03-02";
    const row: LockedExpense = { ...ROW, evidenceType: "other_income" };
    const dates = pickTaxDates(
      { paidDate: future, scheduledPaymentDate: null, evidenceDate: row.evidenceDate, createdAt: row.createdAt },
      { ruleKind: "withholding", codeBasis: "payment_date", basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: TODAY },
    );
    const pre: PaymentInputs = {
      ...preOf(row, false),
      payDate: future,
      tax: { taxRule: WITHHOLDING_RULE, dates, incomeType: "other", rates: { ...RATES, asOf: future } },
    };
    const result = await judgeLockedPayment({ pre, locked: row, approvalState: "approved", lockedHasEvidence: false, payDate: future, expectedPayableKrw: 912_000, shared: SHARED });
    expect(dates.basisDate).toBe(future);
    expect(result.payable.payableKrw).toBe(912_000);
  });
});

// 06-04 Task 1 — 이체액 · 차이 사유(D-605). 차이는 서버 diffKrw(이체액, 지급 총액)로만 셈하고, 차이 ≠ 0이면 사유가 있어야 한다.
describe("judgeLockedPayment — 이체액 · 차이 사유 (06-04 · D-605)", () => {
  function judgeTransfer(over: { transferKrw?: number; diffReason?: string | null; locked?: LockedExpense; expectedPayableKrw?: number }) {
    const locked = over.locked ?? ROW;
    return judgeLockedPayment({
      pre: preOf(locked, false),
      locked,
      approvalState: "approved",
      lockedHasEvidence: false,
      payDate: PAY_DATE,
      expectedPayableKrw: over.expectedPayableKrw ?? 1_100_000,
      shared: SHARED,
      transferKrw: over.transferKrw,
      diffReason: over.diffReason,
    });
  }

  it("이체액 ≠ 지급 총액 · 사유 없음 → `차이 사유 없음 · 사유 적기`로 거부", async () => {
    const error = await judgeTransfer({ transferKrw: 1_096_700 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DiffReasonRequiredError);
    expect((error as Error).message).toBe(DIFF_REASON_REQUIRED);
    expect(DIFF_REASON_REQUIRED).toBe("차이 사유 없음 · 사유 적기");
  });

  it("이체액 ≠ 지급 총액 · 공백뿐인 사유 → 거부", async () => {
    await expect(judgeTransfer({ transferKrw: 1_096_700, diffReason: "   " })).rejects.toBeInstanceOf(DiffReasonRequiredError);
  });

  it("이체액 ≠ 지급 총액 · 사유 있음 → 차이 = diffKrw(이체액, 지급 총액) · 사유는 앞뒤 공백을 뗀다", async () => {
    const result = await judgeTransfer({ transferKrw: 1_096_700, diffReason: "  이체 수수료 차감  " });
    expect([result.payable.transferKrw, result.payable.payableKrw, result.payable.diffKrw, result.diffReason]).toEqual([
      1_096_700, 1_100_000, -3_300, "이체 수수료 차감",
    ]);
  });

  it("차이 0 · 사유 없음 → 저장 값의 사유는 null", async () => {
    const result = await judgeTransfer({ transferKrw: 1_100_000 });
    expect([result.payable.diffKrw, result.diffReason]).toEqual([0, null]);
  });

  it("차이 0이면 사유를 보내도 저장하지 않는다(null)", async () => {
    const result = await judgeTransfer({ transferKrw: 1_100_000, diffReason: "남은 사유" });
    expect(result.diffReason).toBeNull();
  });

  it("부가세 규칙이면 공급가 역산은 이체액에서 셈한다 — 원천징수는 null(UA-619)", async () => {
    const vat = await judgeTransfer({ transferKrw: 1_096_700, diffReason: "수수료" });
    expect(vat.payable.grossSupplyKrw).toBe(997_000);
    const withholding = await judgeTransfer({ locked: { ...ROW, evidenceType: "other_income" }, transferKrw: 900_000, diffReason: "수수료", expectedPayableKrw: 912_000 });
    expect([withholding.payable.diffKrw, withholding.payable.grossSupplyKrw]).toEqual([-12_000, null]);
  });

  it("이체액이 달라도 화면이 본 지급 총액 비교가 먼저다 — 낡으면 PayableChangedError", async () => {
    await expect(judgeTransfer({ transferKrw: 1_096_700, expectedPayableKrw: 1_000_000 })).rejects.toBeInstanceOf(PayableChangedError);
  });
});

// 06-03 독립 검토 P3-2 — 지급 방식이 빈 문서는 세금 계산 불가 문구가 아니라 지급 방식 문구로 막힌다.
describe("judgeLockedPayment — 지급 방식 없음 (06-03 검토 P3-2)", () => {
  it("지급 방식이 비면 `지급 방식 없음 · 지출결의 확인`", async () => {
    const error = await judge({ locked: { ...ROW, paymentMethod: null }, expectedPayableKrw: 1_100_000 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("지급 방식 없음 · 지출결의 확인");
  });
});
