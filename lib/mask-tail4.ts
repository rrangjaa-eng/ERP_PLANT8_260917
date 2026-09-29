// 04.3-08 ③-e(E3-11) — lib/crypto.ts에서 그대로 옮겼다. 클라이언트 부품
// (app/(app)/admin/vendors/vendor-form.tsx)이 lib/crypto.ts를 import하면 KMS 어댑터
// (google-auth-library)가 클라이언트 번들로 끌려가 빌드가 실패한다.
// 마스킹 표시 순수 함수 — 뒤 4자리가 없으면 빈 문자열(없는 계좌번호에 `****`를
// 그려 있는 것처럼 보이게 하지 않는다).
export function maskTail4(last4: string | null | undefined): string {
  if (!last4) return "";
  return `****-**-${last4}`;
}
