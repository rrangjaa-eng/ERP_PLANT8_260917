import { describe, expect, it } from "vitest";
import { schedulerConfigFromEnv } from "@/app/internal/notify-tick/handle";
import { verifySchedulerToken } from "@/lib/oidc";
import { createTestSigner, type TestTokenClaims } from "@/test/support/notify-tick";

const SA = "s@x.iam.gserviceaccount.com";

describe("schedulerConfigFromEnv", () => {
  it("비로컬: audience = BETTER_AUTH_URL, 기대 호출자 = NOTIFY_TICK_SCHEDULER_SA, 검증 켜짐", () => {
    expect(
      schedulerConfigFromEnv({
        APP_ENV: "staging",
        BETTER_AUTH_URL: "https://a.example",
        NOTIFY_TICK_SCHEDULER_SA: SA,
        NOTIFY_TICK_OIDC_DISABLED: undefined,
      }),
    ).toEqual({ audience: "https://a.example", schedulerSa: SA, oidcDisabled: false });
  });

  it("빈 BETTER_AUTH_URL은 audience null이다", () => {
    const config = schedulerConfigFromEnv({
      APP_ENV: "local",
      BETTER_AUTH_URL: "",
      NOTIFY_TICK_SCHEDULER_SA: SA,
      NOTIFY_TICK_OIDC_DISABLED: undefined,
    });
    expect(config.audience).toBeNull();
  });

  it("빈 NOTIFY_TICK_SCHEDULER_SA와 없는 값은 schedulerSa null이다", () => {
    const base = { APP_ENV: "prod", BETTER_AUTH_URL: "https://a.example", NOTIFY_TICK_OIDC_DISABLED: undefined } as const;
    expect(schedulerConfigFromEnv({ ...base, NOTIFY_TICK_SCHEDULER_SA: "" }).schedulerSa).toBeNull();
    expect(schedulerConfigFromEnv({ ...base, NOTIFY_TICK_SCHEDULER_SA: undefined }).schedulerSa).toBeNull();
  });

  it("검증 끄기는 APP_ENV=local이고 값이 정확히 \"1\"일 때만 참이다", () => {
    const base = { BETTER_AUTH_URL: "https://a.example", NOTIFY_TICK_SCHEDULER_SA: SA } as const;
    expect(schedulerConfigFromEnv({ ...base, APP_ENV: "local", NOTIFY_TICK_OIDC_DISABLED: "1" }).oidcDisabled).toBe(true);
    expect(schedulerConfigFromEnv({ ...base, APP_ENV: "local", NOTIFY_TICK_OIDC_DISABLED: "true" }).oidcDisabled).toBe(false);
    expect(schedulerConfigFromEnv({ ...base, APP_ENV: "staging", NOTIFY_TICK_OIDC_DISABLED: "1" }).oidcDisabled).toBe(false);
    expect(schedulerConfigFromEnv({ ...base, APP_ENV: "local", NOTIFY_TICK_OIDC_DISABLED: undefined }).oidcDisabled).toBe(false);
  });
});

const AUDIENCE = "https://notify.test.invalid";
const EMAIL = "scheduler@test.invalid";
const EXPECTED = { audience: AUDIENCE, email: EMAIL };

// 인증서는 항상 주입한다 — 검증기가 네트워크 인증서를 부르면 테스트가 드러낸다.
const signer = createTestSigner();
const deps = { getCerts: signer.getCerts };
const noCerts = {
  getCerts: () => Promise.reject(new Error("검증 전에 끝나야 하는 경로가 인증서를 불렀다")),
};

function bearer(claims: TestTokenClaims & { aud: string }): string {
  return `Bearer ${signer.sign(claims)}`;
}

describe("verifySchedulerToken 거부 행렬", () => {
  it("바른 토큰은 통과한다", async () => {
    expect(await verifySchedulerToken(bearer({ aud: AUDIENCE, email: EMAIL }), EXPECTED, deps)).toEqual({ ok: true });
  });

  it.each([
    ["기대 audience null", { audience: null, email: EMAIL }],
    ["기대 이메일 null", { audience: AUDIENCE, email: null }],
    ["기대 audience 빈 문자열", { audience: "", email: EMAIL }],
  ])("%s → not_configured(인증서를 부르지 않는다)", async (_name, expected) => {
    const result = await verifySchedulerToken(bearer({ aud: AUDIENCE, email: EMAIL }), expected, noCerts);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it.each([
    ["Authorization 없음", null],
    ["Basic 방식", "Basic c2NoZWR1bGVyOnB3"],
  ])("%s → missing_token", async (_name, authorization) => {
    expect(await verifySchedulerToken(authorization, EXPECTED, noCerts)).toEqual({ ok: false, reason: "missing_token" });
  });

  it("다른 키로 서명한 토큰 → invalid_token", async () => {
    const other = createTestSigner();
    const authorization = `Bearer ${other.sign({ aud: AUDIENCE, email: EMAIL })}`;
    expect(await verifySchedulerToken(authorization, EXPECTED, deps)).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("끝 슬래시 audience → invalid_token", async () => {
    const result = await verifySchedulerToken(bearer({ aud: `${AUDIENCE}/`, email: EMAIL }), EXPECTED, deps);
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("다른 issuer → invalid_token", async () => {
    const result = await verifySchedulerToken(
      bearer({ aud: AUDIENCE, email: EMAIL, iss: "https://evil.example" }),
      EXPECTED,
      deps,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("만료된 exp(시계 오차 5분 밖) → invalid_token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await verifySchedulerToken(
      bearer({ aud: AUDIENCE, email: EMAIL, iat: now - 7200, exp: now - 3600 }),
      EXPECTED,
      deps,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it.each<[string, TestTokenClaims]>([
    ["다른 서비스 계정 이메일", { email: "other@test.invalid" }],
    ["email_verified false", { email: EMAIL, email_verified: false }],
    ["email_verified 칸 없음", { email: EMAIL, email_verified: undefined }],
    ["email_verified 문자열 \"true\"", { email: EMAIL, email_verified: "true" }],
    ["email 칸 없음", {}],
  ])("%s → unexpected_caller", async (_name, claims) => {
    const result = await verifySchedulerToken(bearer({ aud: AUDIENCE, ...claims }), EXPECTED, deps);
    expect(result).toEqual({ ok: false, reason: "unexpected_caller" });
  });
});
