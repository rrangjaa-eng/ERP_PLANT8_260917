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
