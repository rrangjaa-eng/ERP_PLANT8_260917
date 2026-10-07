import { describe, expect, it } from "vitest";
import { expenseCostBasis } from "@/domain/evidence-reviews/cost-basis";

// 06-11(EVID-03 · EVID-04 · D-602) — 문서 비용 기준 한 함수. 확인 기록은 입력이 아니다(확인은 검수 표시이지 비용 단계가 아니다).

describe("expenseCostBasis", () => {
  it("증빙 있음 · 증빙 금액 있음 → 확정 · 증빙 금액", () => {
    expect(expenseCostBasis({ hasEvidence: true, evidenceAmountKrw: 12_000_000, approvedSupplyKrw: 12_400_000, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "confirmed", amountKrw: 12_000_000 });
  });

  it("증빙 없음 · 승인액 있음 → 예상 · 승인액 (증빙 금액이 남아 있어도 증빙이 없으면 예상)", () => {
    expect(expenseCostBasis({ hasEvidence: false, evidenceAmountKrw: 12_000_000, approvedSupplyKrw: 12_400_000, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 12_400_000 });
  });

  it("증빙 있음 · 증빙 금액 없음 → 예상 · 승인액", () => {
    expect(expenseCostBasis({ hasEvidence: true, evidenceAmountKrw: null, approvedSupplyKrw: 12_400_000, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 12_400_000 });
  });

  it("승인액도 없으면 → 예상 · 견적 줄 실행가", () => {
    expect(expenseCostBasis({ hasEvidence: false, evidenceAmountKrw: null, approvedSupplyKrw: null, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 13_000_000 });
  });

  it("확인 기록 무관 — 입력에 확인 칸이 없어 같은 입력은 같은 결과다", () => {
    const input = { hasEvidence: true, evidenceAmountKrw: 9_000_000, approvedSupplyKrw: 10_000_000, lineExecutionKrw: 11_000_000 };
    expect(expenseCostBasis(input)).toEqual(expenseCostBasis({ ...input }));
    expect(Object.keys(input)).not.toContain("review");
  });
});
