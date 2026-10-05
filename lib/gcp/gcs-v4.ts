import { createHash } from "node:crypto";

// 05-12(EVID-01): GCS V4 서명 주소 조립 — 순수 함수. 서명 자체는 주입한다(운영 = GoogleAuth.sign → IAM signBlob,
// 테스트 = 실행 중 만든 RSA 키). 키 파일 · 새 패키지 없음. 날짜는 서명 규격의 UTC다(서울 날짜 규칙의 대상 아님).
// 알고리즘 세부는 [ASSUMED] — 실제 GCS 수락은 scripts/gcs-sign-smoke.ts(사람 확인)와 05-13 staging 확인이 증명한다.

const HOST = "storage.googleapis.com";
const MAX_EXPIRES_SEC = 604_800;

export type V4SignInput = {
  method: "PUT" | "GET";
  bucket: string;
  objectKey: string;
  // host 밖의 서명 헤더 — 요청이 같은 값을 보내야 한다. 돌려주는 headers가 이것이다.
  headers: Record<string, string>;
  // X-Goog-* 밖의 서명 쿼리(예: response-content-disposition).
  query: Record<string, string>;
  credentialEmail: string;
  now: Date;
  expiresSec: number;
  // string-to-sign → base64 서명(RSA-SHA256).
  sign: (stringToSign: string) => Promise<string>;
};

// RFC 3986 unreserved 밖은 전부 이스케이프 — RFC 5987 ext-value(Content-Disposition filename*)에도 그대로 맞다.
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function buildV4SignedUrl(input: V4SignInput): Promise<{ url: string; headers: Record<string, string> }> {
  if (!Number.isInteger(input.expiresSec) || input.expiresSec < 1 || input.expiresSec > MAX_EXPIRES_SEC) {
    throw new Error(`서명 만료는 1~${MAX_EXPIRES_SEC}초`);
  }
  const iso = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const datestamp = iso.slice(0, 8);
  const scope = `${datestamp}/auto/storage/goog4_request`;

  const signed: Record<string, string> = { host: HOST };
  for (const [name, value] of Object.entries(input.headers)) signed[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  const names = Object.keys(signed).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    ...input.query,
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${input.credentialEmail}/${scope}`,
    "X-Goog-Date": iso,
    "X-Goog-Expires": String(input.expiresSec),
    "X-Goog-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.entries(query)
    .map(([k, v]): [string, string] => [rfc3986(k), rfc3986(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const path = `/${input.bucket}/${input.objectKey.split("/").map(rfc3986).join("/")}`;
  const canonicalHeaders = names.map((n) => `${n}:${signed[n]}\n`).join("");
  const canonicalRequest = [input.method, path, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["GOOG4-RSA-SHA256", iso, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");

  const signature = Buffer.from(await input.sign(stringToSign), "base64").toString("hex");
  return { url: `https://${HOST}${path}?${canonicalQuery}&X-Goog-Signature=${signature}`, headers: input.headers };
}
