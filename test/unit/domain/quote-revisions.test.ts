import { describe, expect, it } from "vitest";
import { approvedOnOf, customerApprovalColumns } from "@/domain/quotes/revisions";

// 04-14(CEO 리뷰 B-25) — 승인일은 KST 달력 날짜로 받아 그날 KST 00:00 순간으로 저장하고, 읽을 때 같은 날짜로
// 돌아온다(04-29 kstDayStart ↔ kstDateOf 한 쌍 — 도우미 자체의 왕복 표는 test/unit/lib/kst-date.test.ts).
describe("승인일 KST 왕복 (B-25)", () => {
  it("2026-09-19로 켜면 저장 순간은 2026-09-18T15:00:00.000Z이고 승인자가 함께 실린다", () => {
    const columns = customerApprovalColumns("u-pm", "2026-09-19");
    expect(columns.customerApprovedAt?.toISOString()).toBe("2026-09-18T15:00:00.000Z");
    expect(columns.customerApprovedBy).toBe("u-pm");
  });

  it("저장 순간을 읽으면 같은 날짜 2026-09-19로 돌아온다", () => {
    expect(approvedOnOf(customerApprovalColumns("u-pm", "2026-09-19").customerApprovedAt)).toBe("2026-09-19");
  });

  it("끄기는 승인일·승인자를 둘 다 비우고, 빈 승인일은 null로 읽힌다", () => {
    expect(customerApprovalColumns("u-pm", null)).toEqual({ customerApprovedAt: null, customerApprovedBy: null });
    expect(approvedOnOf(null)).toBeNull();
  });
});
