import { describe, expect, it } from "vitest";
import type { LeaveFieldError } from "@/domain/leave/days";
import { formBlocked, sameLeaveInput, shownSubmitErrors } from "@/app/(app)/leave/new/form-state";

// 06.3-01(확정 K-D1 · 리뷰 F1 · A2): 신청 폼 막힘 = 폼 빈 칸 먼저, 없으면 미리보기 응답 `blockedReason`.
// 대기 중에는 next-safe-action 8.7.3 `useAction`이 새 응답 전까지 이전 `result`를 두므로 이전 막힘이 남고,
// 미리보기가 실패하면 서버 쪽 막힘이 없다(제출 검사가 최종 판단).

const HOLIDAY: LeaveFieldError = { field: "startDate", message: "휴일 · 다른 날 고르기" };
const OVERLAP: LeaveFieldError = { field: "startDate", message: "9월 22일 종일 신청과 겹침 · 날짜 바꾸기" };
const EMPTY: LeaveFieldError = { field: "startDate", message: "시작일 비어 있음 · 시작일 적기" };

describe("formBlocked", () => {
  it("첫 응답 전(undefined)은 막힘 없음", () => {
    expect(formBlocked(null, undefined)).toBeNull();
  });

  it("A2 대기: 날짜를 바꿔 새 미리보기가 나갔지만 이전 응답을 쥔 채면 이전 휴일 줄이 유지된다", () => {
    const previous = { blockedReason: HOLIDAY };
    expect(formBlocked(null, previous)).toBe(HOLIDAY);
  });

  it("A2 실패: 미리보기가 던져 data가 없거나(undefined) null이면 막힘 없음 — 서버 제출 검사가 최종", () => {
    expect(formBlocked(null, undefined)).toBeNull();
    expect(formBlocked(null, null)).toBeNull();
  });

  it("blockedReason이 null이면 막힘 없음", () => {
    expect(formBlocked(null, { blockedReason: null })).toBeNull();
  });

  it("폼 빈 칸 막힘이 있으면 서버 줄보다 먼저다", () => {
    expect(formBlocked(EMPTY, { blockedReason: HOLIDAY })).toBe(EMPTY);
  });
});

// 06.3-02(리뷰 A1 · eng R2-W2): 제출이 거절된 뒤 입력이 마지막 제출값과 달라지면 낡은 칸 · 비고 오류를 숨긴다 —
// 입력과 무관한 서버 오류는 그대로.
const SENT = { kind: "half_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "am", note: "" };

describe("sameLeaveInput", () => {
  it("같은 다섯 칸 → true", () => {
    expect(sameLeaveInput(SENT, { ...SENT })).toBe(true);
  });

  it("시작일만 다름 → false", () => {
    expect(sameLeaveInput(SENT, { ...SENT, startDate: "2026-09-23", endDate: "2026-09-22" })).toBe(false);
  });

  it("시간만 다름 → false", () => {
    expect(sameLeaveInput(SENT, { ...SENT, half: "pm" })).toBe(false);
  });

  it("비고 undefined vs 빈 문자열 → true", () => {
    expect(sameLeaveInput({ ...SENT, note: undefined }, SENT)).toBe(true);
  });
});

describe("shownSubmitErrors", () => {
  const errors = {
    fieldErrors: [OVERLAP],
    noteError: "x",
    serverError: "대표 없음 · 관리자에게 대표 계급 확인 요청",
  };

  it("stale이면 칸 · 비고 오류는 숨기고 서버 오류는 그대로 보인다", () => {
    expect(shownSubmitErrors(true, errors)).toEqual({
      fieldErrors: [],
      noteError: undefined,
      serverError: "대표 없음 · 관리자에게 대표 계급 확인 요청",
    });
  });

  it("stale이 아니면(같은 입력) 그대로", () => {
    expect(shownSubmitErrors(false, errors)).toEqual(errors);
  });

  it("06.3-02 /design-review: 제출값으로 되돌려 미리보기 막힘 줄이 같은 칸 · 같은 문구면 칸 오류는 숨긴다(두 번 말하지 않음)", () => {
    expect(shownSubmitErrors(false, errors, OVERLAP)).toEqual({ ...errors, fieldErrors: [] });
  });

  it("막힘 줄이 다른 문구면 칸 오류는 그대로", () => {
    expect(shownSubmitErrors(false, errors, HOLIDAY)).toEqual(errors);
  });
});
