// domain/code-tables/tax-rule.ts — 증빙 종류 코드표 항목의 세금 규칙 필드
// 계약. Phase 4의 세금 계산이 이 스키마가 정한 모양을 읽는다.
//
// 세율 값 자체는 이 스키마에 담지 않는다 — 세율은 이력형 설정 키
// (domain/settings/keys.ts의 tax.vat.rate 등)가 정본이고, 여기 담으면 정본이
// 둘이 된다. 이 스키마는 "증빙 종류마다 어느 규칙을 적용하는지"와 그 규칙의
// 절사·최소 징수액·기준일 같은 코드 정의 계약만 담는다.
import { z } from "zod";

export const TAX_RULE_KIND_VALUES = ["none", "vat_surcharge", "withholding", "company_borne"] as const;
export type TaxRuleKind = (typeof TAX_RULE_KIND_VALUES)[number];

export const TAX_ROUNDING_METHOD_VALUES = ["truncate", "round", "ceil"] as const;
export type TaxRoundingMethod = (typeof TAX_ROUNDING_METHOD_VALUES)[number];

// "지급일·지급 예정일·증빙일·작성일" 네 값(03-06-PLAN.md Task 2 ④) — 미지급
// 시 지급 예정일로 넘어가는 대체 규칙 자체는 Phase 4의 금액 모듈이 구현한다.
export const TAX_RULE_BASIS_DATE_VALUES = [
  "payment_date",
  "scheduled_payment_date",
  "evidence_date",
  "document_date",
] as const;
export type TaxRuleBasisDate = (typeof TAX_RULE_BASIS_DATE_VALUES)[number];

const taxRuleShape = {
  ruleKind: z.enum(TAX_RULE_KIND_VALUES),
  roundingUnit: z.union([z.literal(1), z.literal(10)]).optional(),
  roundingMethod: z.enum(TAX_ROUNDING_METHOD_VALUES).optional(),
  minWithholdingAmount: z.coerce.number().int().min(0).optional(),
  basisDate: z.enum(TAX_RULE_BASIS_DATE_VALUES).optional(),
};

// 규칙 종류가 "없음"이면 나머지 필드가 없어도 통과한다. 그 외 세 종류는
// 절사 단위·절사 방식·최소 징수액·적용 기준일 종류를 전부 요구한다.
export const taxRuleSchema = z
  .object(taxRuleShape)
  .strict()
  .superRefine((value, ctx) => {
    if (value.ruleKind === "none") return;
    if (value.roundingUnit === undefined) {
      ctx.addIssue({ code: "custom", path: ["roundingUnit"], message: "절사 단위 필요 · 절사 단위 선택" });
    }
    if (value.roundingMethod === undefined) {
      ctx.addIssue({ code: "custom", path: ["roundingMethod"], message: "절사 방식 필요 · 절사 방식 선택" });
    }
    if (value.minWithholdingAmount === undefined) {
      ctx.addIssue({ code: "custom", path: ["minWithholdingAmount"], message: "최소 징수액 필요 · 최소 징수액 입력" });
    }
    if (value.basisDate === undefined) {
      ctx.addIssue({ code: "custom", path: ["basisDate"], message: "적용 기준일 종류 필요 · 적용 기준일 종류 선택" });
    }
  });

export type TaxRule = z.infer<typeof taxRuleSchema>;
