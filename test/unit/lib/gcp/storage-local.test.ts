import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorage, verifyLocalSignedRequest, type LocalObjectStorage } from "@/lib/gcp/storage";

// 05-04(EVID-01 · T-05-402 · T-05-404): 로컬 · CI 저장소 드라이버 — 서명된 로컬 주소(HMAC)와 데이터 디렉터리 안 파일.
// 서명 조건(만료 · 크기 상한 · 형식 · sha256)을 벗어난 요청과 허용 키 꼴(incoming/{uuid} · evidence/{uuid}) 밖은 전부 거부한다.

const SECRET = "s".repeat(64);
const NOW = new Date("2026-10-04T01:00:00.000Z");
const SHA = "a".repeat(64);
const MAX = 10 * 1024 * 1024;

let dataDir: string;
let storage: LocalObjectStorage;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "storage-local-"));
  storage = createLocalStorage({ secret: SECRET, dataDir, baseUrl: "", now: () => NOW });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function incoming(): string {
  return `incoming/${randomUUID()}`;
}

async function signedPut(key = incoming()) {
  const signed = await storage.createSignedPut(key, { contentType: "image/jpeg", maxBytes: MAX, sha256: SHA, expiresSec: 900 });
  return { key, signed };
}

function putRequest(overrides: Partial<{ contentLength: number; contentType: string; shaHeader: string; now: Date; method: "PUT" | "GET" }> = {}) {
  return { secret: SECRET, method: "PUT" as const, contentLength: 212_000, contentType: "image/jpeg", shaHeader: SHA, now: NOW, ...overrides };
}

function withParam(url: string, name: string, value: string): string {
  const parsed = new URL(url, "http://local");
  parsed.searchParams.set(name, value);
  return `${parsed.pathname}${parsed.search}`;
}

describe("서명된 PUT 주소", () => {
  it("만든 주소는 /api/storage-local/{키}이고 선언대로의 요청을 받아들인다 · 헤더는 형식과 sha256 메타", async () => {
    const { key, signed } = await signedPut();

    expect(signed.method).toBe("PUT");
    expect(signed.url.startsWith(`/api/storage-local/${key}?`)).toBe(true);
    expect(signed.headers).toEqual({ "Content-Type": "image/jpeg", "x-goog-meta-sha256": SHA });
    expect(verifyLocalSignedRequest(signed.url, putRequest())).toMatchObject({ ok: true, key, op: "put", contentType: "image/jpeg", sha256: SHA, maxBytes: MAX });
  });

  it("서명 한 글자 변조 · 상한 늘리기 · 형식 바꾸기(쿼리 조작)는 거부한다", async () => {
    const { signed } = await signedPut();
    const sig = new URL(signed.url, "http://local").searchParams.get("sig") ?? "";
    const flipped = `${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;

    expect(verifyLocalSignedRequest(withParam(signed.url, "sig", flipped), putRequest()).ok).toBe(false);
    expect(verifyLocalSignedRequest(withParam(signed.url, "max", String(MAX * 10)), putRequest({ contentLength: MAX + 1 })).ok).toBe(false);
    expect(verifyLocalSignedRequest(withParam(signed.url, "ct", "text/html"), putRequest({ contentType: "text/html" })).ok).toBe(false);
  });

  it("만료가 지나면 거부한다", async () => {
    const { signed } = await signedPut();

    expect(verifyLocalSignedRequest(signed.url, putRequest({ now: new Date(NOW.getTime() + 899_000) })).ok).toBe(true);
    expect(verifyLocalSignedRequest(signed.url, putRequest({ now: new Date(NOW.getTime() + 901_000) })).ok).toBe(false);
  });

  it("선언 상한보다 큰 크기 · 0바이트는 거부하고 상한과 같은 크기는 받는다", async () => {
    const { signed } = await signedPut();

    expect(verifyLocalSignedRequest(signed.url, putRequest({ contentLength: MAX + 1 })).ok).toBe(false);
    expect(verifyLocalSignedRequest(signed.url, putRequest({ contentLength: 0 })).ok).toBe(false);
    expect(verifyLocalSignedRequest(signed.url, putRequest({ contentLength: MAX })).ok).toBe(true);
  });

  it("다른 Content-Type · 다른 sha256 메타 헤더 · 다른 메서드는 거부한다", async () => {
    const { signed } = await signedPut();

    expect(verifyLocalSignedRequest(signed.url, putRequest({ contentType: "text/html" })).ok).toBe(false);
    expect(verifyLocalSignedRequest(signed.url, putRequest({ shaHeader: "b".repeat(64) })).ok).toBe(false);
    expect(verifyLocalSignedRequest(signed.url, putRequest({ method: "GET" })).ok).toBe(false);
  });

  it("다른 비밀로 검증하면 거부하고, 같은 비밀 · 같은 입력이면 같은 주소다(결정적)", async () => {
    const key = incoming();
    const { signed } = await signedPut(key);
    const again = createLocalStorage({ secret: SECRET, dataDir, baseUrl: "", now: () => NOW });
    const same = await again.createSignedPut(key, { contentType: "image/jpeg", maxBytes: MAX, sha256: SHA, expiresSec: 900 });

    expect(same.url).toBe(signed.url);
    expect(verifyLocalSignedRequest(signed.url, { ...putRequest(), secret: "t".repeat(64) }).ok).toBe(false);
  });

  it.each(["../x", "evidence/abc", `other/${randomUUID()}`, `incoming/${randomUUID()}/../../x`])("허용 꼴 밖 키(%s)는 서명하지 않고, 경로를 바꾼 주소도 거부한다", async (bad) => {
    await expect(storage.createSignedPut(bad, { contentType: "image/jpeg", maxBytes: MAX, sha256: SHA, expiresSec: 900 })).rejects.toThrow();
    const { key, signed } = await signedPut();

    expect(verifyLocalSignedRequest(signed.url.replace(key, bad), putRequest()).ok).toBe(false);
  });

  it("baseUrl이 있으면 주소 앞에 붙는다", async () => {
    const based = createLocalStorage({ secret: SECRET, dataDir, baseUrl: "http://localhost:3100", now: () => NOW });
    const key = incoming();
    const signed = await based.createSignedPut(key, { contentType: "image/jpeg", maxBytes: MAX, sha256: SHA, expiresSec: 900 });

    expect(signed.url.startsWith(`http://localhost:3100/api/storage-local/${key}?`)).toBe(true);
    expect(verifyLocalSignedRequest(signed.url, putRequest()).ok).toBe(true);
  });
});

describe("서명된 GET 주소", () => {
  it("보기 주소는 GET으로만 받아들이고 파일명 · 표시 방식을 싣는다", async () => {
    const key = `evidence/${randomUUID()}`;
    const { url } = await storage.createSignedGet(key, { expiresSec: 300, filename: "세금계산서.jpg", disposition: "inline" });

    expect(verifyLocalSignedRequest(url, { secret: SECRET, method: "GET", now: NOW })).toMatchObject({
      ok: true,
      key,
      op: "get",
      filename: "세금계산서.jpg",
      disposition: "inline",
    });
    expect(verifyLocalSignedRequest(url, putRequest()).ok).toBe(false);
    expect(verifyLocalSignedRequest(url, { secret: SECRET, method: "GET", now: new Date(NOW.getTime() + 301_000) }).ok).toBe(false);
    expect(verifyLocalSignedRequest(withParam(url, "disp", "attachment"), { secret: SECRET, method: "GET", now: NOW }).ok).toBe(false);
  });
});

// 05 /review A15(adversarial F10): 경로의 잘못된 % 이스케이프는 던지지 않고(라우트 500) 키 거부로 끝난다.
describe("잘못된 경로 이스케이프", () => {
  it("/api/storage-local/%E0 · 키 중간의 깨진 %는 key 거부", () => {
    expect(verifyLocalSignedRequest("/api/storage-local/%E0", { secret: SECRET, method: "GET", now: NOW })).toEqual({ ok: false, reason: "key" });
    expect(verifyLocalSignedRequest(`/api/storage-local/evidence/${randomUUID()}%ZZ?op=get`, { secret: SECRET, method: "GET", now: NOW })).toEqual({
      ok: false,
      reason: "key",
    });
  });
});

describe("데이터 디렉터리의 객체", () => {
  const meta = { size: 3, contentType: "image/jpeg", sha256: SHA };

  it("쓴 객체의 메타데이터를 읽고, 없으면 null · 지우면 null(없는 키 지우기도 성공)", async () => {
    const key = incoming();
    await storage.writeObject(key, Buffer.from([1, 2, 3]), meta);

    expect(await storage.getMetadata(key)).toEqual(meta);
    expect(await storage.getMetadata(incoming())).toBeNull();
    await storage.delete(key);
    expect(await storage.getMetadata(key)).toBeNull();
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it("move는 바이트 · 사이드카를 옮겨 원본이 없고 대상에 같은 바이트 · 형식 · sha256이 있다", async () => {
    const from = incoming();
    const to = `evidence/${randomUUID()}`;
    await storage.writeObject(from, Buffer.from([1, 2, 3]), meta);

    await storage.move(from, to);

    expect(await storage.getMetadata(from)).toBeNull();
    await expect(stat(path.join(dataDir, from))).rejects.toThrow();
    expect(await storage.getMetadata(to)).toEqual(meta);
    expect((await storage.readObject(to))?.bytes).toEqual(Buffer.from([1, 2, 3]));
  });

  it("원본이 없는 move는 오류이고, 허용 꼴 밖 키로의 move는 거부한다", async () => {
    await expect(storage.move(incoming(), `evidence/${randomUUID()}`)).rejects.toThrow();
    const from = incoming();
    await storage.writeObject(from, Buffer.from([1, 2, 3]), meta);

    await expect(storage.move(from, "../x")).rejects.toThrow();
    await expect(storage.move(from, `other/${randomUUID()}`)).rejects.toThrow();
    expect(await storage.getMetadata(from)).toEqual(meta);
  });

  it("retain은 사이드카에 retained 표식을 남기고 메타데이터는 그대로다", async () => {
    const key = `evidence/${randomUUID()}`;
    await storage.writeObject(key, Buffer.from([1, 2, 3]), meta);

    await storage.retain(key);

    expect(JSON.parse(await readFile(path.join(dataDir, `${key}.json`), "utf8"))).toMatchObject({ ...meta, retained: true });
    expect(await storage.getMetadata(key)).toEqual(meta);
  });
});
