import { describe, expect, it } from "vitest";
import { schedulerConfigFromEnv } from "@/app/internal/notify-tick/handle";

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
