import { describe, expect, it } from "vitest";
import { resolveLeaveYear } from "@/app/(app)/leave/year-param";

// 04.1-06(D6 · ENG-8 · S9-FY): `?year=` 해석 한 곳 — 정수이고 2000 ≤ year ≤ 올해이면 그대로, 없거나 미래 ·
// 형식 오류 · 범위 밖이면 대체 연도(기본 = 올해). `/leave`와 사람 상세 연차 섹션이 같은 함수를 쓴다.
describe("resolveLeaveYear", () => {
  it.each([
    [undefined, 2026],
    ["", 2026],
    ["2025", 2025],
    ["2000", 2000],
    ["2026", 2026],
    ["2027", 2026],
    ["1999", 2026],
    ["abc", 2026],
    ["2025.5", 2026],
    ["2025abc", 2026],
    [" 2025", 2026],
  ])("raw %j · 올해 2026 → %i", (raw, expected) => {
    expect(resolveLeaveYear(raw, 2026)).toBe(expected);
  });

  it("배열 파라미터(?year=a&year=b)는 형식 오류로 본다", () => {
    expect(resolveLeaveYear(["2024", "2025"], 2026)).toBe(2026);
  });

  it("대체 연도를 주면 없거나 무효일 때 그 연도, 유효하면 요청 연도", () => {
    expect(resolveLeaveYear(undefined, 2026, 2025)).toBe(2025);
    expect(resolveLeaveYear("abc", 2026, 2025)).toBe(2025);
    expect(resolveLeaveYear("2027", 2026, 2025)).toBe(2025);
    expect(resolveLeaveYear("2024", 2026, 2025)).toBe(2024);
  });

  it("위 끝을 올해보다 뒤로 주면(내 다음 해 신청 — 사용자 결정 2026-09-29) 그 연도까지 그대로, 그 뒤는 대체 연도", () => {
    expect(resolveLeaveYear("2027", 2027, 2026)).toBe(2027);
    expect(resolveLeaveYear("2028", 2027, 2026)).toBe(2026);
    expect(resolveLeaveYear(undefined, 2027, 2026)).toBe(2026);
  });
});
