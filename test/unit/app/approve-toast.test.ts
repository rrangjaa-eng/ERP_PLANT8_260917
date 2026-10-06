import { describe, expect, it } from "vitest";
import { approveToast } from "@/app/(app)/approvals/approve-toast";

// 05-01(Round 4 D8): 최종 승인 토스트 꼬리 — 차감 일수(04.1) > 종류 요약 finalNote > 꼬리 없음.
describe("approveToast", () => {
  it("최종 승인 · 차감 일수가 있으면 04.1 그대로", () => {
    expect(approveToast({ final: true, deductedDays: "2일" })).toBe("승인 · 최종 승인 · 2일 차감");
  });

  it("최종 승인 · 차감 일수 없이 finalNote가 있으면 그 글자를 꼬리로", () => {
    expect(approveToast({ final: true, finalNote: "26001 완료" })).toBe("승인 · 최종 승인 · 26001 완료");
  });

  it("최종 승인 · 둘 다 없으면 꼬리 없음", () => {
    expect(approveToast({ final: true })).toBe("승인 · 최종 승인");
  });

  it("최종이 아니면 04.1 그대로", () => {
    expect(approveToast({ final: false, nextHolderNames: "김팀장" })).toBe("승인 · 결재 요청됨 → 김팀장");
    expect(approveToast({ final: false, finalNote: "26001 완료" })).toBe("승인 · 결재 요청됨");
  });
});
