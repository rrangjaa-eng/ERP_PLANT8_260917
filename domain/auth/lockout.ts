import { env } from "@/lib/env";

// AUTH-01·Eng Issue 5: 계정 잠금 판정의 순수 함수. DB 접근은 repositories/login-attempts.ts가,
// 실제 훅 배선은 domain/auth/hooks.ts가 담당한다.

export function lockoutConfig(): { threshold: number; windowMinutes: number } {
  return { threshold: env.LOCKOUT_THRESHOLD, windowMinutes: env.LOCKOUT_WINDOW_MINUTES };
}

export function windowStart(now: Date, windowMinutes: number): Date {
  return new Date(now.getTime() - windowMinutes * 60_000);
}

export function isLocked(openFailures: number, threshold: number): boolean {
  return openFailures >= threshold;
}

// 남은 시간은 표시하지 않는다(계정 존재 여부 비노출과 같은 이유로 정보 최소화).
export const LOCKED_MESSAGE =
  "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하거나 관리자에게 문의하세요.";
