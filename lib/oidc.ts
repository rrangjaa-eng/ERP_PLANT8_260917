import { OAuth2Client, type Certificates } from "google-auth-library";

export type SchedulerTokenResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "not_configured" | "invalid_token" | "unexpected_caller" };

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

async function defaultGetCerts(): Promise<Certificates> {
  const { certs } = await new OAuth2Client().getFederatedSignonCertsAsync();
  return certs;
}

// Cloud Scheduler OIDC ID 토큰 검증 — 서명(Google 인증서)·audience·issuer·만료·
// 이메일·email_verified. 기대 audience나 이메일이 비면 열리지 않는 쪽으로 실패한다
// (google-auth-library는 audience가 undefined면 audience 검사를 건너뛴다).
export async function verifySchedulerToken(
  authorization: string | null,
  expected: { audience: string | null | undefined; email: string | null | undefined },
  deps?: { getCerts?: () => Promise<Certificates> },
): Promise<SchedulerTokenResult> {
  if (!expected.audience || !expected.email) return { ok: false, reason: "not_configured" };
  if (!authorization?.startsWith("Bearer ")) return { ok: false, reason: "missing_token" };
  const token = authorization.slice("Bearer ".length);

  // 인증서를 못 받는 것은 토큰 문제가 아니다 — 던져서 호출자의 오류 가지(500)로 간다.
  const certs = await (deps?.getCerts ?? defaultGetCerts)();
  let payload;
  try {
    const ticket = await new OAuth2Client().verifySignedJwtWithCertsAsync(
      token,
      certs,
      expected.audience,
      GOOGLE_ISSUERS,
    );
    payload = ticket.getPayload();
  } catch {
    return { ok: false, reason: "invalid_token" };
  }

  if (payload?.email !== expected.email || payload.email_verified !== true) {
    return { ok: false, reason: "unexpected_caller" };
  }
  return { ok: true };
}
