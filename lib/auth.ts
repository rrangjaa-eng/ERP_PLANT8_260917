import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { getAuthProvider } from "@/domain/auth/provider";

// better-auth 인스턴스. next import 금지(01-05가 CLI 번들에 포함한다) — 이 파일과
// db/*·domain/*·repositories/*는 `next/*`·`server-only`를 import하지 않는다.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: {
    enabled: true,
    // D-11: 공개 가입 경로 없음 — 계정은 CLI(domain/auth/accounts.ts)로만 생성.
    disableSignUp: true,
    // D-09: 8자 이상뿐, 문자 조합 강제 없음.
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일 (D-07)
    updateAge: 60 * 60 * 24, // 1일마다 sliding 갱신
  },
  user: {
    additionalFields: {
      // D-14: Phase 1의 계급은 관리자/직원 둘뿐.
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      // D-08: 임시 비밀번호 사용 중 표시. 본인이 비밀번호를 바꾸면 해제.
      passwordIsTemporary: { type: "boolean", defaultValue: false, input: false },
    },
  },
  advanced: {
    cookiePrefix: "erp",
    ipAddress: {
      // Cloud Run 프록시가 넣는 X-Forwarded-For를 신뢰한다.
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  // AUTH-04: 로그인 방식 환경 변수 전환. 기본 email에서는 undefined — 01-03이
  // 로그인 화면 버튼 슬롯과 구조 불변 테스트를 더한다.
  socialProviders:
    getAuthProvider() === "google"
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : undefined,
});
