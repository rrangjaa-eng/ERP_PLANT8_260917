import { describe, expect, it } from "vitest";
import { nextStep, InvalidTransitionError } from "@/domain/approvals/route";

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
