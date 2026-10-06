import { describe, expect, it } from "vitest";
import { submitBlockReason, UPLOADING_REASON } from "@/app/(app)/expenses/[id]/submit-block";

// 05-05(D2 Round 3): 올리는 행이 있는 동안 제출 1차를 막는 이유 — 서버가 준 첫 이유가 없거나 ⑧(대상 evidence)일 때만
// 클라이언트 이유가 대신 선다. 서버 ①~⑦ · ⑨는 기다려도 풀리지 않는 막힘이라 그대로 선다.
describe("submitBlockReason", () => {
  it("서버 이유 없음 · 올리는 행 0 → null", () => {
    expect(submitBlockReason({ server: null, uploadingCount: 0 })).toBeNull();
  });

  it("서버 이유 없음 · 올리는 행 1 → 올리는 중(info · 대상 없음)", () => {
    expect(submitBlockReason({ server: null, uploadingCount: 1 })).toEqual({ reason: "증빙 올리는 중 · 잠시 뒤 제출", tone: "info", target: null });
    expect(UPLOADING_REASON).toBe("증빙 올리는 중 · 잠시 뒤 제출");
  });

  it("⑧(대상 evidence) · 올리는 행 2 → 같은 클라이언트 이유", () => {
    const eight = { reason: "증빙 없음 · 증빙 올리기 Ctrl+U", target: "evidence" };
    expect(submitBlockReason({ server: eight, uploadingCount: 2 })).toEqual({ reason: "증빙 올리는 중 · 잠시 뒤 제출", tone: "info", target: null });
  });

  it("⑧ · 올리는 행 0 → ⑧ 그대로(block)", () => {
    const eight = { reason: "증빙 없음 · 증빙 올리기 Ctrl+U", target: "evidence" };
    expect(submitBlockReason({ server: eight, uploadingCount: 0 })).toEqual({ reason: eight.reason, tone: "block", target: "evidence" });
  });

  it("⑤(대상 vendor) · 올리는 행 1 → ⑤ 그대로", () => {
    const five = { reason: "거래처 없음 · 거래처 고르기", target: "vendor" };
    expect(submitBlockReason({ server: five, uploadingCount: 1 })).toEqual({ reason: five.reason, tone: "block", target: "vendor" });
  });

  it("⑨(대상 없음) · 올리는 행 1 → ⑨ 그대로", () => {
    const nine = { reason: "세금 계산 불가 · 세율은 경영관리", target: null };
    expect(submitBlockReason({ server: nine, uploadingCount: 1 })).toEqual({ reason: nine.reason, tone: "block", target: null });
  });
});
