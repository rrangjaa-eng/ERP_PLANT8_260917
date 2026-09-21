import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { AUTH_LOCKOUT_THRESHOLD, AUTH_LOCKOUT_WINDOW_MINUTES } from "@/domain/settings/keys";

// AUTH-01·Eng Issue 5: 계정 잠금 판정의 순수 함수. DB 접근은
// repositories/login-attempts.ts가, 실제 훅 배선은 domain/auth/hooks.ts가
// 담당한다.
//
// 03-04: lockoutConfig는 env 대신 설정 레지스트리를 읽는다(async·deps
// 주입형, domain/system-status의 StatusDeps 패턴). 레지스트리 읽기가
// throw하면 그 예외를 그대로 전파한다 — 잠금 판정을 건너뛰고 로그인을
// 허용하는 fail-open 경로를 만들지 않는다(DB가 죽었으면 로그인도 어차피
// 실패한다).
export type LockoutConfigDeps = {
  getSettingValue: typeof defaultGetSettingValue;
};

export async function lockoutConfig(
  deps?: Partial<LockoutConfigDeps>,
): Promise<{ threshold: number; windowMinutes: number }> {
  const getSettingValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const [threshold, windowMinutes] = await Promise.all([
    getSettingValue(AUTH_LOCKOUT_THRESHOLD),
    getSettingValue(AUTH_LOCKOUT_WINDOW_MINUTES),
  ]);
  return { threshold, windowMinutes };
}

export function windowStart(now: Date, windowMinutes: number): Date {
  return new Date(now.getTime() - windowMinutes * 60_000);
}

export function isLocked(openFailures: number, threshold: number): boolean {
  return openFailures >= threshold;
}

// 문구 자체는 잎 모듈에 있다 — 로그인 화면(클라이언트)이 이 파일을 import하면
// lib/env가 클라이언트 번들에 들어간다. 기존 import 경로가 깨지지 않게 re-export한다.
export { LOCKED_MESSAGE } from "@/domain/auth/locked-message";
