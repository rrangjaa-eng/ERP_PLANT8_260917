import { describe, expect, it, vi } from "vitest";
import { isLocked, windowStart, lockoutConfig, type LockoutConfigDeps } from "@/domain/auth/lockout";

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

  // 03-04: lockoutConfig가 env 기본값을 동기로 돌려주던 것에서 설정
  // 레지스트리를 async로 읽는 것으로 바뀌었다 — 조회를 deps로 스텁해
  // Postgres 없이 두 방향(스텁 값 그대로 나옴 / 스텁이 throw하면 전파됨)을
  // 검증한다.
  it("lockoutConfig: 레지스트리 조회 스텁 값이 그대로 나온다", async () => {
    const getSettingValue: LockoutConfigDeps["getSettingValue"] = vi.fn((def: { key: string }) => {
      if (def.key === "auth.lockout.threshold") return Promise.resolve(7);
      if (def.key === "auth.lockout.window_minutes") return Promise.resolve(20);
      return Promise.reject(new Error(`unexpected key: ${def.key}`));
    }) as never;
    const config = await lockoutConfig({ getSettingValue });
    expect(config).toEqual({ threshold: 7, windowMinutes: 20 });
  });

  it("lockoutConfig: 레지스트리 읽기가 throw하면 그 예외가 전파된다(fail-open 없음)", async () => {
    const getSettingValue: LockoutConfigDeps["getSettingValue"] = vi.fn(() =>
      Promise.reject(new Error("db down")),
    );
    await expect(lockoutConfig({ getSettingValue })).rejects.toThrow("db down");
  });
});
