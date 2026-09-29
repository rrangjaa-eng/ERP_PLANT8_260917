import { z } from "zod";

// Phase 1 환경 변수 계약. 값이 "__unset__"이면 undefined로 정규화한다(Secret Manager
// 미설정 센티널). BETTER_AUTH_SECRET·BETTER_AUTH_URL은 스키마상 optional이고,
// APP_ENV !== 'local'이면 refine이 BETTER_AUTH_SECRET 32자 이상·BETTER_AUTH_URL
// 존재를 강제한다. 파싱 실패 메시지는 키 이름만 담고 값은 절대 포함하지 않는다.

function unsetToUndefined(value: unknown): unknown {
  return value === "__unset__" ? undefined : value;
}

function optionalString() {
  return z.preprocess(unsetToUndefined, z.string().optional());
}

function stringWithDefault(defaultValue: string) {
  return z
    .preprocess(unsetToUndefined, z.string().optional())
    .transform((value) => value ?? defaultValue);
}

function coerceNumber(value: unknown): unknown {
  const normalized = unsetToUndefined(value);
  if (normalized === undefined || normalized === "") return undefined;
  if (typeof normalized === "number") return normalized;
  if (typeof normalized === "string") {
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? normalized : parsed;
  }
  return normalized;
}

function numberWithDefault(defaultValue: number) {
  return z
    .preprocess(coerceNumber, z.number().optional())
    .transform((value) => value ?? defaultValue);
}

function optionalNumber() {
  return z.preprocess(coerceNumber, z.number().optional());
}

const rawSchema = z.object({
  NODE_ENV: z
    .preprocess(unsetToUndefined, z.enum(["development", "test", "production"]).optional())
    .transform((value) => value ?? "development"),
  APP_ENV: z
    .preprocess(unsetToUndefined, z.enum(["local", "staging", "prod"]).optional())
    .transform((value) => value ?? "local"),
  DATABASE_URL: optionalString(),
  CLOUD_SQL_CONNECTION_NAME: optionalString(),
  DB_IAM_USER: optionalString(),
  DB_NAME: stringWithDefault("erp"),
  DB_POOL_MAX: numberWithDefault(5),
  DB_ADMIN_PASSWORD: optionalString(),
  DB_ADMIN_URL: optionalString(),
  BETTER_AUTH_SECRET: optionalString(),
  BETTER_AUTH_URL: optionalString(),
  AUTH_PROVIDER: z
    .preprocess(unsetToUndefined, z.enum(["email", "google"]).optional())
    .transform((value) => value ?? "email"),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  LOCKOUT_THRESHOLD: numberWithDefault(5),
  LOCKOUT_WINDOW_MINUTES: numberWithDefault(15),
  RATE_LIMIT_LOGIN_MAX: numberWithDefault(10),
  APP_DATA_KEY_v1: optionalString(),
  // Phase 3(03-06): 키 회전용 두 번째 버전 키. 선택 문자열이라 값이 없어도
  // 앱이 뜬다(Phase 1 계약 그대로) — lib/crypto.ts가 있으면 새 암호화에 이
  // 버전을 쓰고, 없으면 v1만 쓴다. 회전 완료 후에만 v1을 지운다.
  APP_DATA_KEY_v2: optionalString(),
  // 04.3-08 — 스테이징·프로덕션의 데이터 키는 Cloud KMS로 감싼 값(KMS 암호문의 한 줄
  // base64)으로 받고, lib/crypto.ts loadDataKeys()가 기동 때 이 KMS 키로 한 번 푼다.
  APP_DATA_KEY_KMS_KEY: optionalString(),
  APP_DATA_KEY_v1_WRAPPED: optionalString(),
  APP_DATA_KEY_v2_WRAPPED: optionalString(),
  SMTP_HOST: optionalString(),
  SMTP_USER: optionalString(),
  SMTP_PASSWORD: optionalString(),
  SMTP_FROM: optionalString(),
  GCP_PROJECT_ID: optionalString(),
  CLOUD_SQL_INSTANCE_ID: optionalString(),
  APP_GIT_SHA: optionalString(),
  APP_DEPLOYED_AT: optionalString(),
  MAX_INSTANCES: optionalNumber(),
  STATUS_CONN_BANNER_RATIO: numberWithDefault(0.8),
  // 04.3-02(규약 C1) — 확인증 기능의 첫 번째 게이트(환경). __unset__·없음은
  // "false"로 정규화된다. 설정 cert.enabled(두 번째 게이트)와 AND로
  // 묶여야만 기능이 켜진다 — 이 값만으로는 켜지지 않는다.
  CERT_FEATURE_ALLOWED: z
    .preprocess(unsetToUndefined, z.enum(["true", "false"]).optional())
    .transform((value) => value ?? "false"),
  // 04.3-05 — 서명 이미지 GCS 버킷 이름(deploy.sh가 넣는다). 비로컬 refine에
  // 넣지 않는다: 없으면 확인증 기능을 쓰는 순간 서명 저장소가 실패로 닫힌다.
  CERT_SIGNATURE_BUCKET: optionalString(),
  // 04.2-05: /internal/notify-tick의 기대 호출자(Cloud Scheduler 서비스 계정 이메일 —
  // deploy.sh가 넣는다)와 로컬 전용 OIDC 검증 끄기("1"만 인정 — handle.ts).
  NOTIFY_TICK_SCHEDULER_SA: optionalString(),
  NOTIFY_TICK_OIDC_DISABLED: optionalString(),
});

const envSchema = rawSchema.superRefine((data, ctx) => {
  if (data.APP_ENV !== "local") {
    if (!data.BETTER_AUTH_SECRET || data.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET must be at least 32 characters when APP_ENV is not local",
      });
    }
    if (!data.BETTER_AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL is required when APP_ENV is not local",
      });
    }
    if (data.NOTIFY_TICK_OIDC_DISABLED !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["NOTIFY_TICK_OIDC_DISABLED"],
        message: "NOTIFY_TICK_OIDC_DISABLED is only allowed when APP_ENV=local",
      });
    }
  }
  // 03-06 암호화 키는 base64 32바이트(aes-256-gcm)여야 한다. lib/crypto.ts의
  // keyFor()가 쓰기 시점에 같은 검사를 하지만, 그때는 이미 배포가 끝나 사용자가
  // 500을 본 뒤다 — 값이 설정돼 있으면 부팅에서 미리 거른다(배포 스모크에서
  // 바로 실패). Cloud Run Job은 이 키를 받지 않으므로 존재 자체는 강제하지 않는다.
  for (const key of ["APP_DATA_KEY_v1", "APP_DATA_KEY_v2"] as const) {
    const value = data[key];
    if (value !== undefined && Buffer.from(value, "base64").length !== 32) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} must be base64-encoded 32 bytes`,
      });
    }
  }
  // 04.3-08 — 감싼 키는 KMS 키 이름 없이 풀 수 없다. 비로컬에서 같은 버전의 평문
  // 변수가 함께 있으면 평문 시크릿이 아직 서비스에 붙어 있는 배포다 — 부팅에서 막는다.
  for (const version of ["v1", "v2"] as const) {
    const wrappedKey = `APP_DATA_KEY_${version}_WRAPPED` as const;
    if (data[wrappedKey] === undefined) continue;
    if (!data.APP_DATA_KEY_KMS_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_DATA_KEY_KMS_KEY"],
        message: `APP_DATA_KEY_KMS_KEY is required when ${wrappedKey} is set`,
      });
    }
    if (data.APP_ENV !== "local" && data[`APP_DATA_KEY_${version}`] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [`APP_DATA_KEY_${version}`],
        message: `APP_DATA_KEY_${version} must not be set together with ${wrappedKey} when APP_ENV is not local`,
      });
    }
  }
  if (data.AUTH_PROVIDER === "google") {
    if (!data.GOOGLE_CLIENT_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID is required when AUTH_PROVIDER is google",
      });
    }
    if (!data.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "GOOGLE_CLIENT_SECRET is required when AUTH_PROVIDER is google",
      });
    }
  }
});

export type Env = z.infer<typeof rawSchema>;

const ENV_KEYS = [
  "NODE_ENV",
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
  "APP_DATA_KEY_KMS_KEY",
  "APP_DATA_KEY_v1_WRAPPED",
  "APP_DATA_KEY_v2_WRAPPED",
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
  "CERT_FEATURE_ALLOWED",
  "CERT_SIGNATURE_BUCKET",
  "NOTIFY_TICK_SCHEDULER_SA",
  "NOTIFY_TICK_OIDC_DISABLED",
] as const;

function loadEnv(): Env {
  const raw: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    raw[key] = process.env[key];
  }

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // 값은 절대 로그·에러 메시지에 담지 않는다 — 키 이름만.
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  return result.data;
}

export const env: Env = loadEnv();
