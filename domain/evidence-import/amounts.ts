import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { diffKrw, grossFromSignedTotal, type RoundingUnit } from "@/domain/money";
import type { TaxRates } from "@/domain/money/tax";
import type { ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 서식별 금액 결정(D-6106 → RP-1). 이 금액은 증빙 기록 자체의 합계 · 공급가 · 세액이다 — 지출결의 공급가액
// (D-6520)을 정하지 않는다. 금액 셈은 domain/money 호출뿐이다.

export type LineAmounts = { totalKrw: number; vatKrw: number; supplyKrw: number };

export const VAT_MISMATCH = "부가세 맞지 않음";

// 파일 부가세를 쓰는 서식(비씨 · 롯데)의 부가세 검사(E16) — 부호가 합계와 다르거나 |부가세| > |합계|이면 줄 오류.
// 부호를 짐작해 뒤집지 않는다(틀린 공급가가 그대로 등록된다).
export function vatProblem(totalKrw: number, vatKrw: number): string | null {
  if ((totalKrw > 0 && vatKrw < 0) || (totalKrw < 0 && vatKrw > 0)) return VAT_MISMATCH;
  if (Math.abs(vatKrw) > Math.abs(totalKrw)) return VAT_MISMATCH;
  return null;
}

// 공급가가 파일에 있으면 그대로(홈택스), 세액만 있으면 합계 − 세액(비씨 · 롯데 — 면세 0 유지), 둘 다 없으면(신한) 역산.
// 역산 방식은 그 줄 증빙 종류의 코드표 규칙 `rule.roundingMethod ?? "round"`, 규칙이 vat_surcharge가 아니면 역산하지 않는다 —
// 06-05 splitCardTotal과 같은 판정이다. 다만 음수 합계는 splitCardTotal이 grossFromTotal을 그대로 불러 비대칭이므로
// grossFromSignedTotal을 쓴다.
// 세율 설정값은 number로 온다 — 끝처리 단위로 쓰기 전에 1 · 10인지 확인한다(단언하지 않는다).
function vatUnitOf(unit: number): RoundingUnit {
  if (unit === 1 || unit === 10) return unit;
  throw new Error(`부가세 끝처리 단위 ${unit} — 1 · 10만`);
}

export function resolveLineAmounts(line: ParsedLine, rates?: TaxRates, rule?: TaxRule): LineAmounts {
  if (line.supplyKrw !== null && line.vatKrw !== null) return { totalKrw: line.totalKrw, vatKrw: line.vatKrw, supplyKrw: line.supplyKrw };
  if (line.vatKrw !== null) return { totalKrw: line.totalKrw, vatKrw: line.vatKrw, supplyKrw: diffKrw(line.totalKrw, line.vatKrw) };
  if (!rates || !rule) throw new Error(`역산 세율 · 규칙 없음 — ${line.lineNo}줄`);
  if (rule.ruleKind !== "vat_surcharge") return { totalKrw: line.totalKrw, vatKrw: 0, supplyKrw: line.totalKrw };
  const supplyKrw = grossFromSignedTotal(line.totalKrw, rates.vatRate, vatUnitOf(rates.vatUnit), rule.roundingMethod ?? "round");
  return { totalKrw: line.totalKrw, vatKrw: diffKrw(line.totalKrw, supplyKrw), supplyKrw };
}
