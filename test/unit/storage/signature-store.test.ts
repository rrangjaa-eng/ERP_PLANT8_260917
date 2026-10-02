import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GcsRequest, GcsRequestInit } from "@/lib/gcp/gcs";

// 04.3-05 Task 1 — 환경별 서명 저장소 드라이버 선택. env는 모듈 최상단에서 한 번
// 읽히므로(lib/env.ts) 케이스마다 환경을 바꾸고 모듈 그래프를 새로 불러온다.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function fakeRequest(status = 200) {
  const calls: GcsRequestInit[] = [];
  const request: GcsRequest = (init) => {
    calls.push(init);
    return Promise.resolve({ status, data: PNG });
  };
  return { calls, request };
}

async function loadStore(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  if (vars.APP_ENV && vars.APP_ENV !== "local") {
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "https://example.com");
  }
  vi.resetModules();
  return import("@/lib/storage/signature-store");
}

beforeEach(() => {
  vi.stubEnv("CERT_SIGNATURE_BUCKET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getSignatureStore — 드라이버 선택", () => {
  it("APP_ENV=local이면 로컬 드라이버 — 버킷이 있어도 GCS를 부르지 않는다", async () => {
    const mod = await loadStore({ APP_ENV: "local", CERT_SIGNATURE_BUCKET: "b" });
    const { calls, request } = fakeRequest();
    const store = mod.getSignatureStore({ request });
    const key = `signatures/unit-${randomUUID()}/w1.png`;

    await store.put(key, PNG);
    await expect(store.get(key)).resolves.toEqual(PNG);
    await store.delete(key);
    await expect(store.get(key)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("APP_ENV=staging + CERT_SIGNATURE_BUCKET이면 GCS 드라이버 — put·get·delete가 주입한 request로 간다", async () => {
    const mod = await loadStore({ APP_ENV: "staging", CERT_SIGNATURE_BUCKET: "b" });
    const { calls, request } = fakeRequest();
    const store = mod.getSignatureStore({ request });

    await store.put("signatures/e1/w1-u.png", PNG);
    await expect(store.get("signatures/e1/w1-u.png")).resolves.toEqual(PNG);
    await store.delete("signatures/e1/w1-u.png");

    expect(calls.map((c) => [c.method, c.url])).toEqual([
      [
        "POST",
        "https://storage.googleapis.com/upload/storage/v1/b/b/o?uploadType=media&name=signatures%2Fe1%2Fw1-u.png&ifGenerationMatch=0",
      ],
      ["GET", "https://storage.googleapis.com/storage/v1/b/b/o/signatures%2Fe1%2Fw1-u.png?alt=media"],
      ["DELETE", "https://storage.googleapis.com/storage/v1/b/b/o/signatures%2Fe1%2Fw1-u.png"],
    ]);
    expect(calls[0]?.headers).toEqual({ "Content-Type": "image/png" });
  });

  it("GCS 드라이버의 get 404는 null", async () => {
    const mod = await loadStore({ APP_ENV: "prod", CERT_SIGNATURE_BUCKET: "b" });
    const { request } = fakeRequest(404);

    await expect(mod.getSignatureStore({ request }).get("signatures/e1/w1-u.png")).resolves.toBeNull();
  });

  it("APP_ENV=prod인데 버킷이 없으면 SignatureStoreNotConfiguredError — 메시지는 변수 이름만", async () => {
    const mod = await loadStore({ APP_ENV: "prod" });

    let error: unknown;
    try {
      mod.getSignatureStore();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(mod.SignatureStoreNotConfiguredError);
    expect((error as Error).message).toContain("CERT_SIGNATURE_BUCKET");
  });

  it("APP_ENV=staging에 버킷이 빈 값이면 없음으로 본다", async () => {
    const mod = await loadStore({ APP_ENV: "staging", CERT_SIGNATURE_BUCKET: "" });

    expect(() => mod.getSignatureStore()).toThrow(mod.SignatureStoreNotConfiguredError);
  });
});

describe("getSignatureStore — 두 드라이버 모두 키 검사를 먼저 한다", () => {
  const badKeys = ["../x", "signatures/../x.png", "other/e1/w1.png", "w1.png"];

  it.each(badKeys)("GCS 드라이버: %s → 요청 전에 거부", async (key) => {
    const mod = await loadStore({ APP_ENV: "staging", CERT_SIGNATURE_BUCKET: "b" });
    const { calls, request } = fakeRequest();
    const store = mod.getSignatureStore({ request });

    await expect(async () => store.put(key, PNG)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
    await expect(async () => store.get(key)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
    await expect(async () => store.delete(key)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
    expect(calls).toHaveLength(0);
  });

  it.each(badKeys)("로컬 드라이버: %s → 거부", async (key) => {
    const mod = await loadStore({ APP_ENV: "local" });
    const store = mod.getSignatureStore();

    await expect(async () => store.put(key, PNG)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
    await expect(async () => store.get(key)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
    await expect(async () => store.delete(key)).rejects.toBeInstanceOf(mod.InvalidSignatureKeyError);
  });
});

describe("서명 객체 키 검증 — 오류 문장에 키가 없다", () => {
  it("형식이 틀린 키는 InvalidSignatureKeyError로 거부하고 메시지에 키를 담지 않는다", async () => {
    const mod = await loadStore({ APP_ENV: "local" });
    const store = mod.getSignatureStore();
    const badKey = `../etc/secret-${randomUUID()}.png`;

    let error: unknown = null;
    try {
      await store.get(badKey);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(mod.InvalidSignatureKeyError);
    expect((error as Error).message).not.toContain(badKey);
    expect((error as Error).message).not.toContain("secret");
  });
});
