// SYSTEM.md §6-7 A②·A③ — 로그인 실패 문구의 단일 출처.
//
// A②: 이메일·비밀번호 오류를 구분하지 않는 한국어 한 문장. better-auth가 주는
// 영문 메시지("Invalid email or password")를 그대로 보이면 §6-7과 §8(카피 규칙)을
// 둘 다 벗어나므로 접는다.
// A③: 계정 잠금만 같은 자리에 문구가 다르다. domain/auth/hooks.ts가
// APIError("FORBIDDEN", { message: LOCKED_MESSAGE })로 403을 던지고, 그 문구는
// 이미 한국어다(domain/auth/lockout.ts). 이것까지 접으면 잠긴 사용자가 잠긴 줄
// 모르고 비밀번호만 계속 고쳐 보게 된다.
//
// 판정 기준이 상태 코드 하나였을 때는 better-auth가 오리진 불일치·CSRF 등으로
// 내는 403의 영문 메시지도 그대로 새어 나갔다(/review L-3) — 사용자는
// 「Invalid origin」을 보고 아무것도 할 수 없고 서버 구성만 노출된다.
// 이제 문구를 정확히 대조한다. LOCKED_MESSAGE는 import 없는 잎 모듈에 있어
// lib/env를 클라이언트 번들로 끌고 오지 않는다(domain/auth/locked-message.ts).
import { LOCKED_MESSAGE } from "@/domain/auth/locked-message";

export const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

export function loginErrorMessage(
  error: { status?: number; message?: string } | null | undefined,
): string {
  if (error?.status === 403 && error.message === LOCKED_MESSAGE) return error.message;
  return GENERIC_ERROR;
}
