import { describe, expect, it } from "vitest";
import { computeExpenseTax, incomeTypeFor, pickTaxDates, taxDriftText, type ExpenseTaxDeps, type ExpenseTaxResult } from "@/domain/expenses/tax";
import { SettingNotFoundError, type SettingDef } from "@/domain/settings/registry";
import { TAX_ROUNDING_WITHHOLDING_UNIT, TAX_VAT_RATE } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { CodeItemRow } from "@/repositories/code-tables";

// 05-03 — 세금 호출자의 순수 조각. 05-06이 기준일 사슬 전체(코드표 필드 → 설정) · 세율 바뀜 · 규칙별 계산을 굳힌다.
describe("incomeTypeFor", () => {
  it("사업소득 증빙은 business다", () => {
    expect(incomeTypeFor("business_income")).toBe("business");
  });

  it.each(["other_income", "tax_invoice", null])("%s는 other다", (evidenceType) => {
    expect(incomeTypeFor(evidenceType)).toBe("other");
  });
});

describe("pickTaxDates (D-101)", () => {
  // 작성 시각 2026-09-30 23:30 서울(UTC 14:30) — 서울 날짜로 읽어야 9월 30일이다.
  const createdAt = new Date("2026-09-30T14:30:00Z");
  const settings = { basisWithholding: "payment_date", basisVat: "evidence_date" } as const;

  it("코드 항목 기준일 payment_date · 지급 예정일 없음 → 서울 오늘이고 지급 슬롯에 들어간다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: null, createdAt },
      { ruleKind: "withholding", codeBasis: "payment_date", ...settings, todayKst: "2026-09-26" },
    );
    expect(picked.basisKind).toBe("payment_date");
    expect(picked.basisDate).toBe("2026-09-26");
    expect(picked.applyOpts.paymentDate).toBe("2026-09-26");
  });

  it("코드 항목 기준일 payment_date · 지급 예정일 있음 → 지급 예정일", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", createdAt },
      { ruleKind: "withholding", codeBasis: "payment_date", ...settings, todayKst: "2026-09-26" },
    );
    expect(picked.basisDate).toBe("2026-10-05");
  });

  it("코드 항목에 기준일이 없고 부가세 규칙 · 설정 evidence_date → 작성일(created_at의 서울 날짜)이고 증빙 슬롯에 들어간다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", createdAt },
      { ruleKind: "vat_surcharge", codeBasis: undefined, ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("evidence_date");
    expect(picked.basisDate).toBe("2026-09-30");
    expect(picked.applyOpts.evidenceDate).toBe("2026-09-30");
  });

  it("설정을 document_date로 바꿔도 작성일이다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", createdAt },
      { ruleKind: "vat_surcharge", codeBasis: undefined, basisWithholding: "payment_date", basisVat: "document_date", todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("document_date");
    expect(picked.basisDate).toBe("2026-09-30");
  });

  it("코드 항목 scheduled_payment_date + 지급 예정일 2026-10-05 → 2026-10-05(부가세 규칙이어도 코드 항목이 설정보다 먼저)", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", createdAt },
      { ruleKind: "vat_surcharge", codeBasis: "scheduled_payment_date", ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("scheduled_payment_date");
    expect(picked.basisDate).toBe("2026-10-05");
    expect(picked.applyOpts.evidenceDate).toBe("2026-10-05");
  });

  it("회사 대납은 원천징수 설정(지급 쪽)을 따른다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", createdAt },
      { ruleKind: "company_borne", codeBasis: undefined, ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("payment_date");
    expect(picked.basisDate).toBe("2026-10-05");
  });
});

// ── computeExpenseTax — 설정 · 코드표를 주입해 applyTaxRule 한 번의 결과를 본다 ─────────────────────

const RULE = { roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0 } as const;
const CODE_ITEMS = [
  { value: "tax_invoice", taxRule: { ruleKind: "vat_surcharge", ...RULE, basisDate: "evidence_date" } },
  { value: "other_income", taxRule: { ruleKind: "withholding", ...RULE, roundingUnit: 10, basisDate: "payment_date" } },
  { value: "business_income", taxRule: { ruleKind: "withholding", ...RULE, roundingUnit: 10, basisDate: "payment_date" } },
  { value: "prize", taxRule: { ruleKind: "company_borne", ...RULE, basisDate: "payment_date" } },
] as unknown as CodeItemRow[];

function deps(overrides: Record<string, unknown> = {}, entry?: ExpenseTaxDeps["getSettingEntry"]): Partial<ExpenseTaxDeps> {
  const value = <T>(def: SettingDef<T>): T => (def.key in overrides ? (overrides[def.key] as T) : (def.default as T));
  return {
    listCodeItems: () => Promise.resolve(CODE_ITEMS),
    getSettingValue: (def) => Promise.resolve(value(def)),
    getSettingEntry: entry ?? ((def) => Promise.resolve({ value: value(def), historizedId: null, effectiveFrom: null })),
    now: new Date("2026-10-04T03:00:00Z"),
  };
}

const doc = (evidenceType: string, supplyAmountKrw: number) => ({
  evidenceType,
  supplyAmountKrw,
  scheduledPaymentDate: null,
  createdAt: new Date("2026-10-01T03:00:00Z"),
});

describe("computeExpenseTax", () => {
  it("사업소득 1,000,000 → 원천징수 33,000(3.3%)", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("business_income", 1_000_000), deps());
    expect(result).toMatchObject({ ruleKind: "withholding", rate: 0.033, withholdingKrw: 33_000, payableKrw: 967_000 });
  });

  it("기타소득 1,000,000 → 원천징수 88,000(8.8%)", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("other_income", 1_000_000), deps());
    expect(result).toMatchObject({ ruleKind: "withholding", rate: 0.088, withholdingKrw: 88_000, payableKrw: 912_000 });
  });

  it("회사 대납 3,000,000 · 설정 기본값(22% · gross-up) · 1원 반올림 → 회사 대납 846,154 · 지급 총액 3,000,000", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("prize", 3_000_000), deps({ [TAX_ROUNDING_WITHHOLDING_UNIT.key]: 1 }));
    expect(result).toMatchObject({ ruleKind: "company_borne", rate: 0.22, method: "gross_up", companyBorneKrw: 846_154, payableKrw: 3_000_000 });
  });

  it("세율 설정 행이 기준일에 없고 기본값도 없으면 unavailable", async () => {
    const result = await computeExpenseTax(
      SYSTEM_VIEWER,
      doc("tax_invoice", 1_000_000),
      deps({}, (def) => Promise.reject(new SettingNotFoundError(`설정 키 '${def.key}'에 유효한 값이 없습니다.`))),
    );
    expect(result).toEqual({ unavailable: true });
  });

  it("부가세 세율 행은 코드 항목 기준일(작성일)로 읽는다", async () => {
    const asOfs: string[] = [];
    await computeExpenseTax(
      SYSTEM_VIEWER,
      doc("tax_invoice", 1_000_000),
      deps({}, (def, opts) => {
        if (def.key === TAX_VAT_RATE.key) asOfs.push(opts?.asOf?.toISOString().slice(0, 10) ?? "");
        return Promise.resolve({ value: def.default as never, historizedId: null, effectiveFrom: null });
      }),
    );
    expect(asOfs).toEqual(["2026-10-01"]);
  });
});

// ── 세율 바뀜 ──────────────────────────────────────────────────────────────

type Computed = Exclude<ExpenseTaxResult, { unavailable: true }>;
const vat = (rate: number, vatKrw: number, payableKrw: number): Computed => ({
  ruleKind: "vat_surcharge",
  rate,
  historizedId: null,
  rateEffectiveFrom: null,
  method: null,
  basisDate: null,
  vatKrw,
  withholdingKrw: 0,
  companyBorneKrw: 0,
  payableKrw,
});

describe("taxDriftText", () => {
  it("저장 10% · 13,640,000 vs 지금 12% · 13,888,000 → 세율 바뀜 한 줄", () => {
    const drift = taxDriftText(vat(0.1, 1_240_000, 13_640_000), vat(0.12, 1_488_000, 13_888_000));
    expect(drift?.text).toBe("세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000");
    expect(drift?.parts.filter((part) => part.emphasis).map((part) => part.text)).toEqual(["10%", "12%", "13,640,000", "13,888,000"]);
    expect(drift?.parts.map((part) => part.text).join("")).toBe(drift?.text);
  });

  it("같으면 null", () => {
    expect(taxDriftText(vat(0.1, 1_240_000, 13_640_000), vat(0.1, 1_240_000, 13_640_000))).toBeNull();
  });

  it("지금 계산이 불가면 null(비교할 값이 없다)", () => {
    expect(taxDriftText(vat(0.1, 1_240_000, 13_640_000), { unavailable: true })).toBeNull();
  });

  it("원천징수는 실지급액으로 비교한다", () => {
    const stored: Computed = { ...vat(0.088, 0, 2_736_000), ruleKind: "withholding", vatKrw: 0, withholdingKrw: 264_000 };
    const now: Computed = { ...vat(0.033, 0, 2_901_000), ruleKind: "withholding", vatKrw: 0, withholdingKrw: 99_000 };
    expect(taxDriftText(stored, now)?.text).toBe("세율 바뀜 · 원천징수 8.8% → 3.3% · 실지급액 2,736,000 → 2,901,000");
  });
});
