import { describe, expect, it } from "vitest";
import { expenseCostBasis } from "@/domain/evidence-reviews/cost-basis";

// 06-11(EVID-03 · EVID-04 · D-602) — 문서 비용 기준 한 함수. 확인 기록은 입력이 아니다(확인은 검수 표시이지 비용 단계가 아니다).
// 06.5 D-6520 — 금액은 공급가액 하나(증빙 금액 칸은 입력이 아니다).

describe("expenseCostBasis", () => {
  it("증빙 있음 · 공급가 있음 → 확정 · 공급가", () => {
    expect(expenseCostBasis({ hasEvidence: true, supplyKrw: 100_000, lineExecutionKrw: 120_000 })).toEqual({ kind: "confirmed", amountKrw: 100_000 });
  });

  it("증빙 없음 · 공급가 있음 → 예상 · 공급가", () => {
    expect(expenseCostBasis({ hasEvidence: false, supplyKrw: 12_400_000, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 12_400_000 });
  });

  it("공급가도 없으면 → 예상 · 견적 줄 실행가", () => {
    expect(expenseCostBasis({ hasEvidence: true, supplyKrw: null, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 13_000_000 });
    expect(expenseCostBasis({ hasEvidence: false, supplyKrw: null, lineExecutionKrw: 13_000_000 })).toEqual({ kind: "expected", amountKrw: 13_000_000 });
  });

  it("확인 기록 · 증빙 금액 무관 — 입력에 그 칸이 없다", () => {
    const input = { hasEvidence: true, supplyKrw: 10_000_000, lineExecutionKrw: 11_000_000 };
    expect(expenseCostBasis(input)).toEqual(expenseCostBasis({ ...input }));
    expect(Object.keys(input)).not.toContain("review");
    expect(Object.keys(input)).not.toContain("evidenceAmountKrw");
  });
});
