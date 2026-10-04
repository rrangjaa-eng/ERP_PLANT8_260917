// 04.3-14 사용자 결정 U5 a — 개인정보 화면(I4 · 인쇄)에서 끊긴 뒤 다시 들어가는 길. 순수 모듈(next import 없음 —
// 서버 페이지 · 클라이언트 부품 · 로그인 폼 · 단위 테스트가 함께 쓴다).
// 되돌아갈 곳(next=)은 같은 출처의 확인증 화면 두 경로만 받는다 — 허용 목록 정규식 하나라 열린 리디렉션이 없다(T-04.3-311).
// 인쇄 경로는 그 확인증의 I4로 바꿔 돌려준다 — 다시 로그인하자마자 인쇄 창이 뜨지 않게(사용자 결정 5936870579 · Y3). id는
// 소문자로 맞춘다(대문자 id로 연 주소도 같은 확인증으로 — 검토 Y5 ②).

export const PRIVACY_LOGIN_REASON = "privacy-session";

const DEFAULT_AFTER_LOGIN = "/account";
const ALLOWED_NEXT = /^\/(?:certs\/submissions|print\/certs)\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export function privacyLoginHref(path: string): string {
  return `/login?reason=${PRIVACY_LOGIN_REASON}&next=${encodeURIComponent(path)}`;
}

export function safeLoginNext(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const id = ALLOWED_NEXT.exec(raw)?.[1];
  return id ? `/certs/submissions/${id.toLowerCase()}` : null;
}

// 로그인 성공 이동과 Google 로그인 callbackURL이 같은 값을 쓴다(G0 DR-12).
export function loginDestination(next: string | null): string {
  return next ?? DEFAULT_AFTER_LOGIN;
}
