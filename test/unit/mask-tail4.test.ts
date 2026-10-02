import { describe, expect, it } from "vitest";
import { maskTail4 } from "@/lib/mask-tail4";

// 04.3-08 Task 1 ③-e(E3-11) — maskTail4는 클라이언트 부품(vendor-form.tsx)이 쓰는 순수
// 함수라 lib/crypto.ts(KMS 어댑터를 동적으로 부른다)에서 떼어 냈다. 동작은 그대로다.
describe("lib/mask-tail4의 maskTail4", () => {
  it("뒤 4자리가 있으면 마스킹 문자열을 만든다", () => {
    expect(maskTail4("1234")).toBe("****-**-1234");
  });

  it("뒤 4자리가 비어 있으면 빈 문자열을 돌려준다", () => {
    expect(maskTail4("")).toBe("");
    expect(maskTail4(null)).toBe("");
    expect(maskTail4(undefined)).toBe("");
  });
});
