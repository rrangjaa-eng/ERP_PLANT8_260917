// 개발·스테이징 전용 화면(/dev/components) 게이트 — 운영(prod)에서만 닫는다. 서버에서 판정한다(클라이언트 숨김 아님).
export function isDevToolsEnabled(appEnv: "local" | "staging" | "prod" | undefined): boolean {
  return appEnv !== "prod";
}
