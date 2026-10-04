import { createHash, generateKeyPairSync, sign as rsaSign, verify as rsaVerify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildV4SignedUrl } from "@/lib/gcp/gcs-v4";
import type { GcsRequest, GcsRequestInit, GcsResponse } from "@/lib/gcp/gcs";
import { createGcsStorage, type GcsSigner } from "@/lib/gcp/storage";

// 05-12 Task 1(EVID-01 · T-05-1204): gcs 증빙 드라이버의 배관. 네트워크 없음 — 서명기는 실행 중 만든 RSA 키,
// REST는 04.3 GcsRequest 모양의 가짜. 실제 GCS가 이 서명을 받는지는 Task 3 스파이크(사람)가 확인한다.

const BUCKET = "proj-plant8-staging-evidence";
const EMAIL = "runtime@example.iam.gserviceaccount.com";
const NOW = new Date("2026-10-04T01:02:03.000Z");
const SHA = "b".repeat(64);
const KEY = "incoming/0b9c7a52-6f4e-4f7b-9d6a-1c2e3f4a5b6c";
const EVIDENCE_KEY = "evidence/7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function rsaSigner(): GcsSigner & { signed: string[] } {
  const signed: string[] = [];
  return {
    signed,
    getCredentials: () => Promise.resolve({ client_email: EMAIL }),
    sign: (data: string) => {
      signed.push(data);
      return Promise.resolve(rsaSign("sha256", Buffer.from(data), privateKey).toString("base64"));
    },
  };
}

function fakeRequest(responses: Array<GcsResponse | Error>) {
  const calls: GcsRequestInit[] = [];
  const request: GcsRequest = (init) => {
    calls.push(init);
    const next = responses.shift() ?? { status: 200 };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { calls, request };
}

const json = (status: number, body: unknown): GcsResponse => ({ status, data: Buffer.from(JSON.stringify(body)) });

function storageWith(responses: Array<GcsResponse | Error> = [], signer = rsaSigner()) {
  const warn = vi.fn();
  const fake = fakeRequest(responses);
  const storage = createGcsStorage({ bucket: BUCKET, auth: signer, request: fake.request, now: () => NOW, log: { warn } });
  return { storage, signer, warn, ...fake };
}

// 테스트가 독립적으로 다시 만든 정준 요청 → string-to-sign(V4 · GOOG4-RSA-SHA256).
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function expectedStringToSign(method: string, url: URL, headers: Record<string, string>): string {
  const query = [...url.searchParams.entries()]
    .filter(([k]) => k !== "X-Goog-Signature")
    .map(([k, v]): [string, string] => [rfc3986(k), rfc3986(v)])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const all = { ...headers, host: "storage.googleapis.com" };
  const names = Object.keys(all).map((n) => n.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const canonical = [method, url.pathname, query, canonicalHeaders, names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  return ["GOOG4-RSA-SHA256", "20261004T010203Z", "20261004/auto/storage/goog4_request", createHash("sha256").update(canonical).digest("hex")].join("\n");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("createSignedPut — V4 서명 PUT", () => {
  it("주소 · 쿼리 여섯 키 · 서명 헤더 넷 · 돌려준 헤더 셋, 서명이 공개 키로 검증된다", async () => {
    const { storage, signer } = storageWith();
    const put = await storage.createSignedPut(KEY, { contentType: "image/jpeg", maxBytes: 10_485_760, sha256: SHA, expiresSec: 900 });

    const url = new URL(put.url);
    expect(put.method).toBe("PUT");
    expect(url.host).toBe("storage.googleapis.com");
    expect(url.pathname).toBe(`/${BUCKET}/${KEY}`);
    expect(url.searchParams.get("X-Goog-Algorithm")).toBe("GOOG4-RSA-SHA256");
    expect(url.searchParams.get("X-Goog-Credential")).toBe(`${EMAIL}/20261004/auto/storage/goog4_request`);
    expect(url.searchParams.get("X-Goog-Date")).toBe("20261004T010203Z");
    expect(url.searchParams.get("X-Goog-Expires")).toBe("900");
    expect(url.searchParams.get("X-Goog-SignedHeaders")).toBe("content-type;host;x-goog-content-length-range;x-goog-meta-sha256");
    expect(put.headers).toEqual({ "Content-Type": "image/jpeg", "x-goog-content-length-range": "1,10485760", "x-goog-meta-sha256": SHA });

    const signature = url.searchParams.get("X-Goog-Signature") ?? "";
    expect(signature).toMatch(/^[0-9a-f]+$/);
    const stringToSign = expectedStringToSign("PUT", url, put.headers);
    expect(signer.signed).toEqual([stringToSign]);
    expect(rsaVerify("sha256", Buffer.from(stringToSign), publicKey, Buffer.from(signature, "hex"))).toBe(true);
  });

  it("만료가 604800초를 넘으면 오류 — 서명하지 않는다", async () => {
    const { storage, signer } = storageWith();
    await expect(storage.createSignedPut(KEY, { contentType: "image/jpeg", maxBytes: 1, sha256: SHA, expiresSec: 604_801 })).rejects.toThrow();
    expect(signer.signed).toHaveLength(0);
  });

  it("서명기가 던지면 오류가 그대로 오르고 storage.sign_failed 한 줄(op · reason만)", async () => {
    const failing: GcsSigner = {
      getCredentials: () => Promise.resolve({ client_email: EMAIL }),
      sign: () => Promise.reject(Object.assign(new Error(`signBlob denied for ${EMAIL}`), { code: "403" })),
    };
    const { storage, warn } = storageWith([], failing as GcsSigner & { signed: string[] });
    await expect(storage.createSignedPut(KEY, { contentType: "image/jpeg", maxBytes: 1, sha256: SHA, expiresSec: 900 })).rejects.toThrow("signBlob denied");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("storage.sign_failed", { op: "put", reason: "Error:403" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });
});

describe("createSignedGet — V4 서명 GET", () => {
  it("response-content-disposition(RFC 5987 한글 파일명)이 서명된 쿼리에 있고 만료 300", async () => {
    const { storage, signer } = storageWith();
    const { url: raw } = await storage.createSignedGet(EVIDENCE_KEY, { expiresSec: 300, filename: "세금계산서.jpg", disposition: "inline" });
    const url = new URL(raw);
    expect(url.searchParams.get("X-Goog-Expires")).toBe("300");
    expect(url.searchParams.get("X-Goog-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("response-content-disposition")).toBe(`inline; filename*=UTF-8''${encodeURIComponent("세금계산서.jpg")}`);
    const stringToSign = expectedStringToSign("GET", url, {});
    expect(signer.signed).toEqual([stringToSign]);
    expect(rsaVerify("sha256", Buffer.from(stringToSign), publicKey, Buffer.from(url.searchParams.get("X-Goog-Signature") ?? "", "hex"))).toBe(true);
  });

  it("서명 실패는 op get으로 남는다", async () => {
    const failing = { getCredentials: () => Promise.reject(new TypeError("no creds")), sign: () => Promise.resolve("") };
    const { storage, warn } = storageWith([], failing as unknown as GcsSigner & { signed: string[] });
    await expect(storage.createSignedGet(EVIDENCE_KEY, { expiresSec: 300, filename: "a.pdf", disposition: "attachment" })).rejects.toThrow("no creds");
    expect(warn).toHaveBeenCalledWith("storage.sign_failed", { op: "get", reason: "TypeError" });
  });
});

describe("buildV4SignedUrl — 경로 인코딩", () => {
  it("키의 슬래시는 유지하고 나머지는 RFC 3986으로 인코딩한다", async () => {
    const { url } = await buildV4SignedUrl({
      method: "GET",
      bucket: BUCKET,
      objectKey: "evidence/a b(1)",
      headers: {},
      query: {},
      credentialEmail: EMAIL,
      now: NOW,
      expiresSec: 60,
      sign: () => Promise.resolve(Buffer.from([1, 2]).toString("base64")),
    });
    expect(new URL(url).pathname).toBe(`/${BUCKET}/evidence/a%20b%281%29`);
    expect(new URL(url).searchParams.get("X-Goog-Signature")).toBe("0102");
  });
});

describe("getMetadata · delete — 04.3 GcsRequest", () => {
  const objectUrl = (key: string) => `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(key)}`;

  it("JSON API 응답을 크기(수) · 형식 · 사용자 메타 sha256으로", async () => {
    const { storage, calls } = storageWith([json(200, { size: "212000", contentType: "image/jpeg", metadata: { sha256: SHA } })]);
    await expect(storage.getMetadata(KEY)).resolves.toEqual({ size: 212_000, contentType: "image/jpeg", sha256: SHA });
    expect(calls).toEqual([{ op: "meta", method: "GET", url: objectUrl(KEY) }]);
  });

  it("사용자 메타가 없으면 sha256 null · 404면 null · 5xx면 오류", async () => {
    const { storage } = storageWith([json(200, { size: "3", contentType: "image/png" }), { status: 404 }, { status: 503 }]);
    await expect(storage.getMetadata(KEY)).resolves.toEqual({ size: 3, contentType: "image/png", sha256: null });
    await expect(storage.getMetadata(KEY)).resolves.toBeNull();
    await expect(storage.getMetadata(KEY)).rejects.toThrow("GCS meta 실패: 503");
  });

  it("delete는 같은 주소에 DELETE · 404는 성공", async () => {
    const { storage, calls } = storageWith([{ status: 204 }, { status: 404 }]);
    await storage.delete(KEY);
    await storage.delete(KEY);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["DELETE", objectUrl(KEY)],
      ["DELETE", objectUrl(KEY)],
    ]);
  });
});

describe("move — JSON API rewriteTo 이어 부름 뒤 원본 DELETE(M1)", () => {
  const rewriteUrl = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(KEY)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(EVIDENCE_KEY)}`;

  it("done: false면 rewriteToken으로 다시, done: true에서 멈추고 원본 DELETE(404도 성공)", async () => {
    const { storage, calls } = storageWith([json(200, { done: false, rewriteToken: "t1" }), json(200, { done: true }), { status: 404 }]);
    await storage.move(KEY, EVIDENCE_KEY);
    expect(rewriteUrl).toContain("incoming%2F");
    expect(calls.map((c) => [c.op, c.method, c.url])).toEqual([
      ["move", "POST", rewriteUrl],
      ["move", "POST", `${rewriteUrl}?rewriteToken=t1`],
      ["delete", "DELETE", `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(KEY)}`],
    ]);
  });

  it("재작성이 실패하면 오류가 오르고 원본을 지우지 않는다", async () => {
    const { storage, calls } = storageWith([{ status: 404 }]);
    await expect(storage.move(KEY, EVIDENCE_KEY)).rejects.toThrow("GCS move 실패: 404");
    expect(calls).toHaveLength(1);
  });
});

describe("retain — 임시 보존 표식(F9 이중 방어)", () => {
  it("객체 주소에 PATCH { temporaryHold: true } · 실패면 오류", async () => {
    const { storage, calls } = storageWith([json(200, {}), { status: 403 }]);
    await storage.retain(EVIDENCE_KEY);
    expect(calls[0]).toEqual({
      op: "retain",
      method: "PATCH",
      url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(EVIDENCE_KEY)}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ temporaryHold: true })),
    });
    await expect(storage.retain(EVIDENCE_KEY)).rejects.toThrow("GCS retain 실패: 403");
  });
});

describe("getObjectStorage — gcs 분기", () => {
  it("STORAGE_DRIVER=gcs + 버킷 → gcs 드라이버(서명 주소 호스트가 storage.googleapis.com)", async () => {
    vi.stubEnv("STORAGE_DRIVER", "gcs");
    vi.stubEnv("GCS_EVIDENCE_BUCKET", BUCKET);
    const { getObjectStorage } = await import("@/lib/gcp/storage");
    const storage = getObjectStorage();
    expect(typeof storage.retain).toBe("function");
    expect(storage).not.toHaveProperty("writeObject");
  });

  it("버킷이 없으면 설정 오류 — 문구에 GCS_EVIDENCE_BUCKET", async () => {
    vi.stubEnv("STORAGE_DRIVER", "gcs");
    vi.stubEnv("GCS_EVIDENCE_BUCKET", "");
    const { getObjectStorage, ObjectStorageNotConfiguredError } = await import("@/lib/gcp/storage");
    expect(() => getObjectStorage()).toThrow(ObjectStorageNotConfiguredError);
    expect(() => getObjectStorage()).toThrow(/GCS_EVIDENCE_BUCKET/);
  });
});
