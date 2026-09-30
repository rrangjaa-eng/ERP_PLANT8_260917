import { describe, expect, it, vi } from "vitest";

// Codex P2(PR #90): submitLeave가 커밋한 뒤 다음 담당 이름 읽기 · 투영이 실패해도 액션은 성공으로 끝나야 한다.
// 실패로 돌려주면 폼이 다시 신청하게 두고, 신청 액션에는 멱등 키가 없어 두 번째 신청이 생긴다. 목은 평범한 함수로 둔다.
const submitted: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/leave/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({
  withdrawDocument: () => Promise.resolve({ documentId: "d" }),
  projectActionResult: (_viewer: unknown, raw: unknown) => Promise.resolve(raw),
  currentHolderNames: () => Promise.reject(new Error("read after commit failed")),
}));
class LeaveValidationError extends Error {}
vi.mock("@/domain/leave", () => ({
  LEAVE_DOCUMENT_KIND: "leave",
  LeaveValidationError,
  submitLeave: () => {
    submitted.push("leave-1");
    return Promise.resolve({ leaveId: "leave-1" });
  },
  formatRequestBalanceRow: () => null,
  formatRequestBalanceRowBeforeDates: () => null,
}));
vi.mock("@/domain/leave/access", () => ({ assertLeaveWrite: () => Promise.resolve() }));
vi.mock("@/domain/leave/balance-service", () => ({ previewLeaveBalance: () => Promise.resolve(null) }));
vi.mock("@/app/(app)/leave/route-preview", () => ({ previewRouteOrBlocked: () => Promise.resolve({ route: null, blocked: null }) }));
vi.mock("@/domain/leave/resubmit", () => ({ resubmitLeave: () => Promise.resolve({ leaveId: "leave-1", nextHolderNames: null }) }));

const { submitLeaveAction } = await import("@/app/(app)/leave/actions");

const INPUT = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "", note: "" };

describe("연차 신청 액션 — 커밋 뒤 표시 재료 실패", () => {
  it("다음 담당 이름 읽기가 실패해도 신청은 성공으로 끝나고 문서 id를 돌려준다(이름 없는 토스트)", async () => {
    const result = await submitLeaveAction(INPUT);
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ result: { documentId: "leave-1", final: false } });
    expect(submitted).toEqual(["leave-1"]);
  });
});
