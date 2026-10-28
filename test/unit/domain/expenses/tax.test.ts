import { describe, expect, it } from "vitest";
import { computeExpenseTax, pickTaxDates, snapshotSupplyDiffers, taxDriftText, taxLineText, type ExpenseTaxDeps, type ExpenseTaxResult } from "@/domain/expenses/tax";
import { moneyFromRow } from "@/domain/money";
import { applyTaxRule } from "@/domain/money/tax";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { SettingNotFoundError, type SettingDef } from "@/domain/settings/registry";
import { TAX_ROUNDING_WITHHOLDING_UNIT, TAX_VAT_RATE } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { CodeItemRow } from "@/repositories/code-tables";

// 05-03 — 세금 호출자의 순수 조각. 05-06이 기준일 사슬 전체(코드표 필드 → 설정) · 세율 바뀜 · 규칙별 계산을 굳힌다.
describe("pickTaxDates (D-101)", () => {
  // 작성 시각 2026-09-30 23:30 서울(UTC 14:30) — 서울 날짜로 읽어야 9월 30일이다.
  const createdAt = new Date("2026-09-30T14:30:00Z");
  const settings = { basisWithholding: "payment_date", basisVat: "evidence_date" } as const;

  it("코드 항목 기준일 payment_date · 지급 예정일 없음 → 서울 오늘이고 지급 슬롯에 들어간다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: null, earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "withholding", codeBasis: "payment_date", ...settings, todayKst: "2026-09-26" },
    );
    expect(picked.basisKind).toBe("payment_date");
    expect(picked.basisDate).toBe("2026-09-26");
    expect(picked.applyOpts.paymentDate).toBe("2026-09-26");
  });

  it("코드 항목 기준일 payment_date · 지급 예정일 있음 → 지급 예정일", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "withholding", codeBasis: "payment_date", ...settings, todayKst: "2026-09-26" },
    );
    expect(picked.basisDate).toBe("2026-10-05");
  });

  it("코드 항목에 기준일이 없고 부가세 규칙 · 설정 evidence_date → 작성일(created_at의 서울 날짜)이고 증빙 슬롯에 들어간다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "vat_surcharge", codeBasis: undefined, ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("evidence_date");
    expect(picked.basisDate).toBe("2026-09-30");
    expect(picked.applyOpts.evidenceDate).toBe("2026-09-30");
  });

  it("설정을 document_date로 바꿔도 작성일이다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "vat_surcharge", codeBasis: undefined, basisWithholding: "payment_date", basisVat: "document_date", todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("document_date");
    expect(picked.basisDate).toBe("2026-09-30");
  });

  it("코드 항목 scheduled_payment_date + 지급 예정일 2026-10-05 → 2026-10-05(부가세 규칙이어도 코드 항목이 설정보다 먼저)", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "vat_surcharge", codeBasis: "scheduled_payment_date", ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("scheduled_payment_date");
    expect(picked.basisDate).toBe("2026-10-05");
    expect(picked.applyOpts.evidenceDate).toBe("2026-10-05");
  });

  it("회사 대납은 원천징수 설정(지급 쪽)을 따른다", () => {
    const picked = pickTaxDates(
      { scheduledPaymentDate: "2026-10-05", earliestEvidenceIssuedOn: null, createdAt },
      { ruleKind: "company_borne", codeBasis: undefined, ...settings, todayKst: "2026-10-04" },
    );
    expect(picked.basisKind).toBe("payment_date");
    expect(picked.basisDate).toBe("2026-10-05");
  });
});

// 07.1-16(D-7123 · D-7129 · E-P1-11): 증빙일 = 붙은 증빙 기록 중 가장 이른 발행일 → 없으면 저장된 수동 증빙일 → 없으면 작성일.
describe("pickTaxDates — 붙은 증빙 가장 이른 발행일 (07.1-16)", () => {
  const createdAt = new Date("2026-09-30T14:30:00Z");
  const vat = { ruleKind: "vat_surcharge", codeBasis: "evidence_date", basisWithholding: "payment_date", basisVat: "evidence_date", todayKst: "2026-10-28" } as const;

  it("붙은 증빙이 있으면 수동 증빙일(10-20)보다 가장 이른 발행일(10-05)이 기준일이다", () => {
    const picked = pickTaxDates({ scheduledPaymentDate: "2026-12-04", evidenceDate: "2026-10-20", earliestEvidenceIssuedOn: "2026-10-05", createdAt }, vat);
    expect(picked.basisDate).toBe("2026-10-05");
    expect(picked.applyOpts).toEqual({ paymentDate: "2026-10-05", evidenceDate: "2026-10-05" });
  });

  it("붙은 증빙이 없으면(null) 저장된 수동 증빙일이다", () => {
    expect(pickTaxDates({ scheduledPaymentDate: null, evidenceDate: "2026-10-20", earliestEvidenceIssuedOn: null, createdAt }, vat).basisDate).toBe("2026-10-20");
  });

  it("증빙도 수동 값도 없으면 작성일(created_at의 서울 날짜)이다", () => {
    expect(pickTaxDates({ scheduledPaymentDate: null, evidenceDate: null, earliestEvidenceIssuedOn: null, createdAt }, vat).basisDate).toBe("2026-09-30");
  });

  it("기준일 종류가 지급일 · 지급 예정일 · 작성일이면 가장 이른 발행일과 상관없이 지금 결과 그대로다", () => {
    const base = { paidDate: "2026-11-06", scheduledPaymentDate: "2026-12-04", evidenceDate: "2026-10-20", createdAt };
    for (const [codeBasis, expected] of [
      ["payment_date", "2026-11-06"],
      ["scheduled_payment_date", "2026-12-04"],
      ["document_date", "2026-09-30"],
    ] as const) {
      const withEarliest = pickTaxDates({ ...base, earliestEvidenceIssuedOn: "2026-10-05" }, { ...vat, codeBasis });
      const without = pickTaxDates({ ...base, earliestEvidenceIssuedOn: null }, { ...vat, codeBasis });
      expect(withEarliest.basisDate).toBe(expected);
      expect(without.basisDate).toBe(expected);
    }
  });
});

// ── computeExpenseTax — 설정 · 코드표를 주입해 applyTaxRule 한 번의 결과를 본다 ─────────────────────

const RULE = { roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0 } as const;
const CODE_ITEMS = [
  { value: "tax_invoice", taxRule: { ruleKind: "vat_surcharge", ...RULE, basisDate: "evidence_date" } },
  // 06.5 D-6501 — 기타소득은 회사 대납(시드 · 06.5-01 마이그레이션과 같은 jsonb).
  { value: "other_income", taxRule: { ruleKind: "company_borne", ...RULE, roundingUnit: 10, roundingMethod: "truncate", basisDate: "payment_date" } },
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

const doc = (evidenceType: string, supplyAmountKrw: number, recipientCount?: number) => ({
  evidenceType,
  supplyAmountKrw,
  ...(recipientCount === undefined ? {} : { recipientCount }),
  scheduledPaymentDate: null,
  earliestEvidenceIssuedOn: null,
  createdAt: new Date("2026-10-01T03:00:00Z"),
});

describe("computeExpenseTax", () => {
  it("사업소득 1,000,000 → 원천징수 33,000(3.3%)", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("business_income", 1_000_000), deps());
    expect(result).toMatchObject({ ruleKind: "withholding", rate: 0.033, withholdingKrw: 33_000, payableKrw: 967_000 });
  });

  // 06.5 D-6501 — 1,000,000 ÷ 0.78 − 1,000,000 = 282,051.3 → 10원 절사 282,050.
  it("기타소득 1,000,000 → 회사 대납 22% 역산 282,050 · 지급 총액 1,000,000", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("other_income", 1_000_000), deps());
    expect(result).toMatchObject({ ruleKind: "company_borne", rate: 0.22, withholdingKrw: 0, companyBorneKrw: 282_050, payableKrw: 1_000_000 });
  });

  // 카드 ① — 받는 인원은 문서 칸 값(없으면 1).
  it("기타소득 195,000 · 받는 인원 5 → 한 사람 몫 세전 50,000이라 면제 · 받는 인원 칸이 없으면 1명으로 셈한다(55,000)", async () => {
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("other_income", 195_000, 5), deps())).toMatchObject({ companyBorneKrw: 0, payableKrw: 195_000 });
    // 195,000 ÷ 0.78 − 195,000 = 55,000 → 1명 몫 세전 250,000 > 50,000
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("other_income", 195_000), deps())).toMatchObject({ companyBorneKrw: 55_000 });
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

  // 05-06 돈 검토 m1 — 두 조회 사이에 세율 행이 바뀌어도 스냅숏 세율과 금액은 같은 한 번의 읽기에서 나온다.
  it("세율 행을 읽은 뒤 값 조회가 다른 세율을 돌려줘도 금액은 읽어 둔 세율(12%)로 계산한다", async () => {
    const result = await computeExpenseTax(
      SYSTEM_VIEWER,
      doc("tax_invoice", 1_000_000),
      deps({ [TAX_VAT_RATE.key]: 0.1 }, (def) =>
        Promise.resolve({ value: (def.key === TAX_VAT_RATE.key ? 0.12 : def.default) as never, historizedId: null, effectiveFrom: null }),
      ),
    );
    expect(result).toMatchObject({ rate: 0.12, vatKrw: 120_000, payableKrw: 1_120_000 });
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

// 05 /review A14(testing): 입구 unavailable 갈래 · none 규칙 · 공급가액 0원 경계.
describe("computeExpenseTax — 입구 · none · 0원", () => {
  const NONE_ITEMS = [
    ...CODE_ITEMS,
    { value: "card_receipt", taxRule: { ruleKind: "none" } },
    { value: "broken_rule", taxRule: { ruleKind: "unknown_kind" } },
  ] as unknown as CodeItemRow[];
  const withNone = (): Partial<ExpenseTaxDeps> => ({ ...deps(), listCodeItems: () => Promise.resolve(NONE_ITEMS) });

  it("증빙 종류 없음 · 공급가액 없음 · 코드표에 없는 증빙 종류 · 깨진 세금 규칙 → unavailable", async () => {
    expect(await computeExpenseTax(SYSTEM_VIEWER, { ...doc("tax_invoice", 1_000_000), evidenceType: null }, withNone())).toEqual({ unavailable: true });
    expect(await computeExpenseTax(SYSTEM_VIEWER, { ...doc("tax_invoice", 0), supplyAmountKrw: null }, withNone())).toEqual({ unavailable: true });
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("zz_not_in_table", 1_000_000), withNone())).toEqual({ unavailable: true });
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("broken_rule", 1_000_000), withNone())).toEqual({ unavailable: true });
  });

  it("none 규칙 → 세금 0 · 지급 총액 = 공급가액 · 세율 없음", async () => {
    const result = await computeExpenseTax(SYSTEM_VIEWER, doc("card_receipt", 1_234_567), withNone());
    expect(result).toMatchObject({ ruleKind: "none", rate: null, historizedId: null, vatKrw: 0, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: 1_234_567 });
  });

  it("공급가액 0원 → 부가세 · 원천징수 0 · 지급 총액 0", async () => {
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("tax_invoice", 0), withNone())).toMatchObject({ ruleKind: "vat_surcharge", vatKrw: 0, payableKrw: 0 });
    expect(await computeExpenseTax(SYSTEM_VIEWER, doc("business_income", 0), withNone())).toMatchObject({ ruleKind: "withholding", withholdingKrw: 0, payableKrw: 0 });
  });
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

  // 05-06 돈 검토 m2 — 저장은 소수 6자리(numeric(7,6))라 그보다 긴 설정 세율과도 같은 세율로 본다.
  it("저장 세율 0.033333 vs 지금 0.0333333 · 금액 같음 → null", () => {
    expect(taxDriftText(vat(0.033333, 33_333, 1_033_333), vat(0.0333333, 33_333, 1_033_333))).toBeNull();
  });
});

// 06.5 D-6520(UI-SPEC V8 「고친 뒤 문서 화면」) — 스냅숏이 셈한 공급가(지급 총액 − 부가세 + 원천징수)가 지금 공급가와 다르면 고친 문서다.
// 엔진 네 갈래가 이 항등식을 지킨다는 단언 — applyTaxRule이 식을 바꾸면 이 시험이 먼저 깨진다.
describe("snapshotSupplyDiffers (06.5 D-6520)", () => {
  const SETTINGS: Record<string, unknown> = {
    "tax.vat.rate": 0.1,
    "tax.withholding.business_income.rate": 0.033,
    "tax.company_borne.rate": 0.088,
    "tax.company_borne.exempt_threshold": 50_000,
    "tax.company_borne.method": "flat",
    "tax.basis_date.withholding": "payment_date",
    "tax.basis_date.vat": "evidence_date",
    "tax.rounding.vat_unit": 1,
    "tax.rounding.withholding_unit": 10,
    "tax.rounding.min_withholding": 0,
  };
  const getSettingValue = ((def: { key: string }) => Promise.resolve(SETTINGS[def.key])) as never;
  const RULES: [string, TaxRule][] = [
    ["없음", { ruleKind: "none" }],
    ["부가세", { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" }],
    ["원천징수", { ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" }],
    ["회사 대납", { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "payment_date" }],
  ];

  it.each(RULES)("%s — 엔진이 공급가 S로 셈한 스냅숏에 S면 거짓 · 다른 공급가면 참", async (_name, rule) => {
    const supply = 12_400_000;
    const amounts = await applyTaxRule(supply, rule, { paymentDate: new Date("2026-09-22"), evidenceDate: new Date("2026-09-15") }, { getSettingValue });
    const stored: ExpenseTaxResult = { ruleKind: rule.ruleKind, rate: null, historizedId: null, rateEffectiveFrom: null, method: null, basisDate: null, ...amounts };
    expect(snapshotSupplyDiffers(stored, supply)).toBe(false);
    expect(snapshotSupplyDiffers(stored, 12_000_000)).toBe(true);
  });

  it("셈할 수 없던 스냅숏은 거짓", () => {
    expect(snapshotSupplyDiffers({ unavailable: true }, 12_000_000)).toBe(false);
  });
});

// 06.5 D-6501 — 회사 대납 세금이 0이면(면제) 원천징수 면제 줄과 같은 꼴로 적는다(새 문구 없음).
describe("taxLineText — 회사 대납 면제(06.5 D-6501)", () => {
  const krw = (amount: number) => moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: amount });
  const base = { ruleKind: "company_borne", rate: 0.22, historizedId: null, rateEffectiveFrom: null, method: "gross_up", basisDate: null, vatKrw: 0, withholdingKrw: 0 } as const;

  it("세금 0이면 `회사 대납 세금 0 · 면제 기준 이하 · 지급 총액 …`", () => {
    const line = taxLineText({ ...base, companyBorneKrw: 0, payableKrw: 39_000 }, krw(39_000), "기타소득 규칙");
    expect(line.text).toBe("회사 대납 세금 0 · 면제 기준 이하 · 지급 총액 39,000 · 기타소득 규칙");
  });

  it("세금이 있으면 기존 글자 그대로", () => {
    const line = taxLineText({ ...base, companyBorneKrw: 28_200, payableKrw: 100_000 }, krw(100_000), "기타소득 규칙");
    expect(line.text).toBe("회사 대납 세금 22% 28,200 · 지급 총액 100,000 · 기타소득 규칙");
  });
});
