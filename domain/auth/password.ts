import { auth } from "@/lib/auth";
import { log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";
import { setPasswordTemporary } from "@/repositories/users";

// D-09: 8자 이상 + 흔한 비밀번호 목록 차단뿐. 문자 조합 강제 없음.
// 목록은 외부 파일·의존성 없이 이 파일 안 상수(소문자 비교) — 일반적인 흔한
// 비밀번호 상위 항목 + 회사 이름 변형(plant8류).
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "00000000",
  "iloveyou1",
  "letmein11",
  "welcome1",
  "admin1234",
  "password1",
  "password12",
  "abc123456",
  "1q2w3e4r5t",
  "monkey123",
  "dragon123",
  "football1",
  "baseball1",
  "sunshine1",
  "princess1",
  "trustno1x",
  "superman1",
  "master1234",
  "1234567890a",
  "qazwsx123",
  "starwars1",
  "computer1",
  "michael12",
  "jennifer1",
  "jordan123",
  "hunter1234",
  "freedom123",
  "whatever1",
  "shadow1234",
  "michelle1",
  "charlie12",
  "andrew1234",
  "matthew12",
  "hello1234",
  "121212121",
  "flower123",
  "buster123",
  "soccer123",
  "cheese123",
  "asdfghjkl",
  "aaaaaaaa",
  "abcd1234",
  "1qaz2wsx",
  "qwerasdf",
  "1a2b3c4d5e",
  "changeme1",
  "letmein12",
  "welcome123",
  "passw0rd1",
  "password!",
  "temppass1",
  "temp123456",
  "guest1234",
  "plant8",
  "plant8123",
  "plant81234",
  "plant8!",
  "plant8!@#",
  "plant82026",
]);

export class WeakPasswordError extends Error {}

export function validateNewPassword(pw: string): void {
  if (pw.length < 8) {
    throw new WeakPasswordError("비밀번호는 8자 이상이어야 합니다.");
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    throw new WeakPasswordError("너무 흔한 비밀번호입니다. 다른 비밀번호를 쓰세요.");
  }
}

// D-10: 본인(viewer.id===userId) 또는 관리자만 세션을 전부 만료할 수 있다.
// better-auth 1.7.5의 실제 메서드 이름은 internalAdapter.deleteUserSessions(userId)다
// (userId 하나로 그 사용자의 세션을 전부 지운다 — deleteSessions는 세션 토큰
// 배열을 받는 다른 메서드다. node_modules/better-auth/dist/db/internal-adapter.mjs
// 실제 구현 확인 후 정정, 01-02의 domain/auth/accounts.ts resetPassword가 이미 같은
// 메서드를 쓰고 있다).
export async function revokeAllSessions(viewer: Viewer, userId: string): Promise<void> {
  if (viewer.id !== userId && !viewer.isAdmin) {
    throw new Error("세션을 만료할 권한이 없습니다.");
  }
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

// AUTH-03·D-10: 본인 비밀번호 변경의 마무리 — 전 세션 만료(현재 기기 포함) →
// 임시 비밀번호 플래그 해제 → 로그. app 액션은 이 함수만 부른다(repositories를
// 직접 import하지 않는다 — Issue 1).
export async function finalizePasswordChange(viewer: Viewer, userId: string): Promise<void> {
  await revokeAllSessions(viewer, userId);
  await setPasswordTemporary(viewer, userId, false);
  log.info("auth.password_changed", { userId });
}
