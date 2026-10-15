// EVID-03 · 04 · D-602 · 06.5 D-6520 — 금액은 공급가액 하나, 확인 기록은 입력이 아니다. 손익(PNL-02)과 줄 비용이 이 함수 하나를 부른다.
// 살아 있는 증빙이 있고 공급가가 있으면 확정(공급가), 그 밖은 예상(공급가 — 없으면 견적 줄 실행가).
export type ExpenseCostBasisInput = {
  hasEvidence: boolean;
  supplyKrw: number | null;
  lineExecutionKrw: number;
};

export type ExpenseCostBasis = { kind: "confirmed" | "expected"; amountKrw: number };

export function expenseCostBasis(input: ExpenseCostBasisInput): ExpenseCostBasis {
  if (input.hasEvidence && input.supplyKrw !== null) return { kind: "confirmed", amountKrw: input.supplyKrw };
  return { kind: "expected", amountKrw: input.supplyKrw ?? input.lineExecutionKrw };
}
