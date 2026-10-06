import { describe, expect, expectTypeOf, it, vi } from "vitest";
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
import { AMOUNT_HIDDEN } from "@/domain/payments/action-row";
import { ACTION_TYPE_LABELS, ALWAYS_ON_ACTION_TYPES, CORE_ACTION_TYPES } from "@/domain/action-log/record";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { approvalGateDecision, evidenceGateDecision, pairGateDecision, resolveExpenseActionRow, scheduleDirtyBar, type EvidenceGateInput } from "@/domain/payments/action-row";

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
  const OPEN = { allowed: true } as const;
  const base = { approvalState: "approved", paid: false, hasEvidence: true, waived: false, evidence: OPEN, pair: OPEN };

  it("결재 통과 전 → P0(버튼 0 · 섹션 없음)", () => {
    expect(resolveExpenseActionRow({ ...base, approvalState: "in_review" }, payer)).toEqual({ row: "P0", primary: null, blockReason: null, secondary: null, tertiary: null, ownerNote: null });
  });

  it("통과 · 지급 전 → P4(1차 `지급 완료`)", () => {
    expect(resolveExpenseActionRow(base, payer)).toEqual({ row: "P4", primary: "pay", blockReason: null, secondary: null, tertiary: null, ownerNote: null });
  });

  it("지급 뒤 → P6(1차 없음)", () => {
    expect(resolveExpenseActionRow({ ...base, paid: true }, payer)).toEqual({ row: "P6", primary: null, blockReason: null, secondary: "cancel", tertiary: null, ownerNote: null });
  });

  it("지급 권한 없음 → 버튼 0 + 담당 표기(지급 전)", () => {
    expect(resolveExpenseActionRow(base, other)).toEqual({ row: "P4", primary: null, blockReason: null, secondary: null, tertiary: null, ownerNote: "지급은 경영관리" });
    expect(resolveExpenseActionRow({ ...base, paid: true }, other)).toEqual({ row: "P6", primary: null, blockReason: null, secondary: null, tertiary: null, ownerNote: null });
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
  evidenceRequired: false,
  pairs: [],
  paymentMethodName: (code) => (code === "bank_transfer" ? "계좌이체" : null),
  evidenceTypeName: (code) => (code === "tax_invoice" ? "세금계산서" : code === "card_slip" ? "카드 전표" : null),
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
  prepaid: false,
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
    drafterName: "박서연",
    amount: pickPaymentAmount({ hasLiveEvidence, evidenceAmountKrw: row.evidenceAmount, supplyAmountKrw: row.supplyAmountKrw }),
    tax: { taxRule, dates, incomeType: incomeTypeFor(row.evidenceType), rates: { ...RATES, asOf: dates.basisDate } },
  };
}

// 06-06 검토 S-3 — evidenceGate 필수. 06-04 꼴(면제 · 확인 기록 없음) 증빙 게이트 입력.
function gateOf(shared: PaymentShared, hasEvidence: boolean, locked: LockedExpense): EvidenceGateInput {
  return { evidenceRequired: shared.evidenceRequired, hasEvidence, prepaid: locked.prepaid, waived: false, confirmation: null, drafterName: "박서연" };
}

function judge(over: { pre?: PaymentInputs; locked?: LockedExpense; approvalState?: string; lockedHasEvidence?: boolean; expectedPayableKrw: number; shared?: PaymentShared }) {
  return judgeLockedPayment({
    pre: over.pre ?? preOf(ROW, false),
    locked: over.locked ?? ROW,
    approvalState: over.approvalState ?? "approved",
    lockedHasEvidence: over.lockedHasEvidence ?? false,
    evidenceGate: gateOf(over.shared ?? SHARED, over.lockedHasEvidence ?? false, over.locked ?? ROW),
    payDate: PAY_DATE,
    expectedPayableKrw: over.expectedPayableKrw,
    shared: over.shared ?? SHARED,
  });
}

describe("judgeLockedPayment (잠금 뒤 판정)", () => {
  // 06-06 검토 S-3 — 증빙 게이트 입력(면제 · 확인 기록 포함)을 빠뜨린 호출이 「확인 기록 없음」으로 닫혀 확인된 문서를 막지 않게, 필수 인자다.
  it("evidenceGate는 필수 인자다(빠뜨린 호출은 컴파일 오류)", () => {
    expectTypeOf<Parameters<typeof judgeLockedPayment>[0]["evidenceGate"]>().toEqualTypeOf<EvidenceGateInput>();
  });

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
    const result = await judgeLockedPayment({ pre, locked: row, approvalState: "approved", lockedHasEvidence: false, evidenceGate: gateOf(SHARED, false, row), payDate: future, expectedPayableKrw: 912_000, shared: SHARED });
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
      evidenceGate: gateOf(SHARED, false, locked),
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

// 06-04 Task 2 — 증빙 필수 게이트(EVID-02 · D-603) · 짝 게이트(Q4) · 「지출결의 상태 → 1차」 P1 · P3 · 3차 자리 `waive`.
const EVIDENCE_CTX = { evidenceRequired: true, hasEvidence: false, prepaid: false, waived: false, confirmation: null, drafterName: "박서연" };

describe("evidenceGateDecision (D-603)", () => {
  it("필수 on · 증빙 없음 · 선결제 아님 · 면제 아님 → `증빙 없음 · 기안자 {이름}`", () => {
    expect(evidenceGateDecision(EVIDENCE_CTX)).toEqual({ allowed: false, reason: "증빙 없음 · 기안자 박서연" });
  });

  it("필수 off → 통과", () => {
    expect(evidenceGateDecision({ ...EVIDENCE_CTX, evidenceRequired: false })).toEqual({ allowed: true });
  });

  it("선결제 → 통과", () => {
    expect(evidenceGateDecision({ ...EVIDENCE_CTX, prepaid: true })).toEqual({ allowed: true });
  });

  it("면제 → 통과", () => {
    expect(evidenceGateDecision({ ...EVIDENCE_CTX, waived: true })).toEqual({ allowed: true });
  });

  // 06-06(O-2): 증빙 있음이 통과하려면 확인 기록이 있어야 한다 — 확인 전 막힘은 evidence-reviews.test.ts.
  it("증빙 있음(확인됨) → 통과", () => {
    expect(evidenceGateDecision({ ...EVIDENCE_CTX, hasEvidence: true, confirmation: { reviewedAt: new Date("2026-09-18T05:02:00Z") } })).toEqual({ allowed: true });
  });
});

describe("pairGateDecision (Q4 · K-6 — 06-02 isMethodEvidencePairAllowed)", () => {
  const names = { paymentMethodName: "계좌이체", evidenceTypeName: "카드 전표" };
  const pairs = [{ method: "bank_transfer", evidence: "tax_invoice" }];

  it("증빙 종류가 비면 지급 방식만으로 막지 않는다", () => {
    expect(pairGateDecision({ pairs, paymentMethod: "bank_transfer", evidenceType: null, ...names, evidenceTypeName: null })).toEqual({ allowed: true });
  });

  it("짝 목록이 비면(기본값) 통과", () => {
    expect(pairGateDecision({ pairs: [], paymentMethod: "bank_transfer", evidenceType: "card_slip", ...names })).toEqual({ allowed: true });
  });

  it("그 지급 방식의 짝이 하나도 없으면 통과", () => {
    expect(pairGateDecision({ pairs, paymentMethod: "cash", evidenceType: "card_slip", ...names, paymentMethodName: "현금" })).toEqual({ allowed: true });
  });

  it("(방식, 종류)가 목록 안 → 통과", () => {
    expect(pairGateDecision({ pairs, paymentMethod: "bank_transfer", evidenceType: "tax_invoice", ...names, evidenceTypeName: "세금계산서" })).toEqual({ allowed: true });
  });

  it("목록 밖 → `{방식} · {종류} 짝 아님 · 짝 설정은 관리자`", () => {
    expect(pairGateDecision({ pairs, paymentMethod: "bank_transfer", evidenceType: "card_slip", ...names })).toEqual({
      allowed: false,
      reason: "계좌이체 · 카드 전표 짝 아님 · 짝 설정은 관리자",
    });
  });
});

describe("resolveExpenseActionRow — P1 · P3 · 짝 막힘 · 3차 자리 waive (06-04)", () => {
  const payer = { canPay: true };
  const OPEN = { allowed: true } as const;
  const NO_EVIDENCE = { allowed: false, reason: "증빙 없음 · 기안자 박서연" } as const;
  const NOT_PAIR = { allowed: false, reason: "계좌이체 · 카드 전표 짝 아님 · 짝 설정은 관리자" } as const;
  const passed = { approvalState: "approved", paid: false, hasEvidence: true, waived: false, evidence: OPEN, pair: OPEN };

  it("예정일 칸 dirty → P1(1차 `예정일 저장`)", () => {
    expect(resolveExpenseActionRow({ ...passed, scheduleDirty: true }, payer)).toMatchObject({ row: "P1", primary: "saveSchedule", blockReason: null });
  });

  it("예정일 dirty는 막힌 P3에서도 1차를 `예정일 저장`으로 — 업무 1차가 막혀도 예정일은 저장된다(SP-3)", () => {
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: NO_EVIDENCE, scheduleDirty: true }, payer)).toMatchObject({
      row: "P1",
      primary: "saveSchedule",
      blockReason: null,
      tertiary: "waive",
    });
    expect(scheduleDirtyBar(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: NO_EVIDENCE }, payer)).row).toBe("P1");
  });

  it("P3 — 증빙 없음 막힘: `지급 완료` 비활성 + 이유 + 3차 자리 waive", () => {
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: NO_EVIDENCE }, payer)).toEqual({
      row: "P3",
      primary: "pay",
      blockReason: "증빙 없음 · 기안자 박서연",
      secondary: null,
      tertiary: "waive",
      ownerNote: null,
    });
  });

  it("P4 선결제(증빙 0 · 면제 아님) → 1차 그대로 + 3차 자리 waive", () => {
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false }, payer)).toEqual({ row: "P4", primary: "pay", blockReason: null, secondary: null, tertiary: "waive", ownerNote: null });
  });

  it("P4 증빙 필수 off(증빙 0 · 면제 아님) → 1차 그대로 + 3차 자리 waive", () => {
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: OPEN }, payer)).toMatchObject({ row: "P4", primary: "pay", tertiary: "waive" });
  });

  it("P6 증빙 0 · 면제 아님 → 3차 자리 waive(1차 없음)", () => {
    expect(resolveExpenseActionRow({ ...passed, paid: true, hasEvidence: false }, payer)).toMatchObject({ row: "P6", primary: null, tertiary: "waive" });
  });

  it("증빙 있음 · 면제 → 3차 자리 없음", () => {
    expect(resolveExpenseActionRow(passed, payer).tertiary).toBeNull();
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, waived: true }, payer).tertiary).toBeNull();
    expect(resolveExpenseActionRow({ ...passed, paid: true, hasEvidence: false, waived: true }, payer).tertiary).toBeNull();
  });

  it("짝 아님 → P4 `지급 완료` 비활성 + 짝 이유", () => {
    expect(resolveExpenseActionRow({ ...passed, pair: NOT_PAIR }, payer)).toMatchObject({ row: "P4", primary: "pay", blockReason: "계좌이체 · 카드 전표 짝 아님 · 짝 설정은 관리자" });
  });

  it("지급 권한 없는 사람에게는 3차 자리 · 막힘 이유 · P1이 없다", () => {
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: NO_EVIDENCE, scheduleDirty: true }, { canPay: false })).toEqual({
      row: "P4",
      primary: null,
      blockReason: null,
      secondary: null,
      tertiary: null,
      ownerNote: "지급은 경영관리",
    });
  });

  it("지급 권한자가 지급 총액(expense.amount)을 못 보면 `지급 완료` 비활성 + 이유(06-03 검토 P3-4)", () => {
    expect(resolveExpenseActionRow(passed, { canPay: true, amountVisible: false })).toMatchObject({ row: "P4", primary: "pay", blockReason: AMOUNT_HIDDEN });
  });

  it("P6 지급 권한자 → 2차 `지급 취소` 자리(D-606)", () => {
    expect(resolveExpenseActionRow({ ...passed, paid: true }, payer)).toMatchObject({ row: "P6", primary: null, secondary: "cancel" });
  });

  it("지급 권한 없는 사람 · 지급 전 문서 · 결재 통과 전에는 2차 `지급 취소`가 없다", () => {
    expect(resolveExpenseActionRow({ ...passed, paid: true }, { canPay: false }).secondary).toBeNull();
    expect(resolveExpenseActionRow(passed, payer).secondary).toBeNull();
    expect(resolveExpenseActionRow({ ...passed, hasEvidence: false, evidence: NO_EVIDENCE }, payer).secondary).toBeNull();
    expect(resolveExpenseActionRow({ ...passed, approvalState: "in_review", paid: true }, payer).secondary).toBeNull();
  });
});

describe("judgeLockedPayment — 증빙 · 짝 게이트 (06-04 · CROSS-R1 F-3)", () => {
  const required: PaymentShared = { ...SHARED, evidenceRequired: true };

  it("증빙 필수 on · 잠금 뒤 증빙 0 → `증빙 없음 · 기안자 {이름}`", async () => {
    const error = await judge({ shared: required, lockedHasEvidence: false, expectedPayableKrw: 1_100_000 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("증빙 없음 · 기안자 박서연");
  });

  it("증빙 게이트는 기준 재판정보다 먼저 — 사전 조회 땐 증빙이 있었고 잠금 뒤 0이어도 PayableChangedError가 아니라 증빙 이유", async () => {
    const error = await judge({ shared: required, pre: preOf(ROW, true), lockedHasEvidence: false, expectedPayableKrw: 990_000 }).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(PayableChangedError);
    expect((error as Error).message).toBe("증빙 없음 · 기안자 박서연");
  });

  it("선결제 문서(잠근 행의 prepaid)는 증빙 필수 on이어도 통과", async () => {
    const result = await judge({ shared: required, locked: { ...ROW, prepaid: true }, lockedHasEvidence: false, expectedPayableKrw: 1_100_000 });
    expect(result.payable.payableKrw).toBe(1_100_000);
  });

  it("짝 목록 밖 → 짝 이유로 거부(잠근 행의 방식 · 종류)", async () => {
    const shared: PaymentShared = { ...SHARED, pairs: [{ method: "bank_transfer", evidence: "card_slip" }] };
    const error = await judge({ shared, expectedPayableKrw: 1_100_000 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("계좌이체 · 세금계산서 짝 아님 · 짝 설정은 관리자");
  });
});

describe("지급 취소 행동 종류 (06-04 Task 3 · C16 · CF-9)", () => {
  it("payment_cancel은 끌 수 없다 — 핵심 · 항상 켜짐 둘 다에 있고 라벨은 `지급 취소`, 기록할 행동 종류 선택지에 없다", () => {
    expect(CORE_ACTION_TYPES).toContain("payment_cancel");
    expect(ALWAYS_ON_ACTION_TYPES).toContain("payment_cancel");
    expect((ACTION_TYPE_LABELS as Record<string, string>).payment_cancel).toBe("지급 취소");
    expect(ACTION_LOG_OPTIONAL_TYPES.default).not.toContain("payment_cancel");
    expect(ACTION_LOG_OPTIONAL_TYPES.schema.safeParse(["payment_cancel"]).success).toBe(false);
  });
});
