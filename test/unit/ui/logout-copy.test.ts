import { describe, expect, it } from "vitest";
import { LOGOUT_FAILED } from "@/ui/logout/use-logout";

// /review(design · maintainability) — SYSTEM.md §8 규칙 3: 원인 · 다음 행동은 가운뎃점으로 나눈다.
describe("로그아웃 실패 문구", () => {
  it("「로그아웃 실패 · 다시 시도」", () => {
    expect(LOGOUT_FAILED).toBe("로그아웃 실패 · 다시 시도");
  });
});
