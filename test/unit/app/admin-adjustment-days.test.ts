import { describe, expect, it } from "vitest";
import { parseAdjustmentDays } from "@/app/(app)/admin/people/[id]/adjustment-days";

// 04.1-06 코드 검토 L4: 조정 일수 칸은 십진수 글자만 숫자로 읽는다 — `0x10`(16) · `1e3`(1000)이 0.25 단위 검사를 통과하거나
// 큰 수가 integer 칸을 넘쳐 DB 오류가 나지 않게. 형식 밖은 NaN → 도메인이 `일수는 0.25 단위 · 0.5처럼`으로 거부한다.
describe("parseAdjustmentDays", () => {
  it.each([
    ["1", 1],
    ["-1", -1],
    ["0.5", 0.5],
    [" 2.25 ", 2.25],
    ["999", 999],
  ])("%j → %d", (raw, expected) => {
    expect(parseAdjustmentDays(raw)).toBe(expected);
  });

  it.each(["0x10", "1e3", "600000000", "1.", ".5", "", "abc", "1,000", "+1"])("%j → NaN", (raw) => {
    expect(parseAdjustmentDays(raw)).toBeNaN();
  });
});
