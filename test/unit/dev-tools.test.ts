import { describe, expect, it } from "vitest";
import { isDevToolsEnabled } from "@/lib/dev-tools";

// 개발·스테이징 전용 화면(/dev/components)의 서버 게이트 판정 — prod만 닫는다(T-04.6-04).
describe("isDevToolsEnabled", () => {
  it("운영(prod)에서는 꺼진다", () => {
    expect(isDevToolsEnabled("prod")).toBe(false);
  });

  it("staging · local · 값 없음에서는 켜진다", () => {
    expect(isDevToolsEnabled("staging")).toBe(true);
    expect(isDevToolsEnabled("local")).toBe(true);
    expect(isDevToolsEnabled(undefined)).toBe(true);
  });
});
