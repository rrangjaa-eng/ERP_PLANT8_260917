import { describe, expect, it } from "vitest";
import { listCodeItems } from "@/domain/code-tables";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listSettingHistory } from "@/domain/settings/registry";
import { TAX_COMPANY_BORNE_EXEMPT_THRESHOLD } from "@/domain/settings/keys";

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

  it("business_income은 원천징수 · 10원 미만 절사다", async () => {
    expect(await ruleOf("business_income")).toMatchObject({ ruleKind: "withholding", roundingUnit: 10, roundingMethod: "truncate" });
  });

  // 06.5 D-6501 — 기타소득은 회사 대납 22% 역산 한 가지(06.5-01 데이터 마이그레이션과 글자 하나까지 같은 jsonb).
  it("other_income은 회사 대납 정본 jsonb · 설명 `경품 등 일시 소득 · 회사 대납`이다", async () => {
    const items = await listCodeItems(SYSTEM_VIEWER, "evidence_type", { includeInactive: true });
    const item = items.find((i) => i.value === "other_income");
    expect(item?.taxRule).toEqual({ ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" });
    expect(item?.description).toBe("경품 등 일시 소득 · 회사 대납");
  });

  it("회사 대납 면제 기준 이력 행이 2000-01-01부터 50,000이다", async () => {
    expect(await listSettingHistory(TAX_COMPANY_BORNE_EXEMPT_THRESHOLD)).toEqual([expect.objectContaining({ effectiveFrom: "2000-01-01", value: 50_000 })]);
  });
});
