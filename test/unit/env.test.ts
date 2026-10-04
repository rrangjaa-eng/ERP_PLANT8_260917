import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// NODE_ENV는 next의 전역 타입이 readonly로 선언하고 있고, 이 테스트가 다루는
// 어떤 동작도 NODE_ENV 값에 의존하지 않는다(vitest가 이미 'test'로 둔다) — 저장
// 대상에서 제외한다.
const ENV_KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "CLOUD_SQL_CONNECTION_NAME",
  "DB_IAM_USER",
  "DB_NAME",
  "DB_POOL_MAX",
  "DB_ADMIN_PASSWORD",
  "DB_ADMIN_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "AUTH_PROVIDER",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LOCKOUT_THRESHOLD",
  "LOCKOUT_WINDOW_MINUTES",
  "RATE_LIMIT_LOGIN_MAX",
  "APP_DATA_KEY_v1",
  "APP_DATA_KEY_v2",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "GCP_PROJECT_ID",
  "CLOUD_SQL_INSTANCE_ID",
  "APP_GIT_SHA",
  "APP_DEPLOYED_AT",
  "MAX_INSTANCES",
  "STATUS_CONN_BANNER_RATIO",
  "NOTIFY_TICK_SCHEDULER_SA",
  "NOTIFY_TICK_OIDC_DISABLED",
  "CERT_SIGNATURE_BUCKET",
  "APP_DATA_KEY_KMS_KEY",
  "APP_DATA_KEY_v1_WRAPPED",
  "APP_DATA_KEY_v2_WRAPPED",
  "STORAGE_DRIVER",
  "GCS_EVIDENCE_BUCKET",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("lib/env", () => {
  it("기본값: DATABASE_URL만으로 파싱 성공한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    const { env } = await import("@/lib/env");

    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(env.BETTER_AUTH_URL).toBeUndefined();
    expect(env.APP_ENV).toBe("local");
    expect(env.AUTH_PROVIDER).toBe("email");
    expect(env.LOCKOUT_THRESHOLD).toBe(5);
    expect(env.LOCKOUT_WINDOW_MINUTES).toBe(15);
    expect(env.DB_POOL_MAX).toBe(5);
    expect(env.STATUS_CONN_BANNER_RATIO).toBe(0.8);
  });

  it("__unset__ 값은 undefined로 정규화된다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.SMTP_HOST = "__unset__";
    const { env } = await import("@/lib/env");

    expect(env.SMTP_HOST).toBeUndefined();
  });

  it("AUTH_PROVIDER=google인데 GOOGLE_CLIENT_ID가 없으면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "google";

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("APP_ENV=staging에 BETTER_AUTH_SECRET이 31자면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(31);
    process.env.BETTER_AUTH_URL = "https://example.com";

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("APP_ENV=staging에 BETTER_AUTH_URL이 없으면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  // 03-VERIFICATION 사람 판정 2: "Secret Manager의 app-data-key-v1이 32바이트인지"는
  // 코드로 판정할 수 없었다(lib/env.ts가 선택 문자열이라 값이 틀려도 앱이 뜨고,
  // 거래처 저장 시점에야 fail-closed 500이 난다). 값이 있으면 부팅 시점에 길이를
  // 검증해 배포 스모크에서 바로 드러나게 한다 — 사람이 gcloud로 볼 필요가 없어진다.
  // Cloud Run Job(migrate·account·seed)은 이 키를 받지 않으므로 존재는 강제하지 않는다.
  it("APP_DATA_KEY_v1이 base64 32바이트가 아니면 throw한다(값이 있을 때만)", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_DATA_KEY_v1 = Buffer.alloc(48, 1).toString("base64");

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_v1/);
  });

  it("APP_DATA_KEY_v2가 base64 32바이트가 아니면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_DATA_KEY_v2 = Buffer.alloc(16, 1).toString("base64");

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_v2/);
  });

  it("APP_DATA_KEY_v1이 base64 32바이트면 파싱 성공한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_DATA_KEY_v1 = Buffer.alloc(32, 1).toString("base64");

    const { env } = await import("@/lib/env");
    expect(env.APP_DATA_KEY_v1).toBeDefined();
  });

  it("에러 메시지는 키 이름만 담고 값은 담지 않는다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.AUTH_PROVIDER = "google";
    process.env.GOOGLE_CLIENT_ID = "super-secret-client-id-value";

    let message = "";
    try {
      await import("@/lib/env");
      throw new Error("import(@/lib/env)가 throw해야 한다");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("super-secret-client-id-value");
  });

  // 04.2-05: tick OIDC 검증 끄기는 로컬에서만 — 로컬 밖이면 부팅이 실패한다
  // (deploy.sh exit 2와 이중 차단).
  it("APP_ENV=staging에 NOTIFY_TICK_OIDC_DISABLED가 있으면 throw한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.NOTIFY_TICK_OIDC_DISABLED = "1";

    await expect(import("@/lib/env")).rejects.toThrow(/NOTIFY_TICK_OIDC_DISABLED/);
  });

  it("APP_ENV=local이면 NOTIFY_TICK_OIDC_DISABLED가 있어도 파싱 성공한다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    process.env.NOTIFY_TICK_OIDC_DISABLED = "1";

    const { env } = await import("@/lib/env");
    expect(env.NOTIFY_TICK_OIDC_DISABLED).toBe("1");
  });

  it("NOTIFY_TICK_SCHEDULER_SA·NOTIFY_TICK_OIDC_DISABLED는 선택값이고 SA 값을 읽는다", async () => {
    process.env.DATABASE_URL = "postgres://erp:erp@127.0.0.1:5432/erp";
    const { env: bare } = await import("@/lib/env");
    expect(bare.NOTIFY_TICK_SCHEDULER_SA).toBeUndefined();
    expect(bare.NOTIFY_TICK_OIDC_DISABLED).toBeUndefined();

    vi.resetModules();
    process.env.APP_ENV = "prod";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.NOTIFY_TICK_SCHEDULER_SA = "s@x.iam.gserviceaccount.com";
    const { env } = await import("@/lib/env");
    expect(env.NOTIFY_TICK_SCHEDULER_SA).toBe("s@x.iam.gserviceaccount.com");
  });

  // 04.3-05: 서명 버킷 이름은 선택 문자열이다 — 없어도 앱이 뜨고(플래그가 꺼진
  // 동안 기동을 막지 않는다), 확인증 기능을 쓰는 순간 드라이버가 실패로 닫힌다.
  it("CERT_SIGNATURE_BUCKET은 선택값이고 로컬 밖에서도 없어도 파싱되며 값을 읽는다", async () => {
    process.env.APP_ENV = "prod";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "https://example.com";
    const { env: bare } = await import("@/lib/env");
    expect(bare.CERT_SIGNATURE_BUCKET).toBeUndefined();

    vi.resetModules();
    process.env.CERT_SIGNATURE_BUCKET = "__unset__";
    const { env: unset } = await import("@/lib/env");
    expect(unset.CERT_SIGNATURE_BUCKET).toBeUndefined();

    vi.resetModules();
    process.env.CERT_SIGNATURE_BUCKET = "p-plant8-prod-cert-signatures";
    const { env } = await import("@/lib/env");
    expect(env.CERT_SIGNATURE_BUCKET).toBe("p-plant8-prod-cert-signatures");
  });

  // 04.3-08 — KMS로 감싼 데이터 키. 감싼 변수는 KMS 키 이름 없이 풀 수 없고, 비로컬에서
  // 같은 버전의 평문 변수가 함께 붙어 있으면 평문 시크릿이 여전히 서비스에 연결된 배포다.
  it("감싼 데이터 키 변수가 있는데 APP_DATA_KEY_KMS_KEY가 없으면 throw하고 메시지가 KMS 키 이름을 가리킨다", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_KMS_KEY/);
  });

  it("감싼 v2만 있어도 APP_DATA_KEY_KMS_KEY가 없으면 throw한다", async () => {
    process.env.APP_DATA_KEY_v2_WRAPPED = "Q2lRQQ==";

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_KMS_KEY/);
  });

  it("감싼 변수와 KMS 키 이름이 함께 있으면 파싱 성공하고 값을 읽는다", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

    const { env } = await import("@/lib/env");
    expect(env.APP_DATA_KEY_v1_WRAPPED).toBe("Q2lRQQ==");
    expect(env.APP_DATA_KEY_KMS_KEY).toBe("projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k");
  });

  it("비로컬에서 같은 버전의 평문 변수와 감싼 변수가 함께 있으면 throw한다", async () => {
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.APP_DATA_KEY_v1 = Buffer.alloc(32, 1).toString("base64");
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_v1/);
  });

  it("로컬에서는 평문 변수와 감싼 변수가 함께 있어도 파싱 성공한다", async () => {
    process.env.APP_DATA_KEY_v1 = Buffer.alloc(32, 1).toString("base64");
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

    const { env } = await import("@/lib/env");
    expect(env.APP_DATA_KEY_v1_WRAPPED).toBe("Q2lRQQ==");
  });

  // 04.3-08 검토 반영 L3 — KMS 키 이름은 cryptoKeys 경로 모양이어야 한다(버전 경로 · 잘린 경로 거부).
  it.each([
    "projects/p/locations/asia-northeast3/keyRings/r",
    "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1",
    "plant8-staging/app-data-key",
  ])("APP_DATA_KEY_KMS_KEY가 cryptoKeys 경로 모양이 아니면(%s) throw한다", async (keyName) => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = keyName;

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_KMS_KEY/);
  });

  // 04.3-08 검토 반영 L4 — 비로컬에서 감싼 키가 하나라도 있으면 평문 데이터 키 변수는 어떤 버전도 없어야 한다.
  it("비로컬에서 감싼 v1이 있으면 다른 버전의 평문 변수(APP_DATA_KEY_v2)도 throw한다", async () => {
    process.env.APP_ENV = "staging";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.APP_DATA_KEY_v2 = Buffer.alloc(32, 2).toString("base64");
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

    await expect(import("@/lib/env")).rejects.toThrow(/APP_DATA_KEY_v2/);
  });

  it("로컬에서는 감싼 v1과 평문 v2가 함께 있어도 파싱 성공한다", async () => {
    process.env.APP_DATA_KEY_v2 = Buffer.alloc(32, 2).toString("base64");
    process.env.APP_DATA_KEY_v1_WRAPPED = "Q2lRQQ==";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

    const { env } = await import("@/lib/env");
    expect(env.APP_DATA_KEY_v2).toBe(Buffer.alloc(32, 2).toString("base64"));
  });

  // 05-04(EVID-01 · Pitfall 8) — 인증 없는 로컬 저장소 창구는 로컬에서만. 값이 없으면 APP_ENV로 고른다.
  describe("STORAGE_DRIVER(05-04)", () => {
    function nonLocal(appEnv: "staging" | "prod") {
      process.env.APP_ENV = appEnv;
      process.env.BETTER_AUTH_SECRET = "a".repeat(32);
      process.env.BETTER_AUTH_URL = "https://example.com";
    }

    it("APP_ENV=staging에 STORAGE_DRIVER=local이면 STORAGE_DRIVER 경로로 throw한다", async () => {
      nonLocal("staging");
      process.env.STORAGE_DRIVER = "local";

      await expect(import("@/lib/env")).rejects.toThrow(/STORAGE_DRIVER/);
    });

    it("APP_ENV=local에 값이 없으면 해석된 드라이버는 local이다", async () => {
      const { env, resolvedStorageDriver } = await import("@/lib/env");
      expect(env.STORAGE_DRIVER).toBeUndefined();
      expect(resolvedStorageDriver(env)).toBe("local");
    });

    it("APP_ENV=staging에 값이 없으면 해석된 드라이버는 gcs다", async () => {
      nonLocal("staging");

      const { env, resolvedStorageDriver } = await import("@/lib/env");
      expect(resolvedStorageDriver(env)).toBe("gcs");
    });

    it("APP_ENV=prod에 STORAGE_DRIVER=gcs이고 GCS_EVIDENCE_BUCKET이 없어도 부팅은 통과한다(버킷은 드라이버 생성 때 검사)", async () => {
      nonLocal("prod");
      process.env.STORAGE_DRIVER = "gcs";

      const { env, resolvedStorageDriver } = await import("@/lib/env");
      expect(resolvedStorageDriver(env)).toBe("gcs");
      expect(env.GCS_EVIDENCE_BUCKET).toBeUndefined();
    });

    it("로컬에서 STORAGE_DRIVER=gcs를 명시하면 그 값을 따른다 · 버킷 이름을 읽는다", async () => {
      process.env.STORAGE_DRIVER = "gcs";
      process.env.GCS_EVIDENCE_BUCKET = "plant8-evidence";

      const { env, resolvedStorageDriver } = await import("@/lib/env");
      expect(resolvedStorageDriver(env)).toBe("gcs");
      expect(env.GCS_EVIDENCE_BUCKET).toBe("plant8-evidence");
    });
  });
});
