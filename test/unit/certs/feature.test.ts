import { afterEach, describe, expect, it, vi } from "vitest";

// 규약 C1 — 확인증 기능은 두 겹 게이트다: 환경 변수 CERT_FEATURE_ALLOWED가
// 정확히 "true"이고 그리고 설정 cert.enabled(기본 꺼짐)가 켜져 있을 때만
// 켜진다. 환경 게이트가 꺼져 있으면 SETTING_DEFS에 cert.enabled 자체가
// 없어 설정 화면에 줄이 없고 저장 액션이 등록되지 않은 키로 거부한다
// (04.3-02 Task 1 ④).

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isCertFeatureEnabled (규약 C1)", () => {
  it("환경 false + 설정 켬 → false이고 설정을 읽지 않는다", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", "false");
    const { isCertFeatureEnabled } = await import("@/domain/certs/feature");
    const getSettingValue = vi.fn().mockResolvedValue(true);

    const result = await isCertFeatureEnabled({ getSettingValue });

    expect(result).toBe(false);
    expect(getSettingValue).not.toHaveBeenCalled();
  });

  it("환경 true + 설정 끔 → false", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", "true");
    const { isCertFeatureEnabled } = await import("@/domain/certs/feature");
    const getSettingValue = vi.fn().mockResolvedValue(false);

    const result = await isCertFeatureEnabled({ getSettingValue });

    expect(result).toBe(false);
  });

  it("환경 true + 설정 켬 → true", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", "true");
    const { isCertFeatureEnabled } = await import("@/domain/certs/feature");
    const getSettingValue = vi.fn().mockResolvedValue(true);

    const result = await isCertFeatureEnabled({ getSettingValue });

    expect(result).toBe(true);
  });

  it("환경 값이 없으면 false", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", undefined);
    const { isCertFeatureEnabled } = await import("@/domain/certs/feature");
    const getSettingValue = vi.fn().mockResolvedValue(true);

    const result = await isCertFeatureEnabled({ getSettingValue });

    expect(result).toBe(false);
    expect(getSettingValue).not.toHaveBeenCalled();
  });
});

describe("SETTING_DEFS의 cert.enabled 노출 (규약 C1)", () => {
  it("환경 게이트가 꺼진 모듈 로드에서는 SETTING_DEFS에 cert.enabled가 없다", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", "false");
    const { SETTING_DEFS } = await import("@/domain/settings/keys");

    expect(SETTING_DEFS.some((def) => def.key === "cert.enabled")).toBe(false);
  });

  it("환경 게이트가 켜진 모듈 로드에서는 SETTING_DEFS에 cert.enabled가 있다", async () => {
    vi.resetModules();
    vi.stubEnv("CERT_FEATURE_ALLOWED", "true");
    const { SETTING_DEFS } = await import("@/domain/settings/keys");

    expect(SETTING_DEFS.some((def) => def.key === "cert.enabled")).toBe(true);
  });
});
