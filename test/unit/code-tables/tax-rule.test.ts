import { describe, expect, it } from "vitest";
import { taxRuleSchema } from "@/domain/code-tables/tax-rule";

// ROADMAP·EXP-15: 증빙 종류별 세금 규칙 필드 — 규칙 종류 네 값, 절사 단위
// 1/10만, 절사 방식 세 값, 최소 징수액 0 이상 정수, 적용 기준일 종류 네 값.
// 규칙 종류가 "없음"이면 나머지 필드가 없어도 통과한다. 세율 값 자체는
// 이 스키마에 담지 않는다(설정 레지스트리가 정본).
describe("taxRuleSchema", () => {
  it("규칙 종류가 없음이면 나머지 필드가 없어도 통과한다", () => {
    const result = taxRuleSchema.safeParse({ ruleKind: "none" });
    expect(result.success).toBe(true);
  });

  it.each(["vat_surcharge", "withholding", "company_borne"] as const)(
    "규칙 종류가 %s면 나머지 필드를 요구한다",
    (ruleKind) => {
      const missing = taxRuleSchema.safeParse({ ruleKind });
      expect(missing.success).toBe(false);

      const complete = taxRuleSchema.safeParse({
        ruleKind,
        roundingUnit: 10,
        roundingMethod: "round",
        minWithholdingAmount: 0,
        basisDate: "payment_date",
      });
      expect(complete.success).toBe(true);
    },
  );

  it("규칙 종류가 네 값 외의 값이면 거부한다", () => {
    const result = taxRuleSchema.safeParse({ ruleKind: "unknown_kind" });
    expect(result.success).toBe(false);
  });

  it.each([1, 10])("절사 단위 %d는 허용한다", (roundingUnit) => {
    const result = taxRuleSchema.safeParse({
      ruleKind: "vat_surcharge",
      roundingUnit,
      roundingMethod: "truncate",
      minWithholdingAmount: 0,
      basisDate: "evidence_date",
    });
    expect(result.success).toBe(true);
  });

  it("절사 단위가 1 또는 10이 아니면 거부한다", () => {
    const result = taxRuleSchema.safeParse({
      ruleKind: "vat_surcharge",
      roundingUnit: 5,
      roundingMethod: "truncate",
      minWithholdingAmount: 0,
      basisDate: "evidence_date",
    });
    expect(result.success).toBe(false);
  });

  it.each(["truncate", "round", "ceil"])("절사 방식 %s는 허용한다", (roundingMethod) => {
    const result = taxRuleSchema.safeParse({
      ruleKind: "withholding",
      roundingUnit: 10,
      roundingMethod,
      minWithholdingAmount: 0,
      basisDate: "payment_date",
    });
    expect(result.success).toBe(true);
  });

  it("최소 징수액이 음수면 거부한다", () => {
    const result = taxRuleSchema.safeParse({
      ruleKind: "withholding",
      roundingUnit: 10,
      roundingMethod: "round",
      minWithholdingAmount: -1,
      basisDate: "payment_date",
    });
    expect(result.success).toBe(false);
  });

  it.each(["payment_date", "scheduled_payment_date", "evidence_date", "document_date"])(
    "적용 기준일 종류 %s는 허용한다",
    (basisDate) => {
      const result = taxRuleSchema.safeParse({
        ruleKind: "company_borne",
        roundingUnit: 1,
        roundingMethod: "ceil",
        minWithholdingAmount: 0,
        basisDate,
      });
      expect(result.success).toBe(true);
    },
  );

  it("세율 값 필드를 스키마가 정의하지 않는다", () => {
    const parsed = taxRuleSchema.safeParse({
      ruleKind: "vat_surcharge",
      roundingUnit: 1,
      roundingMethod: "round",
      minWithholdingAmount: 0,
      basisDate: "evidence_date",
      rate: 0.1,
    });
    // rate 같은 미등록 키가 있어도 거부되거나(strict) 무시된다(strip) — 어느
    // 쪽이든 결과 객체에 rate가 실리지 않는다.
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).rate).toBeUndefined();
    } else {
      expect(parsed.success).toBe(false);
    }
  });
});
