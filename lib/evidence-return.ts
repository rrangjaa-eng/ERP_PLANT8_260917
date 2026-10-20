// 06.1-16(G-06.1-40) — S8 대리 등록이 닫히면 돌아갈 출발 증빙 목록 주소. 서버 페이지와 클라이언트 표가 함께 쓰는 순수 모듈(next import 없음).
// 같은 앱 `/expenses/evidence` 경로만 받는 허용 목록 하나라 열린 리디렉션이 없다(T-06.1-16-01 · lib/login-next.ts 선례).
// 쿼리는 주소창 글자 그대로(순서 · 인코딩 보존) `registered`만 걷는다 — SidePanel이 직전 기록 주소와 글자까지 같을 때 뒤로 가기로 닫는다.

export const EVIDENCE_RETURN_FALLBACK = "/expenses/evidence?state=unmatched";

const EVIDENCE_PATH = "/expenses/evidence";
const ALLOWED_START = /^\/expenses\/evidence(?=$|[?#])/;
const BASE = "https://plant8.invalid";

export function evidenceReturnHref(raw: string | undefined): string {
  if (!raw || !ALLOWED_START.test(raw)) return EVIDENCE_RETURN_FALLBACK;
  const url = new URL(raw, BASE);
  if (url.origin !== BASE || url.pathname !== EVIDENCE_PATH) return EVIDENCE_RETURN_FALLBACK;
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((pair) => new URLSearchParams(pair).keys().next().value !== "registered");
  const query = kept.join("&");
  return query ? `${EVIDENCE_PATH}?${query}` : EVIDENCE_PATH;
}
