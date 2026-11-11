import { describe, expect, it, vi } from "vitest";

// Codex P2(PR #376): 취소 요청 · 다시 요청이 커밋된 뒤 토스트 재료 투영(projectActionResult)이 실패해도 액션은 성공으로 끝나야 한다.
// 실패로 돌려주면 창이 닫히지 않고, 다시 누르면 「이미 요청」 가드나 낡은 version에 걸린다(연차 신청 액션과 같은 규칙).
const warned: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/leave/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: (event: string) => void warned.push(event), error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({
  withdrawDocument: () => Promise.resolve({ documentId: "d" }),
  projectActionResult: () => Promise.reject(new Error("projection failed after commit")),
  currentHolderNames: () => Promise.resolve(null),
}));
vi.mock("@/domain/leave", () => ({
  LEAVE_DOCUMENT_KIND: "leave",
  LeaveValidationError: class extends Error {},
  submitLeave: () => Promise.resolve({ leaveId: "leave-1" }),
  formatRequestBalanceRow: () => null,
  formatRequestBalanceRowBeforeDates: () => null,
}));
vi.mock("@/domain/leave/access", () => ({ assertLeaveWrite: () => Promise.resolve() }));
vi.mock("@/domain/leave/balance-service", () => ({ previewLeaveBalance: () => Promise.resolve(null) }));
vi.mock("@/domain/leave/guard", () => ({ loadLeaveHolidays: () => Promise.resolve(() => new Set<string>()) }));
vi.mock("@/app/(app)/leave/route-preview", () => ({ previewRouteOrBlocked: () => Promise.resolve({ route: null, blocked: null }) }));
vi.mock("@/domain/leave/cancel", () => ({
  requestLeaveCancel: () => Promise.resolve({ instanceId: "i", version: 1, approverName: "김팀장" }),
  resubmitLeaveCancel: () => Promise.resolve({ instanceId: "i", version: 2, approverName: "김팀장" }),
}));
vi.mock("@/domain/leave/resubmit", () => ({ resubmitLeave: () => Promise.resolve({ leaveId: "leave-1", nextHolderNames: null }) }));

const { requestLeaveCancelAction, resubmitLeaveCancelAction } = await import("@/app/(app)/leave/actions");
const LEAVE_ID = "11111111-1111-4111-8111-111111111111";

describe("연차 취소 액션 — 커밋 뒤 토스트 재료 투영 실패", () => {
  it("취소 요청: 서버 오류 없이 구조적 성공 · 경고 기록", async () => {
    const result = await requestLeaveCancelAction({ leaveId: LEAVE_ID, reason: "일정 바뀜" });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ result: { documentId: LEAVE_ID, final: false } });
    expect(warned).toContain("leave.cancel_toast_material_failed");
  });

  it("취소 다시 요청: 서버 오류 없이 구조적 성공 · 경고 기록", async () => {
    const result = await resubmitLeaveCancelAction({ leaveId: LEAVE_ID, expectedVersion: 1, reason: "다시 요청" });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ result: { documentId: LEAVE_ID, final: false } });
    expect(warned).toContain("leave.cancel_resubmit_toast_material_failed");
  });
});
