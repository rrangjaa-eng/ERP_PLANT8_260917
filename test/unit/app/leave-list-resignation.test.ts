import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Codex P2(PR #90 스레드 r4137164401): 보는 연도가 퇴직 연도면 getMyLeaveBalance가 퇴직 줄 재료(resignation)를
// 주는데, /leave 목록은 그것을 빼고 포맷해 보통 연차 · 월차 줄을 보였다(관리자 화면은 퇴직 줄 하나). 같은 재료를
// 넘겨 퇴직 줄 하나만 보인다.
vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("next/navigation", () => ({ notFound: () => undefined, useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/domain/leave", () => ({
  listMyLeave: () => Promise.resolve([]),
  myLeaveYearRange: () => Promise.resolve(null),
}));
vi.mock("@/domain/leave/balance-service", () => ({
  getMyLeaveBalance: () =>
    Promise.resolve({
      annual: { grantQuarters: 60, adjustmentQuarters: 0, usedQuarters: 8, pendingQuarters: 0, remainingQuarters: 52 },
      monthly: null,
      resignation: { resignationDate: "2026-10-31", annualRemainingQuarters: 20, monthlyRemainingQuarters: 0 },
    }),
}));

const { default: LeaveListPage } = await import("@/app/(app)/leave/(list)/page");

describe("/leave 목록 — 퇴직 연도 잔고", () => {
  it("퇴직 연도면 퇴직 줄 하나만 보이고 보통 연차 줄은 없다", async () => {
    const html = renderToStaticMarkup(await LeaveListPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("퇴직 2026-10-31");
    expect(html).not.toContain("연차 15일");
  });
});
