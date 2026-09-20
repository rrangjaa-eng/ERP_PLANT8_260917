import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { getAuthProvider } from "@/domain/auth/provider";
import { before, after } from "@/domain/auth/hooks";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";

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
      // D-14: Phase 1의 계급은 관리자/직원 둘뿐. Phase 3(Task 1 결정 ③)가
      // 계급 5종(roleId)으로 교체하되 이 필드는 드롭하지 않는다(03-RESEARCH.md §3).
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      // Phase 3: 계급 5종 외래키. 등록하지 않으면 better-auth drizzle-adapter가
      // 이 컬럼을 세션에 싣지 않는다. input:false — 클라이언트가 회원가입·
      // 업데이트 입력으로 계급을 지정할 수 없다(T-03-08).
      roleId: { type: "string", required: false, input: false },
      // D-08: 임시 비밀번호 사용 중 표시. 본인이 비밀번호를 바꾸면 해제.
      passwordIsTemporary: { type: "boolean", defaultValue: false, input: false },
    },
  },
  advanced: {
    cookiePrefix: "erp",
    ipAddress: {
      // better-auth 1.7.5는 헤더 값이 쉼표로 2개 이상이면 trustedProxies 없이는
      // IP를 null로 본다 — Cloud Run 뒤에서 원본 포워딩 헤더(XFF)를 직접 읽으면
      // 클라이언트가 값을 하나만 끼워 넣어도 전 직원이 공용 rateLimit 버킷을
      // 나눠 쓰게 된다(Eng Issue 1). proxy.ts가 항상 값 하나짜리 x-client-ip를
      // 만들고, better-auth·잠금 훅은 그 헤더만 읽는다(원본 포워딩 헤더는
      // lib/client-ip.ts 한 곳에서만 읽는다).
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
  },
  hooks: { before, after },
  rateLimit: {
    // better-auth 기본은 production만 활성 — 개발 환경에서도 통합 테스트로
    // 검증하기 위해 명시적으로 켠다.
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: env.RATE_LIMIT_LOGIN_MAX },
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
