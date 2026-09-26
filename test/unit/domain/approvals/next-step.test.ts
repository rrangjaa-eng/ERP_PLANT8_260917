import { describe, expect, it } from "vitest";
import {
  nextStep,
  InvalidTransitionError,
  APPROVAL_EVENTS,
  APPROVAL_STATUSES,
  type ApprovalEvent,
  type ApprovalStatus,
} from "@/domain/approvals/route";

describe("nextStep — 기본 전이", () => {
  it("draft → submit → submitted", () => {
    expect(nextStep("draft", "submit")).toBe("submitted");
  });

  it("submitted → approve → in_review, in_review → approve_final → approved", () => {
    expect(nextStep("submitted", "approve")).toBe("in_review");
    expect(nextStep("in_review", "approve_final")).toBe("approved");
  });

  it("approved 뒤의 approve는 InvalidTransitionError", () => {
    expect(() => nextStep("approved", "approve")).toThrow(InvalidTransitionError);
  });
});

// 여섯 상태 × 여섯 사건 = 36칸 전체. 허용 칸은 기대 상태, 나머지는 예외.
const ALLOWED: Record<ApprovalStatus, Partial<Record<ApprovalEvent, ApprovalStatus>>> = {
  draft: { submit: "submitted" },
  submitted: { approve: "in_review", approve_final: "approved", reject: "rejected", withdraw: "withdrawn" },
  in_review: { approve: "in_review", approve_final: "approved", reject: "rejected", withdraw: "withdrawn" },
  approved: {},
  rejected: { resubmit: "submitted" },
  withdrawn: {},
};

describe("nextStep — 상태 × 사건 36칸 표", () => {
  it("표의 칸 수는 36이다", () => {
    expect(APPROVAL_STATUSES.length * APPROVAL_EVENTS.length).toBe(36);
  });

  for (const status of APPROVAL_STATUSES) {
    for (const event of APPROVAL_EVENTS) {
      const expected = ALLOWED[status][event];
      it(`${status} × ${event} → ${expected ?? "거부"}`, () => {
        if (expected) expect(nextStep(status, event)).toBe(expected);
        else expect(() => nextStep(status, event)).toThrow(InvalidTransitionError);
      });
    }
  }
});
