import { describe, expect, it } from "vitest";
import { documentStatusText } from "@/app/print/_frame/status-text";

// 07.4-01 D-7411 — 번호 줄 상태 글자. 화면과 같은 낱말 · 같은 어순(`{단계} 결재 중`)이고 보는 사람 기준 낱말은 없다.
describe("documentStatusText", () => {
  it("승인 완료 · 본인 승인은 글자가 없다", () => {
    expect(documentStatusText("approved", null)).toBeNull();
    expect(documentStatusText("self_approved", null)).toBeNull();
  });

  it("결재 중은 {단계} 결재 중, 단계를 모르면 결재 중", () => {
    expect(documentStatusText("in_review", "대표")).toBe("대표 결재 중");
    expect(documentStatusText("submitted", "팀장")).toBe("팀장 결재 중");
    expect(documentStatusText("in_review", null)).toBe("결재 중");
    expect(documentStatusText("in_review", "대표")).not.toContain("결재 중 ·");
  });

  it("반려 · 회수 · 작성 중", () => {
    expect(documentStatusText("rejected", null)).toBe("반려");
    expect(documentStatusText("withdrawn", null)).toBe("회수");
    expect(documentStatusText("draft", null)).toBe("작성 중");
    expect(documentStatusText(undefined, null)).toBe("작성 중");
  });

  it("결재 상태를 모르는 값도 작성 중이다", () => {
    expect(documentStatusText("unknown", null)).toBe("작성 중");
  });

  it("종결은 결재 상태보다 먼저 보고 상세 화면과 같은 낱말이다", () => {
    expect(documentStatusText("rejected", null, true)).toBe("종결");
    expect(documentStatusText("withdrawn", null, true)).toBe("종결");
    expect(documentStatusText("approved", null, true)).toBe("종결");
  });

  it("보는 사람 기준 낱말은 나오지 않는다", () => {
    for (const status of ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn", undefined]) {
      expect(documentStatusText(status, "대표")).not.toMatch(/내 결재|대기/);
    }
  });
});
