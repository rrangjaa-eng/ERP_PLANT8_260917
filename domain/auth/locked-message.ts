// 계정 잠금 문구만 담은 잎(leaf) 모듈. 다른 import를 두지 않는다 —
// domain/auth/lockout.ts는 domain/settings/registry → lib/env(process.env 파싱)를
// 끌고 오므로 클라이언트 번들에 들어가면 안 된다. 그 제약 때문에
// app/(auth)/login/login-error.ts가 문구를 import하지 못하고 상태 코드
// 하나(403)로만 판정했고, 그 결과 better-auth가 오리진 불일치 등으로 내는
// 403의 영문 메시지("Invalid origin")까지 사용자에게 그대로 샜다(/review L-3).
// domain/action-log/filter-keys.ts와 같은 결의 분리다.

// 남은 시간은 표시하지 않는다(계정 존재 여부 비노출과 같은 이유로 정보 최소화).
// 분 숫자는 설정 auth.lockout.window_minutes(최대 대기) 하나뿐이다(04.2-03).
const PREFIX = "로그인 시도가 너무 많습니다. ";
const SUFFIX = "분 뒤 다시 시도하거나 관리자에게 문의하세요.";

export function lockedMessage(minutes: number): string {
  return `${PREFIX}${Math.trunc(minutes)}${SUFFIX}`;
}

export function isLockedMessage(text: string): boolean {
  if (!text.startsWith(PREFIX) || !text.endsWith(SUFFIX)) return false;
  return /^\d+$/.test(text.slice(PREFIX.length, text.length - SUFFIX.length));
}
