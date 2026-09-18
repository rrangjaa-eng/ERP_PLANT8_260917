import { describe, expect, it } from "vitest";
import { isLocked, windowStart, lockoutConfig } from "@/domain/auth/lockout";

describe("domain/auth/lockout", () => {
  it("isLocked: threshold 미만은 false", () => {
    expect(isLocked(4, 5)).toBe(false);
  });

  it("isLocked: threshold와 같으면 true", () => {
    expect(isLocked(5, 5)).toBe(true);
  });

  it("isLocked: threshold 초과도 true", () => {
    expect(isLocked(6, 5)).toBe(true);
  });

  it("windowStart: 15분 전 시각을 반환한다", () => {
    const now = new Date("2026-09-18T10:00:00Z");
    expect(windowStart(now, 15).toISOString()).toBe("2026-09-18T09:45:00.000Z");
  });

  it("lockoutConfig: env 기본값(threshold=5, windowMinutes=15)을 반환한다", () => {
    const config = lockoutConfig();
    expect(config.threshold).toBe(5);
    expect(config.windowMinutes).toBe(15);
  });
});
