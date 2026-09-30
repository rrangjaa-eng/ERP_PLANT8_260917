import { describe, expect, it, vi } from "vitest";

// Codex P2(PR #90 스레드 r4136830640 · 같은 뿌리): 승인 · 반려 · 다시 신청이 커밋된 뒤 토스트 재료 읽기(차감 일수 ·
// 투영)가 실패해도 액션은 성공으로 끝나야 한다 — 실패로 돌려주면 다시 누른 시도가 version 충돌이 되어 흐름이 끝나지
// 않는다(신청 쪽 4b5375d와 같은 규칙). 목은 평범한 함수로 둔다.
const revalidated: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void revalidated.push(path) }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/approvals/actions.registry", () => ({}));
vi.mock("@/app/(app)/leave/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({
  approveDocument: () => Promise.resolve({ documentId: "doc-1", final: true, kind: "leave", nextHolderNames: null }),
  rejectDocument: () => Promise.resolve({ documentId: "doc-1", drafterName: "박서연" }),
  withdrawDocument: () => Promise.resolve({ documentId: "doc-1" }),
  describeDeduction: () => Promise.reject(new Error("read after commit failed")),
  projectActionResult: () => Promise.reject(new Error("visibility read failed")),
  currentHolderNames: () => Promise.resolve(null),
}));
class LeaveValidationError extends Error {}
vi.mock("@/domain/leave", () => ({
  LEAVE_DOCUMENT_KIND: "leave",
  LeaveValidationError,
  submitLeave: () => Promise.resolve({ leaveId: "doc-1" }),
  formatRequestBalanceRow: () => null,
  formatRequestBalanceRowBeforeDates: () => null,
}));
vi.mock("@/domain/leave/access", () => ({ assertLeaveWrite: () => Promise.resolve() }));
vi.mock("@/domain/leave/balance-service", () => ({ previewLeaveBalance: () => Promise.resolve(null) }));
vi.mock("@/app/(app)/leave/route-preview", () => ({ previewRouteOrBlocked: () => Promise.resolve({ route: null, blocked: null }) }));
vi.mock("@/domain/leave/resubmit", () => ({ resubmitLeave: () => Promise.resolve({ leaveId: "doc-1", nextHolderNames: null }) }));

const { approveAction, rejectAction } = await import("@/app/(app)/approvals/actions");
const { resubmitLeaveAction } = await import("@/app/(app)/leave/actions");

const ID = "0b8f7a52-3c1e-4d9a-9f0e-2a6b5c4d3e21";
const INPUT = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "", note: "" };

describe("결재 · 다시 신청 액션 — 커밋 뒤 토스트 재료 실패", () => {
  it("최종 승인 뒤 차감 일수 읽기가 실패해도 성공(documentId · final)이고 결재함을 다시 그린다", async () => {
    revalidated.length = 0;
    const result = await approveAction({ instanceId: ID, expectedVersion: 1 });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ documentId: "doc-1", final: true });
    expect(revalidated).toEqual(["/approvals"]);
  });

  it("반려 뒤 투영이 실패해도 성공(documentId)이다", async () => {
    const result = await rejectAction({ instanceId: ID, expectedVersion: 1, reason: "일정 겹침" });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ documentId: "doc-1", final: false });
  });

  it("다시 신청 뒤 투영이 실패해도 성공(documentId)이다", async () => {
    const result = await resubmitLeaveAction({ leaveId: ID, expectedVersion: 1, input: INPUT });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ result: { documentId: "doc-1", final: false } });
  });
});
