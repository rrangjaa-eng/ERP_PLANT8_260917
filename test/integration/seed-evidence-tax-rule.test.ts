import { describe, expect, it } from "vitest";
import { listCodeItems } from "@/domain/code-tables";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 시드 증빙 종류의 세금 규칙 기본값 — 카드 전표·현금영수증은 부가세 10% 별도(세금계산서와 같은 규칙),
// 기타소득·사업소득은 10원 미만 절사. beforeEach(test/integration/setup.ts)가 시드를 이미 한 번 돌린다.
describe("증빙 종류 시드 세금 규칙 기본값", () => {
  async function ruleOf(value: string) {
    const items = await listCodeItems(SYSTEM_VIEWER, "evidence_type", { includeInactive: true });
    return items.find((i) => i.value === value)?.taxRule;
  }

  it.each(["card_receipt", "cash_receipt"])("%s는 세금계산서와 같은 부가세 가산 규칙이다", async (value) => {
    expect(await ruleOf(value)).toEqual(await ruleOf("tax_invoice"));
    expect(await ruleOf(value)).toEqual({
      ruleKind: "vat_surcharge",
      roundingUnit: 1,
      roundingMethod: "round",
      minWithholdingAmount: 0,
      basisDate: "evidence_date",
    });
  });

  it.each(["other_income", "business_income"])("%s의 절사 방식은 truncate다", async (value) => {
    expect(await ruleOf(value)).toMatchObject({ ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate" });
  });
});
