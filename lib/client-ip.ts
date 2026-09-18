// proxy.ts와 통합 테스트가 공유하는 유일한 클라이언트 IP 규칙.
// Phase 1은 Cloud Run 직결(외부 로드밸런서 없음) 전제 — x-forwarded-for의
// **마지막** 비어 있지 않은 항목이 실제 클라이언트 IP다(Cloud Run이 뒤에 붙인다).
// Phase 2~3에서 로드밸런서를 앞에 두면 "마지막에서 두 번째"로 바뀌므로 이 함수
// 한 곳만 고치면 된다(OPERATIONS.md에 기록).
//
// next import 없음 — proxy.ts·domain/auth/hooks.ts·테스트가 공유한다.

export const CLIENT_IP_HEADER = "x-client-ip";

export function clientIp(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-for");
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  return parts[parts.length - 1]!;
}
