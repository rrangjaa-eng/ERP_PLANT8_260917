import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// 04.2-12 Task 2 — 결과 줄 `되돌리기`의 실패 문구(UI-SPEC S2-f · Copywriting 「되돌리기 실패」).
// 거절(루트 오류)은 원인 앞부분을 싣고 `되돌리기`를 치우고, 연결·서버 실패는 `다시 시도`와
// 함께 `되돌리기`를 남긴다. 액션 모듈은 서버 전용 의존을 끌고 오므로 흉내만 둔다.
// quick 261001-hfi(ADMN-12): 되돌리기는 보관된 같은 행을 복원한다(restoreHolidayAction).
vi.mock("@/app/(app)/admin/holidays/actions", () => ({
  addHolidayAction: vi.fn(),
  deleteHolidayAction: vi.fn(),
  restoreHolidayAction: vi.fn(),
}));

const { undoFailure } = await import("@/app/(app)/admin/holidays/delete-undo");

describe("undoFailure — 되돌리기 결과 → 결과 줄 실패 문구", () => {
  it("성공(data)이면 null", () => {
    expect(undoFailure({ data: { restored: true } })).toBeNull();
  });

  it("오늘이나 지난 날짜 거절 → 원인 앞부분, retry 없음", () => {
    expect(undoFailure({ validationErrors: { _errors: ["오늘·지난 날짜 · 복원 불가"] } })).toEqual({
      text: "되돌리기 실패 · 오늘·지난 날짜",
      retry: false,
    });
  });

  it("이미 공휴일 거절 → 기존 이름을 실은 원인, retry 없음", () => {
    expect(undoFailure({ validationErrors: { _errors: ["이미 공휴일(개천절) · 복원 불가"] } })).toEqual({
      text: "되돌리기 실패 · 이미 공휴일(개천절)",
      retry: false,
    });
  });

  it("이름에 「 · 」가 들어 있어도 원인은 마지막 「 · 」 앞까지 그대로", () => {
    expect(undoFailure({ validationErrors: { _errors: ["이미 공휴일(설 · 연휴) · 복원 불가"] } })).toEqual({
      text: "되돌리기 실패 · 이미 공휴일(설 · 연휴)",
      retry: false,
    });
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

describe("되돌리기 = 같은 행 복원(ADMN-12 · quick 261001-hfi)", () => {
  const source = readFileSync(resolve(process.cwd(), "app/(app)/admin/holidays/delete-undo.tsx"), "utf8");

  it("되돌리기는 restoreHolidayAction을 지운 행 id로 부르고 addHolidayAction을 부르지 않는다", () => {
    expect(source).toContain("restoreHolidayAction({ id: removed.id })");
    expect(source).not.toContain("addHolidayAction");
  });
});

// 04.2 /review 이월 2 — 화면을 연 뒤 지울 수 없게 된 행(규칙 행·오늘 이전)을 지우면 서버가 거절한다.
// 다시 해도 성공할 수 없으니 원인 앞부분을 싣고 `삭제`를 치운다. 연결·서버 실패만 `다시 시도`.
const { deleteFailure } = await import("@/app/(app)/admin/holidays/delete-holiday");

describe("deleteFailure — 삭제 결과 → 행 실패 문구", () => {
  it("성공(data)이면 null", () => {
    expect(deleteFailure({ data: { deleted: false } })).toBeNull();
  });

  it("거절(루트 오류) → 원인 앞부분, retry 없음", () => {
    expect(
      deleteFailure({ validationErrors: { _errors: ["지울 수 없는 공휴일 · 규칙 행이나 오늘 이전 행"] } }),
    ).toEqual({ text: "삭제 실패 · 지울 수 없는 공휴일", retry: false });
  });

  it("서버 오류·던짐 → 다시 시도, retry 있음", () => {
    expect(deleteFailure({ serverError: "알 수 없는 오류" })).toEqual({ text: "삭제 실패 · 다시 시도", retry: true });
    expect(deleteFailure(null)).toEqual({ text: "삭제 실패 · 다시 시도", retry: true });
  });
});

describe("결과 줄은 지운 행을 쌓는다(04.2 /review 이월 1)", () => {
  const source = readFileSync(resolve(process.cwd(), "app/(app)/admin/holidays/delete-undo.tsx"), "utf8");

  it("결과 줄 상태는 한 건이 아니라 목록이다", () => {
    expect(source).toContain("useState<RemovedHoliday[]>");
  });
});
