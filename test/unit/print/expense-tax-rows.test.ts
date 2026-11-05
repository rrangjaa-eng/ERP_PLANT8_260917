import { describe, expect, it } from "vitest";
import { expenseTaxRows } from "@/app/print/expenses/[id]/tax-rows";

type Result = Exclude<Parameters<typeof expenseTaxRows>[0], undefined | null | { unavailable: true }>;

const base: Result = { ruleKind: "none", rate: null, vatKrw: 0, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: 1_000_000 };

// 07.4-01 eng 재검토 R1 · 디자인 검토 F10 · B3 — 세금 행 · 합계 행 라벨은 상세 화면 계산 한 줄과 같은 낱말이고, 함수는 셈하지 않고 부호만 정한다.
describe("expenseTaxRows", () => {
  it("부가세: 세금 행 + 지급 총액", () => {
    expect(expenseTaxRows({ ...base, ruleKind: "vat_surcharge", rate: 0.1, vatKrw: 1_240_000, payableKrw: 13_640_000 })).toEqual({
      kind: "rows",
      tax: { name: "부가세", rate: 0.1, exempt: false, amountKrw: 1_240_000 },
      payable: { label: "지급 총액", amountKrw: 13_640_000, borne: null },
    });
  });

  it("원천징수: 세액은 음수 표시 · 실지급액", () => {
    expect(expenseTaxRows({ ...base, ruleKind: "withholding", rate: 0.033, withholdingKrw: 33_000, payableKrw: 967_000 })).toEqual({
      kind: "rows",
      tax: { name: "원천징수", rate: 0.033, exempt: false, amountKrw: -33_000 },
      payable: { label: "실지급액", amountKrw: 967_000, borne: null },
    });
  });

  it("원천징수 면제(세액 0)", () => {
    const rows = expenseTaxRows({ ...base, ruleKind: "withholding", rate: 0.033, withholdingKrw: 0, payableKrw: 1_000_000 });
    expect(rows).toMatchObject({ kind: "rows", tax: { name: "원천징수", exempt: true, amountKrw: 0 }, payable: { label: "실지급액" } });
  });

  it("회사 대납: 세금 행 없음 · 합계 행 아래 보조줄 재료", () => {
    expect(expenseTaxRows({ ...base, ruleKind: "company_borne", rate: 0.033, companyBorneKrw: 50_000, payableKrw: 1_000_000 })).toEqual({
      kind: "rows",
      tax: null,
      payable: { label: "지급 총액", amountKrw: 1_000_000, borne: { rate: 0.033, exempt: false, amountKrw: 50_000 } },
    });
  });

  it("회사 대납 면제", () => {
    const rows = expenseTaxRows({ ...base, ruleKind: "company_borne", rate: 0.033, companyBorneKrw: 0, payableKrw: 1_000_000 });
    expect(rows).toMatchObject({ kind: "rows", tax: null, payable: { borne: { exempt: true, amountKrw: 0 } } });
  });

  it("세금 없음", () => {
    expect(expenseTaxRows(base)).toEqual({ kind: "rows", tax: null, payable: { label: "지급 총액", amountKrw: 1_000_000, borne: null } });
  });

  it("세율 설정이 없으면 계산 불가 한 칸 · null · undefined는 null", () => {
    expect(expenseTaxRows({ unavailable: true })).toEqual({ kind: "unavailable", text: "계산 불가 · 세율 없음" });
    expect(expenseTaxRows(null)).toBeNull();
    expect(expenseTaxRows(undefined)).toBeNull();
  });

  it("열 합 불변식: 공급가 + 세금 행 금액 = 합계 행 금액 (네 규칙)", () => {
    const supply = 1_000_000;
    const cases: Result[] = [
      { ...base, ruleKind: "vat_surcharge", rate: 0.1, vatKrw: 100_000, payableKrw: 1_100_000 },
      { ...base, ruleKind: "withholding", rate: 0.033, withholdingKrw: 33_000, payableKrw: 967_000 },
      { ...base, ruleKind: "company_borne", rate: 0.033, companyBorneKrw: 33_000, payableKrw: 1_000_000 },
      { ...base, ruleKind: "none", payableKrw: 1_000_000 },
    ];
    for (const result of cases) {
      const rows = expenseTaxRows(result);
      if (rows?.kind !== "rows") throw new Error("rows 아님");
      expect(supply + (rows.tax?.amountKrw ?? 0)).toBe(rows.payable.amountKrw);
      expect(rows.payable.label).not.toBe("합계");
      expect(rows.payable.amountKrw).toBe(result.payableKrw);
    }
  });
});
