import { describe, expect, it } from "vitest";
import { hasPriorApproval, type RouteStep } from "@/domain/approvals/route";

// 06.6 D28 · D-6601 · D-6602: 지금 차수 단계 중 기안자 아닌 사람이 누른 승인이 있는가.
function step(overrides: Partial<RouteStep> = {}): RouteStep {
  return {
    stepIndex: 1,
    label: "팀장",
    roleId: null,
    scopeKind: "team",
    scopeTargetId: null,
    isFallback: false,
    actedBy: null,
    actedByName: null,
    actedAt: null,
    action: null,
    selfApproved: false,
    ...overrides,
  };
}

describe("hasPriorApproval — 앞 사람 승인 판정(06.6 D28)", () => {
  it("단계 없음 → false", () => {
    expect(hasPriorApproval([], "d")).toBe(false);
  });

  it("모든 단계가 처리 전 → false", () => {
    expect(hasPriorApproval([step(), step({ stepIndex: 2 })], "d")).toBe(false);
  });

  it("기안자 본인 승인만 → false(D-6602)", () => {
    expect(hasPriorApproval([step({ action: "approved", actedBy: "d", selfApproved: true }), step({ stepIndex: 2 })], "d")).toBe(false);
  });

  it("다른 사람 승인 1건 → true", () => {
    expect(hasPriorApproval([step({ action: "approved", actedBy: "lead" }), step({ stepIndex: 2 })], "d")).toBe(true);
  });

  it("다른 사람 반려만 → false", () => {
    expect(hasPriorApproval([step({ action: "rejected", actedBy: "lead" })], "d")).toBe(false);
  });

  it("승인인데 처리자 없음 → false", () => {
    expect(hasPriorApproval([step({ action: "approved", actedBy: null })], "d")).toBe(false);
  });

  it("폴백(대표) 승인 → true(D-6601)", () => {
    expect(hasPriorApproval([step({ isFallback: true, action: "approved", actedBy: "ceo" })], "d")).toBe(true);
  });

  it("기안자 본인 승인 + 다른 사람 승인 → true", () => {
    expect(
      hasPriorApproval(
        [step({ action: "approved", actedBy: "d", selfApproved: true }), step({ stepIndex: 2, action: "approved", actedBy: "head" })],
        "d",
      ),
    ).toBe(true);
  });
});
