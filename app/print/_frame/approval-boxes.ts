import type { ApprovalStepView } from "@/domain/approvals/dto";
import type { ApprovalStatus } from "@/domain/approvals/route";
import { kstDateTimeOf } from "@/lib/kst-date";

// 07.4-01 D-7410: 결재선 → 가로 결재 칸. 순수 함수 — 칸 구성 · 상태 글자 · data-state를 정한다(UI-SPEC 「결재란」 표).
export type ApprovalBoxState = "submitted" | "draft" | "approved" | "rejected" | "pending" | "skipped" | "self";

export type ApprovalBox = { label: string; name: string; stateText: string; at: string | null; dataState: ApprovalBoxState };

export type ApprovalBoxes = { boxes: ApprovalBox[]; columns: 4 | 5; rejectReason: string | null };

type Input = {
  drafterName: string | null | undefined;
  submittedAt: Date | null;
  instanceId: string | null | undefined;
  // 정산서만 넘긴다(07.2-19 P2-1) — 빠지면 지금까지와 같다.
  status?: ApprovalStatus | undefined;
  steps: readonly ApprovalStepView[] | undefined;
};

const NONE = "—";

// 결재권자가 없는 단계(empty · blocked)는 칸 자체를 그리지 않는다(사용자 결정 2026-11-05) — null.
function stepBox(step: ApprovalStepView): ApprovalBox | null {
  switch (step.state) {
    case "approved":
      return {
        label: step.label,
        name: step.actedByName ?? NONE,
        stateText: step.selfApproved ? "본인 승인" : "승인",
        at: step.actedAt ? kstDateTimeOf(step.actedAt) : null,
        dataState: step.selfApproved ? "self" : "approved",
      };
    case "rejected":
      return { label: step.label, name: step.actedByName ?? NONE, stateText: "반려", at: step.actedAt ? kstDateTimeOf(step.actedAt) : null, dataState: "rejected" };
    case "current":
    case "pending":
      return { label: step.label, name: NONE, stateText: "대기", at: null, dataState: "pending" };
    case "skipped_self":
      return { label: step.label, name: NONE, stateText: "건너뜀", at: null, dataState: "skipped" };
    case "empty":
    case "blocked":
      return null;
    default: {
      const unreachable: never = step.state;
      return unreachable;
    }
  }
}

export function toApprovalBoxes(input: Input): ApprovalBoxes {
  const name = input.drafterName ?? NONE;
  // 결재 인스턴스가 없거나 되돌려 다시 작성 중(draft)이면 작성 중 — 기안 칸 하나, 일시 없음. draft의 steps는 지난 차수 승인이라 찍지 않는다.
  if (!input.instanceId || input.status === "draft") {
    return { boxes: [{ label: "기안", name, stateText: "작성 중", at: null, dataState: "draft" }], columns: 4, rejectReason: null };
  }
  const drafter: ApprovalBox = { label: "기안", name, stateText: "상신", at: input.submittedAt ? kstDateTimeOf(input.submittedAt) : null, dataState: "submitted" };
  // 결재선을 못 보는 계급(steps가 투영으로 빠짐)은 기안 칸 하나만 — 결재자 이름 · 일시 · 사유는 싣지 않는다.
  if (!input.steps) return { boxes: [drafter], columns: 4, rejectReason: null };
  const boxes = [drafter, ...input.steps.flatMap((step) => stepBox(step) ?? [])];
  const rejected = input.steps.find((step) => step.state === "rejected");
  return { boxes, columns: Math.min(5, Math.max(4, boxes.length)) as 4 | 5, rejectReason: rejected?.reason ?? null };
}
