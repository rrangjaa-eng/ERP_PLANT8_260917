import { describe, expect, it } from "vitest";
import { issueRequestGroup, issueRequestTransition } from "@/domain/issue-requests";

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

// 06-21(IR-1) — 희망일 그룹: 서울 날짜 문자열, 주 = 월~일. 오늘 2026-10-13(화) — 이번 주 10-12(월) ~ 10-18(일), 다음 주 10-19 ~ 10-25.
describe("issueRequestGroup — 희망일 그룹 경계", () => {
  const today = "2026-10-13";

  it("어제(오늘보다 앞) → 희망일 지남", () => {
    expect(issueRequestGroup("2026-10-12", today)).toBe("희망일 지남");
  });

  it("오늘 · 이번 주 일요일 → 이번 주", () => {
    expect(issueRequestGroup("2026-10-13", today)).toBe("이번 주");
    expect(issueRequestGroup("2026-10-18", today)).toBe("이번 주");
  });

  it("다음 주 월요일 · 일요일 → 다음 주", () => {
    expect(issueRequestGroup("2026-10-19", today)).toBe("다음 주");
    expect(issueRequestGroup("2026-10-25", today)).toBe("다음 주");
  });

  it("다다음 주 월요일부터 → 그 뒤", () => {
    expect(issueRequestGroup("2026-10-26", today)).toBe("그 뒤");
  });

  it("오늘이 일요일이면 다음 날(월)이 다음 주다", () => {
    expect(issueRequestGroup("2026-10-18", "2026-10-18")).toBe("이번 주");
    expect(issueRequestGroup("2026-10-19", "2026-10-18")).toBe("다음 주");
  });
});
