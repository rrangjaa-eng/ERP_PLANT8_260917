import { describe, expect, it } from "vitest";
import { issueRequestTransition } from "@/domain/issue-requests";

// 06-21(O-12) — 발행 요청 상태 전이는 이 함수 하나가 정한다. DB 없이 돈다.

describe("issueRequestTransition — 상태 전이 표", () => {
  it("신청됨 + 잇기 → 발행됨", () => {
    expect(issueRequestTransition("requested", "link")).toEqual({ allowed: true, to: "issued" });
  });

  it("신청됨 + 취소 → 취소", () => {
    expect(issueRequestTransition("requested", "cancel")).toEqual({ allowed: true, to: "cancelled" });
  });

  it("신청됨 + 수정 → 그대로 신청됨(허용)", () => {
    expect(issueRequestTransition("requested", "edit")).toEqual({ allowed: true, to: "requested" });
  });

  it("발행됨은 잇기 · 취소를 거부한다", () => {
    expect(issueRequestTransition("issued", "link")).toEqual({ allowed: false, reason: "다른 사람이 먼저 이 요청을 이음 · 새로 고침" });
    expect(issueRequestTransition("issued", "cancel")).toEqual({ allowed: false, reason: "이미 발행됨 · 새로 고침" });
  });

  it("발행됨은 수정을 거부한다", () => {
    expect(issueRequestTransition("issued", "edit")).toEqual({ allowed: false, reason: "이미 발행됨 · 새로 고침" });
  });

  it("취소는 무엇이든 거부한다", () => {
    for (const action of ["link", "cancel", "edit"] as const) {
      expect(issueRequestTransition("cancelled", action)).toEqual({ allowed: false, reason: "취소된 요청 · 새로 고침" });
    }
  });
});
