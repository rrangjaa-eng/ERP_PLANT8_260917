import { describe, expect, it } from "vitest";
import { moneyFromRow } from "@/domain/money";
import { taxLineText, type ExpenseTaxResult } from "@/domain/expenses/tax";

// 05-05(UI-SPEC Copywriting 「표시 — 계산 한 줄」): 저장된 · 계산된 세금 결과 → 한 줄 문자열 + 숫자 조각(emphasis) 배열.
// 문서 화면 · 결재 시트가 같은 함수를 쓴다(계산은 domain/money.applyTaxRule 하나 — 이 함수는 글자만 만든다).

const krw = (amount: number) => moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: amount });
type Computed = Exclude<ExpenseTaxResult, { unavailable: true }>;
const base: Computed = {
  ruleKind: "none",
  rate: null,
  historizedId: null,
  rateEffectiveFrom: null,
  method: null,
  basisDate: null,
  vatKrw: 0,
  withholdingKrw: 0,
  companyBorneKrw: 0,
  payableKrw: 0,
};

describe("taxLineText", () => {
  it("부가세 가산", () => {
    const line = taxLineText({ ...base, ruleKind: "vat_surcharge", rate: 0.1, vatKrw: 1_240_000, payableKrw: 13_640_000 }, krw(12_400_000), "세금계산서 규칙");
    expect(line.text).toBe("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    expect(line.parts.filter((part) => part.emphasis).map((part) => part.text)).toEqual(["10%", "1,240,000", "13,640,000"]);
    expect(line.parts.map((part) => part.text).join("")).toBe(line.text);
  });

  it("규칙 없음", () => {
    expect(taxLineText({ ...base, payableKrw: 12_400_000 }, krw(12_400_000), "계산서 규칙").text).toBe("지급 총액 12,400,000 · 계산서 규칙");
  });

  it("원천징수(수령자 부담)", () => {
    const line = taxLineText({ ...base, ruleKind: "withholding", rate: 0.088, withholdingKrw: 264_000, payableKrw: 2_736_000 }, krw(3_000_000), "기타소득 규칙");
    expect(line.text).toBe("원천징수 8.8% 264,000 · 실지급액 2,736,000 · 기타소득 규칙");
  });

  it("원천징수 면제 기준 이하", () => {
    const line = taxLineText({ ...base, ruleKind: "withholding", rate: 0.088, withholdingKrw: 0, payableKrw: 100_000 }, krw(100_000), "기타소득 규칙");
    expect(line.text).toBe("원천징수 0 · 면제 기준 이하 · 실지급액 100,000 · 기타소득 규칙");
  });

  it("회사 대납", () => {
    const line = taxLineText({ ...base, ruleKind: "company_borne", rate: 0.088, companyBorneKrw: 264_000, payableKrw: 3_000_000 }, krw(3_000_000), "경품 규칙");
    expect(line.text).toBe("회사 대납 세금 8.8% 264,000 · 지급 총액 3,000,000 · 경품 규칙");
  });

  it("외화면 맨 앞에 원화 환산액 조각", () => {
    const usd = moneyFromRow({ currency: "USD", foreignAmount: "4200.00", fxRate: "1318.4000", amountKrw: 5_537_280 });
    const line = taxLineText({ ...base, ruleKind: "vat_surcharge", rate: 0.1, vatKrw: 553_728, payableKrw: 6_091_008 }, usd, "세금계산서 규칙");
    expect(line.text).toBe("원화 5,537,280 · 부가세 10% 553,728 · 지급 총액 6,091,008 · 세금계산서 규칙");
  });

  it("계산 불가", () => {
    expect(taxLineText({ unavailable: true }, krw(1_000), "세금계산서 규칙").text).toBe("계산 불가 · 세율 없음");
  });
});
