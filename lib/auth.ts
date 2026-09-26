import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { getAuthProvider } from "@/domain/auth/provider";
import { before, after, recordFirstLogin } from "@/domain/auth/hooks";
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
      // Phase 3(03-02): 계급 5종 외래키가 유일한 계급 판정 입력이다. 관리자
      // 여부 불리언의 additionalField 등록은 D-36 이관으로 제거했다 — 그
      // 잔여 컬럼(D-37) 자체는 드롭하지 않고 남지만, better-auth 세션에는
      // 더 이상 싣지 않는다. 등록하지 않으면 better-auth drizzle-adapter가
      // 이 컬럼을 세션에 싣지 않는다. input:false — 클라이언트가 회원가입·
      // 업데이트 입력으로 계급을 지정할 수 없다(T-03-08).
      roleId: { type: "string", required: false, input: false },
      // D-08: 임시 비밀번호 사용 중 표시. 본인이 비밀번호를 바꾸면 해제.
      passwordIsTemporary: { type: "boolean", defaultValue: false, input: false },
      // /review M-2: 보관(= 사용자에게 「삭제」)된 사람의 기존 세션을
      // getSession이 거부하려면 이 값이 세션 사용자에 실려야 한다. 등록하지
      // 않으면 drizzle-adapter가 컬럼을 싣지 않는다. cookieCache를 쓰지 않으므로
      // better-auth가 요청마다 사용자 행을 다시 읽어 값이 최신이다.
      // input:false — 클라이언트가 자기 보관 상태를 바꿀 수 없다.
      archivedAt: { type: "date", required: false, input: false },
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
  // D8-07 — 로그인 방식·로그인 로그 설정과 무관하게 모든 세션 생성에서 한 번. first_login_at의 유일한 기록 지점.
  databaseHooks: { session: { create: { after: recordFirstLogin } } },
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
