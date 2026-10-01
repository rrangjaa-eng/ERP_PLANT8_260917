// 04.3-14 사용자 결정 U5 a — 개인정보 화면(I4 · 인쇄)에서 끊긴 뒤 다시 들어가는 길. 순수 모듈(next import 없음 —
// 서버 페이지 · 클라이언트 부품 · 로그인 폼 · 단위 테스트가 함께 쓴다).
// 되돌아갈 곳(next=)은 같은 출처의 확인증 화면 두 경로만 받는다 — 허용 목록 정규식 하나라 열린 리디렉션이 없다(T-04.3-311).

export const PRIVACY_LOGIN_REASON = "privacy-session";

const DEFAULT_AFTER_LOGIN = "/account";
const ALLOWED_NEXT = /^\/(certs\/submissions|print\/certs)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function privacyLoginHref(path: string): string {
  return `/login?reason=${PRIVACY_LOGIN_REASON}&next=${encodeURIComponent(path)}`;
}

export function safeLoginNext(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  return ALLOWED_NEXT.test(raw) ? raw : null;
}

// 로그인 성공 이동과 Google 로그인 callbackURL이 같은 값을 쓴다(G0 DR-12).
export function loginDestination(next: string | null): string {
  return next ?? DEFAULT_AFTER_LOGIN;
}
