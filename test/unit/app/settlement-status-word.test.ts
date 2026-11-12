import { describe, expect, it } from "vitest";
import { settlementStatusWord } from "@/app/(app)/projects/status-display";
import { leaveStatusWord } from "@/app/(app)/leave/status-display";
import { statusKind } from "@/ui/status-tag/status-map";

// 07.2-19 후속(카드 11/12): 정산 문서 화면 상태 태그는 머리 줄 · 목록과 같은 `작성 중`이다.
// 연차 등 다른 종류의 draft 낱말(`임시`)은 leaveStatusWord 그대로 — 여기는 정산만 바꾼다.
describe("settlementStatusWord", () => {
  it("draft → 작성 중 (muted)", () => {
    expect(settlementStatusWord("draft")).toBe("작성 중");
    expect(statusKind(settlementStatusWord("draft"))).toBe("muted");
  });

  it("draft 외에는 leaveStatusWord와 같다", () => {
    expect(settlementStatusWord("in_review", "대표")).toBe("대표 결재 중");
    expect(settlementStatusWord("approved")).toBe("승인");
    expect(settlementStatusWord("rejected")).toBe("반려");
  });

  it("leaveStatusWord(draft)는 그대로 임시", () => {
    expect(leaveStatusWord("draft")).toBe("임시");
  });
});
