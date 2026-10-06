import { describe, expect, it } from "vitest";
import { lineStatusWord } from "@/app/(app)/projects/status-display";

// 05-15 UI-SPEC S1 「상태 열 파생값」 — 한 값 규칙 취소 > 반려 > 지출결의 중 > 미착수.
describe("lineStatusWord", () => {
  it("연결 문서가 없으면 Phase 4 낱말(미착수 · 취소)을 그대로 쓴다", () => {
    expect(lineStatusWord({ lineStatus: "not_started", linkedStatus: null })).toBe("미착수");
    expect(lineStatusWord({ lineStatus: "cancelled", linkedStatus: null })).toBe("취소");
  });

  it("결재 중 · 승인 문서가 있으면 지출결의 중, 반려가 있으면 반려", () => {
    expect(lineStatusWord({ lineStatus: "not_started", linkedStatus: "active" })).toBe("지출결의 중");
    expect(lineStatusWord({ lineStatus: "not_started", linkedStatus: "rejected" })).toBe("반려");
  });

  it("취소가 반려와 지출결의 중을 이긴다", () => {
    expect(lineStatusWord({ lineStatus: "cancelled", linkedStatus: "rejected" })).toBe("취소");
    expect(lineStatusWord({ lineStatus: "cancelled", linkedStatus: "active" })).toBe("취소");
  });
});
