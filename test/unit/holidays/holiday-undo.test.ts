import { describe, expect, it, vi } from "vitest";

// 04.2-12 Task 2 — 결과 줄 `되돌리기`의 실패 문구(UI-SPEC S2-f · Copywriting 「되돌리기 실패」).
// 거절(칸 오류)은 원인 앞부분을 싣고 `되돌리기`를 치우고, 연결·서버 실패는 `다시 시도`와
// 함께 `되돌리기`를 남긴다. 액션 모듈은 서버 전용 의존을 끌고 오므로 흉내만 둔다.
vi.mock("@/app/(app)/admin/holidays/actions", () => ({ addHolidayAction: vi.fn(), deleteHolidayAction: vi.fn() }));

const { undoFailure } = await import("@/app/(app)/admin/holidays/delete-undo");

describe("undoFailure — 되돌리기 결과 → 결과 줄 실패 문구", () => {
  it("성공(data)이면 null", () => {
    expect(undoFailure({ data: { date: "2027-10-04", year: 2027 } })).toBeNull();
  });

  it("오늘이나 지난 날짜 칸 오류 → 원인 앞부분, retry 없음", () => {
    expect(
      undoFailure({ validationErrors: { date: { _errors: ["지난 날짜 · 내일 이후 날짜 고르기"] } } }),
    ).toEqual({ text: "되돌리기 실패 · 지난 날짜", retry: false });
  });

  it("이미 공휴일 칸 오류 → 기존 이름을 실은 원인, retry 없음", () => {
    expect(
      undoFailure({ validationErrors: { date: { _errors: ["이미 공휴일(설날) · 다른 날짜 고르기"] } } }),
    ).toEqual({ text: "되돌리기 실패 · 이미 공휴일(설날)", retry: false });
  });

  it("서버 오류 → 다시 시도, retry 있음", () => {
    expect(undoFailure({ serverError: "알 수 없는 오류" })).toEqual({
      text: "되돌리기 실패 · 다시 시도",
      retry: true,
    });
  });

  it("던짐(연결 끊김 — null로 넘김) → 다시 시도, retry 있음", () => {
    expect(undoFailure(null)).toEqual({ text: "되돌리기 실패 · 다시 시도", retry: true });
  });
});
