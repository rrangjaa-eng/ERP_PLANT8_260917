import { describe, expect, it } from "vitest";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import type { ApprovalStepView } from "@/domain/approvals/dto";

function step(over: Partial<ApprovalStepView> & Pick<ApprovalStepView, "stepIndex" | "label" | "state">): ApprovalStepView {
  return {
    isFallback: false,
    holderNames: "",
    actedByName: null,
    actedAt: null,
    selfApproved: false,
    reason: null,
    viewerHolds: false,
    ...over,
  };
}

const SUBMITTED = new Date("2026-11-03T05:30:00.000Z"); // KST 14:30

describe("toApprovalBoxes — 최소 매핑 (D-7410)", () => {
  it("결재 인스턴스가 없으면 기안 칸 하나 · 작성 중 · 일시 없음", () => {
    const result = toApprovalBoxes({ drafterName: "박서연", submittedAt: null, instanceId: null, steps: undefined });
    expect(result.boxes).toEqual([{ label: "기안", name: "박서연", stateText: "작성 중", at: null, dataState: "draft" }]);
    expect(result.columns).toBe(4);
    expect(result.rejectReason).toBeNull();
  });

  it("승인 · 현재 단계 → 칸 3개, 열 수는 4", () => {
    const result = toApprovalBoxes({
      drafterName: "박서연",
      submittedAt: SUBMITTED,
      instanceId: "i1",
      steps: [
        step({ stepIndex: 1, label: "팀장", state: "approved", actedByName: "김도윤", actedAt: new Date("2026-11-03T06:00:00.000Z") }),
        step({ stepIndex: 2, label: "대표", state: "current" }),
      ],
    });
    expect(result.boxes).toHaveLength(3);
    expect(result.boxes[0]).toEqual({ label: "기안", name: "박서연", stateText: "상신", at: "2026-11-03 14:30", dataState: "submitted" });
    expect(result.boxes[1]).toEqual({ label: "팀장", name: "김도윤", stateText: "승인", at: "2026-11-03 15:00", dataState: "approved" });
    expect(result.boxes[2]).toEqual({ label: "대표", name: "—", stateText: "대기", at: null, dataState: "pending" });
    expect(result.columns).toBe(4);
  });

  it("steps가 투영으로 빠지면 기안 칸 하나 · 상신 · 이름이 빠지면 —", () => {
    const result = toApprovalBoxes({ drafterName: undefined, submittedAt: null, instanceId: "i1", steps: undefined });
    expect(result.boxes).toEqual([{ label: "기안", name: "—", stateText: "상신", at: null, dataState: "submitted" }]);
  });

  it("5칸이면 열 수 5", () => {
    const steps = [1, 2, 3, 4].map((n) => step({ stepIndex: n, label: `단${n}`, state: "pending" }));
    expect(toApprovalBoxes({ drafterName: "가", submittedAt: SUBMITTED, instanceId: "i1", steps }).columns).toBe(5);
  });
});

describe("toApprovalBoxes — 전체 매핑 (UI-SPEC 결재란 표)", () => {
  const ACTED = new Date("2026-11-03T06:00:00.000Z"); // KST 15:00
  const all = (steps: ApprovalStepView[]) => toApprovalBoxes({ drafterName: "박서연", submittedAt: SUBMITTED, instanceId: "i1", steps });

  it.each([
    [{ state: "approved", actedByName: "김도윤", actedAt: ACTED }, { name: "김도윤", stateText: "승인", at: "2026-11-03 15:00", dataState: "approved" }],
    [{ state: "approved", actedByName: "박서연", actedAt: ACTED, selfApproved: true }, { name: "박서연", stateText: "본인 승인", at: "2026-11-03 15:00", dataState: "self" }],
    [{ state: "rejected", actedByName: "김도윤", actedAt: ACTED, reason: "금액 확인" }, { name: "김도윤", stateText: "반려", at: "2026-11-03 15:00", dataState: "rejected" }],
    [{ state: "current" }, { name: "—", stateText: "대기", at: null, dataState: "pending" }],
    [{ state: "pending" }, { name: "—", stateText: "대기", at: null, dataState: "pending" }],
    [{ state: "skipped_self" }, { name: "—", stateText: "건너뜀", at: null, dataState: "skipped" }],
    [{ state: "empty" }, { name: "—", stateText: "담당 없음", at: null, dataState: "empty" }],
    [{ state: "blocked" }, { name: "—", stateText: "담당 없음", at: null, dataState: "empty" }],
  ] as const)("%j", (over, expected) => {
    const result = all([step({ stepIndex: 1, label: "팀장", ...over })]);
    expect(result.boxes[1]).toEqual({ label: "팀장", ...expected });
  });

  it("반려 단계의 사유가 rejectReason이다", () => {
    const result = all([step({ stepIndex: 1, label: "팀장", state: "rejected", actedByName: "김도윤", actedAt: ACTED, reason: "금액 확인" })]);
    expect(result.rejectReason).toBe("금액 확인");
  });

  it("칸이 6개여도(방어) 열 수는 5", () => {
    const steps = [1, 2, 3, 4, 5].map((n) => step({ stepIndex: n, label: `단${n}`, state: "pending" }));
    const result = all(steps);
    expect(result.boxes).toHaveLength(6);
    expect(result.columns).toBe(5);
  });

  it("기안 칸 일시가 없는 뷰어(시각 투영)는 일시 없음", () => {
    const result = toApprovalBoxes({ drafterName: "박서연", submittedAt: null, instanceId: "i1", steps: [] });
    expect(result.boxes[0]).toEqual({ label: "기안", name: "박서연", stateText: "상신", at: null, dataState: "submitted" });
  });
});
