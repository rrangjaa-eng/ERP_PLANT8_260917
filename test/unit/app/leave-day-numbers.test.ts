import { describe, expect, it } from "vitest";
import { splitDayNumbers } from "@/app/(app)/leave/day-numbers";

// 04.1-06 DOM 감사 #4(UI-SPEC Typography 「700은 제목과 잔고·일수 숫자에만」 · SYSTEM §7-15 Form.Hint 「숫자만 700」):
// 잔고·일수 글자에서 `일` 앞 숫자 토막만 굵게 그린다 — 날짜(`2026-12-31 소멸`)의 숫자는 굵게 하지 않는다.
describe("splitDayNumbers", () => {
  it("일 앞 숫자(음수·소수 포함)만 숫자 토막이다", () => {
    expect(splitDayNumbers("연차 15일 · 조정 -1일 · 남음 10.5일")).toEqual([
      { text: "연차 ", num: false },
      { text: "15", num: true },
      { text: "일 · 조정 ", num: false },
      { text: "-1", num: true },
      { text: "일 · 남음 ", num: false },
      { text: "10.5", num: true },
      { text: "일", num: false },
    ]);
  });

  it("날짜 숫자는 숫자 토막이 아니다", () => {
    expect(splitDayNumbers("남음 0일 · 2026-12-31 소멸")).toEqual([
      { text: "남음 ", num: false },
      { text: "0", num: true },
      { text: "일 · 2026-12-31 소멸", num: false },
    ]);
  });

  it("숫자가 없으면 한 토막이다", () => {
    expect(splitDayNumbers("재택 · 차감 없음")).toEqual([{ text: "재택 · 차감 없음", num: false }]);
  });
});
