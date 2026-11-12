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
  ] as const)("%j", (over, expected) => {
    const result = all([step({ stepIndex: 1, label: "팀장", ...over })]);
    expect(result.boxes[1]).toEqual({ label: "팀장", ...expected });
  });

  it.each(["empty", "blocked"] as const)("결재권자가 없는 중간 단계(%s)는 칸을 그리지 않는다 — 열 수는 남은 칸 기준", (state) => {
    const result = all([
      step({ stepIndex: 1, label: "팀장", state: "approved", actedByName: "김도윤", actedAt: ACTED }),
      step({ stepIndex: 2, label: "본부장", state }),
      step({ stepIndex: 3, label: "경영", state: "pending" }),
      step({ stepIndex: 4, label: "대표", state: "pending" }),
    ]);
    expect(result.boxes.map((box) => box.label)).toEqual(["기안", "팀장", "경영", "대표"]);
    expect(result.boxes.some((box) => box.stateText === "담당 없음")).toBe(false);
    expect(result.columns).toBe(4);
  });

  it("자기 승인 건너뜀은 결재권자(기안자)가 있으므로 칸이 남는다", () => {
    const result = all([step({ stepIndex: 1, label: "팀장", state: "skipped_self" }), step({ stepIndex: 2, label: "본부장", state: "empty" })]);
    expect(result.boxes.map((box) => box.label)).toEqual(["기안", "팀장"]);
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

describe("toApprovalBoxes — 되돌려 다시 작성 중인 인스턴스 (07.2-19 P2-1)", () => {
  const ACTED = new Date("2026-11-03T06:00:00.000Z");
  const pastRound = [
    step({ stepIndex: 1, label: "팀장", state: "approved", actedByName: "김도윤", actedAt: ACTED }),
    step({ stepIndex: 2, label: "대표", state: "approved", actedByName: "이대표", actedAt: ACTED }),
  ];

  it("인스턴스가 draft면 지난 차수 승인 · 일시를 찍지 않는다 — 기안 칸 하나 · 작성 중", () => {
    const result = toApprovalBoxes({ drafterName: "박서연", submittedAt: SUBMITTED, instanceId: "i1", status: "draft", steps: pastRound });
    expect(result.boxes).toEqual([{ label: "기안", name: "박서연", stateText: "작성 중", at: null, dataState: "draft" }]);
    expect(result.columns).toBe(4);
    expect(result.rejectReason).toBeNull();
  });

  it.each([undefined, "approved", "in_review"] as const)("status가 %s면 결과가 바뀌지 않는다(다른 문서 종류)", (status) => {
    const withStatus = toApprovalBoxes({ drafterName: "박서연", submittedAt: SUBMITTED, instanceId: "i1", status, steps: pastRound });
    const without = toApprovalBoxes({ drafterName: "박서연", submittedAt: SUBMITTED, instanceId: "i1", steps: pastRound });
    expect(withStatus).toEqual(without);
    expect(without.boxes[1]?.stateText).toBe("승인");
  });
});
