import { describe, expect, it } from "vitest";
import { preSettleStatusWord } from "@/app/(app)/projects/[id]/pre-settle-word";
import { statusKind } from "@/ui/status-tag/status-map";

// 06-19(S18 · O-14 · C2): 완료 전 점검 미결 지출결의 행의 낱말은 status-map 낱말 하나씩(색은 표가 정한다).
// test/unit/domain/에서는 app을 import할 수 없어(eslint boundaries) 이 자리에 둔다.
describe("preSettleStatusWord", () => {
  it("rejected · prepaid_no_evidence · no_evidence · in_review → 반려 · 선결제 · 증빙 없음 · 증빙 없음 · 결재 중", () => {
    expect(preSettleStatusWord("rejected")).toBe("반려");
    expect(preSettleStatusWord("prepaid_no_evidence")).toBe("선결제 · 증빙 없음");
    expect(preSettleStatusWord("no_evidence")).toBe("증빙 없음");
    expect(preSettleStatusWord("in_review")).toBe("결재 중");
  });

  it("막힘 낱말은 danger, 결재 중은 accent", () => {
    expect(statusKind(preSettleStatusWord("rejected"))).toBe("danger");
    expect(statusKind(preSettleStatusWord("prepaid_no_evidence"))).toBe("danger");
    expect(statusKind(preSettleStatusWord("in_review"))).toBe("accent");
  });
});
