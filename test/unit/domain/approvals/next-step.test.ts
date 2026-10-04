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

// 05-01 E1: 회수 뒤 같은 문서 다시 제출 — 선택 셋째 인자가 참일 때만 withdrawn --resubmit--> submitted 한 칸이 열린다.
describe("nextStep — allowResubmitFromWithdrawn(05-01 E1)", () => {
  it("셋째 인자 없이 withdrawn × resubmit은 거부", () => {
    expect(() => nextStep("withdrawn", "resubmit")).toThrow(InvalidTransitionError);
  });

  it("allowResubmitFromWithdrawn: true면 withdrawn × resubmit → submitted", () => {
    expect(nextStep("withdrawn", "resubmit", { allowResubmitFromWithdrawn: true })).toBe("submitted");
  });

  it.each(APPROVAL_EVENTS.filter((event) => event !== "resubmit"))("옵션이 참이어도 withdrawn × %s는 거부", (event) => {
    expect(() => nextStep("withdrawn", event, { allowResubmitFromWithdrawn: true })).toThrow(InvalidTransitionError);
  });

  it("옵션은 다른 상태의 표를 바꾸지 않는다", () => {
    for (const status of APPROVAL_STATUSES.filter((s) => s !== "withdrawn")) {
      for (const event of APPROVAL_EVENTS) {
        const expected = ALLOWED[status][event];
        if (expected) expect(nextStep(status, event, { allowResubmitFromWithdrawn: true })).toBe(expected);
        else expect(() => nextStep(status, event, { allowResubmitFromWithdrawn: true })).toThrow(InvalidTransitionError);
      }
    }
  });
});
