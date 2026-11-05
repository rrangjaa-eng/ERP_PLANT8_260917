import { describe, expect, it } from "vitest";
import { koreanAmountText } from "@/lib/korean-amount";

// 07.4-01 D-7412 — 종이 합계 행의 한글 금액. 비정상 값은 던지지 않고 null(그 줄만 없다 — eng 검토 P3).
describe("koreanAmountText", () => {
  it.each([
    [0, "금 영 원정"],
    [10, "금 일십 원정"],
    [13_640_000, "금 일천삼백육십사만 원정"],
    [10_000, "금 일만 원정"],
    [100_000_000, "금 일억 원정"],
    [120_000_005, "금 일억이천만오 원정"],
    [1_000_000_000_000, "금 일조 원정"],
    [100_010_000, "금 일억일만 원정"],
    [Number.MAX_SAFE_INTEGER, "금 구천칠조일천구백구십이억오천사백칠십사만구백구십일 원정"],
  ])("%i → %s", (krw, text) => {
    expect(koreanAmountText(krw)).toBe(text);
  });

  it("만 단위 묶음이 0이면 그 단위 글자가 없다", () => {
    expect(koreanAmountText(100_000_005)).toBe("금 일억오 원정");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("%s → null", (krw) => {
    expect(koreanAmountText(krw)).toBeNull();
  });
});
