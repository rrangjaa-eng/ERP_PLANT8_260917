import { diffKrw } from "@/domain/money";
import type { ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 서식별 금액 결정(D-6106 → RP-1). 이 금액은 증빙 기록 자체의 합계 · 공급가 · 세액이다 — 지출결의 공급가액
// (D-6520)을 정하지 않는다. 금액 셈은 domain/money 호출뿐이다.

export type LineAmounts = { totalKrw: number; vatKrw: number; supplyKrw: number };

// 공급가가 파일에 있으면 그대로(홈택스), 세액만 있으면 합계 − 세액(비씨 · 롯데 — 면세 0 유지).
export function resolveLineAmounts(line: ParsedLine): LineAmounts {
  if (line.supplyKrw !== null && line.vatKrw !== null) return { totalKrw: line.totalKrw, vatKrw: line.vatKrw, supplyKrw: line.supplyKrw };
  if (line.vatKrw !== null) return { totalKrw: line.totalKrw, vatKrw: line.vatKrw, supplyKrw: diffKrw(line.totalKrw, line.vatKrw) };
  throw new Error(`역산 갈래 없음 — ${line.lineNo}줄`);
}
