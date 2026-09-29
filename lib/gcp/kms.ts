import { GoogleAuth } from "google-auth-library";
import { log } from "@/lib/log";

// 04.3-08 — Cloud KMS cryptoKeys.decrypt REST 어댑터(데이터 키 봉투 풀기 전용). SDK
// 없이 이미 있는 google-auth-library로 REST를 부른다. 부르는 연산은 COVERAGE.md의
// INTEGRATE 하나(cryptoKeys.decrypt)뿐이다. 돌려주는 것은 KMS 평문 바이트 그대로이고
// 해석(base64 텍스트 → 32바이트 키)은 lib/crypto.ts 한 곳이 한다. 오류 메시지·로그에는
// 상태 코드만 — 키 이름 · 암호문 · 평문은 넣지 않는다(lib/crypto.ts와 같은 원칙).
// IP 해시 계약(04.3-03, BETTER_AUTH_SECRET에서 HKDF 파생)은 이 어댑터를 쓰지 않는다.

export type KmsRequestInit = { url: string; body: { ciphertext: string } };

export type KmsResponse = { status: number; data?: { plaintext?: string } };

export type KmsRequest = (init: KmsRequestInit) => Promise<KmsResponse>;

export class KmsUnavailableError extends Error {
  constructor(cause: number | "network") {
    super(`KMS decrypt 실패: ${cause}`);
  }
}

const TIMEOUT_MS = 10_000;
const API = "https://cloudkms.googleapis.com/v1";

// 기동 때 한 번만 부르므로 클라이언트를 붙들지 않는다.
const defaultRequest: KmsRequest = async ({ url, body }) => {
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloudkms"] }).getClient();
  const res = await client.request<{ plaintext?: string }>({
    method: "POST",
    url,
    data: body,
    responseType: "json",
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
};

export async function decryptWithKms({
  keyName,
  ciphertext,
  request = defaultRequest,
}: {
  keyName: string;
  ciphertext: string;
  request?: KmsRequest;
}): Promise<Buffer> {
  let res: KmsResponse;
  try {
    res = await request({ url: `${API}/${keyName}:decrypt`, body: { ciphertext: ciphertext.trim() } });
  } catch {
    log.warn("kms.decrypt_failed", { status: "network" });
    throw new KmsUnavailableError("network");
  }
  const plaintext = res.data?.plaintext;
  if (res.status < 200 || res.status >= 300 || typeof plaintext !== "string") {
    log.warn("kms.decrypt_failed", { status: res.status });
    throw new KmsUnavailableError(res.status);
  }
  return Buffer.from(plaintext, "base64");
}
