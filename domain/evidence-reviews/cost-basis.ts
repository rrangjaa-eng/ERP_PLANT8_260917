// EVID-03 · 04 · D-602 — 확인 기록은 입력이 아니다. 손익(PNL-02)과 줄 비용이 이 함수 하나를 부른다.
// 살아 있는 증빙이 있고 증빙 금액이 있으면 확정(증빙 금액), 그 밖은 예상(승인액 — 없으면 견적 줄 실행가).
export type ExpenseCostBasisInput = {
  hasEvidence: boolean;
  evidenceAmountKrw: number | null;
  approvedSupplyKrw: number | null;
  lineExecutionKrw: number;
};

export type ExpenseCostBasis = { kind: "confirmed" | "expected"; amountKrw: number };

export function expenseCostBasis(input: ExpenseCostBasisInput): ExpenseCostBasis {
  if (input.hasEvidence && input.evidenceAmountKrw !== null) return { kind: "confirmed", amountKrw: input.evidenceAmountKrw };
  return { kind: "expected", amountKrw: input.approvedSupplyKrw ?? input.lineExecutionKrw };
}
