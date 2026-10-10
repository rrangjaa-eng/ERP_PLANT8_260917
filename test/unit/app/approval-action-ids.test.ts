import { beforeEach, describe, expect, it, vi } from "vitest";

// /review(security): 결재 · 연차 액션의 문서 id는 uuid 열이다 — 모양이 아닌 값은 스키마에서 막아 도메인
// (DB 22P02 → 일반 500 · log.error)까지 가지 않게 한다. 목은 평범한 함수로 둔다.
const calls: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/approvals/actions.registry", () => ({}));
vi.mock("@/app/(app)/leave/actions.registry", () => ({}));
vi.mock("@/domain/approvals", () => ({
  approveDocument: () => {
    calls.push("approve");
    return Promise.resolve({ documentId: "d", final: false, kind: "leave", nextHolderNames: null });
  },
  rejectDocument: () => {
    calls.push("reject");
    return Promise.resolve({ documentId: "d", drafterName: null });
  },
  withdrawDocument: () => {
    calls.push("withdraw");
    return Promise.resolve({ documentId: "d" });
  },
  describeDeduction: () => Promise.resolve(null),
  projectActionResult: (_viewer: unknown, raw: unknown) => Promise.resolve(raw),
  currentHolderNames: () => Promise.resolve(null),
}));
class LeaveValidationError extends Error {}
vi.mock("@/domain/leave", () => ({
  LEAVE_DOCUMENT_KIND: "leave",
  LeaveValidationError,
  submitLeave: () => Promise.resolve({ leaveId: "d" }),
  formatRequestBalanceRow: () => null,
  formatRequestBalanceRowBeforeDates: () => null,
}));
vi.mock("@/domain/leave/access", () => ({ assertLeaveWrite: () => Promise.resolve() }));
vi.mock("@/domain/leave/balance-service", () => ({ previewLeaveBalance: () => Promise.resolve(null) }));
vi.mock("@/domain/leave/guard", () => ({ loadLeaveHolidays: () => Promise.resolve(() => new Set<string>()) }));
vi.mock("@/app/(app)/leave/route-preview", () => ({ previewRouteOrBlocked: () => Promise.resolve({ route: null, blocked: null }) }));
vi.mock("@/domain/leave/resubmit", () => ({
  resubmitLeave: () => {
    calls.push("resubmit");
    return Promise.resolve({ leaveId: "d", nextHolderNames: null });
  },
}));

const { approveAction, rejectAction } = await import("@/app/(app)/approvals/actions");
const { withdrawLeaveAction, resubmitLeaveAction } = await import("@/app/(app)/leave/actions");
// 05-01(Round 4 D8): 종류 중립 회수 액션.
const { withdrawAction } = await import("@/app/(app)/approvals/actions");

const BAD_ID = "not-a-uuid";
const INPUT = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "", note: "" };

describe("결재 · 연차 액션 id 형식", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each([
    ["approve", () => approveAction({ instanceId: BAD_ID, expectedVersion: 1 })],
    ["reject", () => rejectAction({ instanceId: BAD_ID, expectedVersion: 1, reason: "사유" })],
    ["withdraw", () => withdrawLeaveAction({ instanceId: BAD_ID, expectedVersion: 1 })],
    ["resubmit", () => resubmitLeaveAction({ leaveId: BAD_ID, expectedVersion: 1, input: INPUT })],
    ["withdraw (종류 중립)", () => withdrawAction({ instanceId: BAD_ID, expectedVersion: 1 })],
  ] as const)("%s — uuid가 아닌 id는 도메인에 닿지 않고 입력 오류로 끝난다", async (_name, run) => {
    const result = await run();
    expect(result?.validationErrors).toBeDefined();
    expect(calls).toEqual([]);
  });
});
