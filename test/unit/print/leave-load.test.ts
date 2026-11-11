import { describe, expect, it, vi } from "vitest";

// 07.2-15 게이트 지적: 취소가 최종 승인된 연차는 인쇄하지 않는다 — 인쇄 레이아웃이 응답 전에 쓰는 판정(loadLeaveForPrint)이
// 볼 수 없는 문서와 같은 null을 돌려 404가 된다(새 문구 0). 취소 요청 중 · 반려된 취소(none)는 그대로 인쇄한다.
const state = vi.hoisted((): { leave: Record<string, unknown> | null } => ({ leave: null }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/viewer", () => ({ getSessionId: () => Promise.resolve("session"), requireSession: () => Promise.resolve({ viewer: { id: "viewer", roleId: "role-pm" } }) }));
vi.mock("@/domain/leave", () => ({ getLeave: () => Promise.resolve(state.leave) }));

const { loadLeaveForPrint } = await import("../../../app/print/leaves/[id]/load");
const ID = "11111111-1111-4111-8111-111111111111";

describe("loadLeaveForPrint — 취소된 연차", () => {
  it("cancelState cancelled면 null(레이아웃 404)", async () => {
    state.leave = { id: ID, status: "approved", cancelState: "cancelled" };
    expect(await loadLeaveForPrint(ID)).toBeNull();
  });

  it("취소 요청 중 · 취소 없음이면 그 연차를 돌려준다", async () => {
    for (const cancelState of ["requested", "none"]) {
      state.leave = { id: ID, status: "approved", cancelState };
      expect(await loadLeaveForPrint(ID)).toEqual(state.leave);
    }
  });
});
