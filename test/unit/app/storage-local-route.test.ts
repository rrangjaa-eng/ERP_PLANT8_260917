import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 05-04(EVID-01 · T-05-405 · Pitfall 8): 로컬 저장소 창구 — 해석된 드라이버가 local일 때만 열린다(gcs면 PUT · GET 모두 404 +
// 운영 로그). 세션 인증 없이 서명 주소가 권한이다. 데이터 디렉터리는 작업 디렉터리의 .data/uploads(테스트는 임시 디렉터리).

const SECRET = "r".repeat(64);
const SHA = "c".repeat(64);
const ENV_KEYS = ["APP_ENV", "STORAGE_DRIVER", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

let saved: Record<string, string | undefined>;
let root: string;

beforeEach(async () => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  root = await mkdtemp(path.join(tmpdir(), "storage-route-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await rm(root, { recursive: true, force: true });
});

async function loadRoute() {
  const route = await import("@/app/api/storage-local/[...key]/route");
  const { log } = await import("@/lib/log");
  const { createLocalStorage } = await import("@/lib/gcp/storage");
  const storage = createLocalStorage({ secret: SECRET, dataDir: path.join(root, ".data", "uploads"), baseUrl: "" });
  return { route, log, storage };
}

function putRequest(url: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${url}`, {
    method: "PUT",
    body,
    headers: { "Content-Type": "image/jpeg", "x-goog-meta-sha256": SHA, "Content-Length": String(body.byteLength), ...headers },
  });
}

describe("드라이버가 gcs이면 창구가 없다", () => {
  it.each([
    ["APP_ENV=staging · 값 없음", () => Object.assign(process.env, { APP_ENV: "staging", BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "https://example.com" })],
    ["APP_ENV=local · STORAGE_DRIVER=gcs", () => Object.assign(process.env, { STORAGE_DRIVER: "gcs", BETTER_AUTH_SECRET: SECRET })],
  ])("%s → PUT · GET 모두 404 · 키 · 주소 없는 운영 로그", async (_label, setup) => {
    setup();
    const { route, log, storage } = await loadRoute();
    const warn = vi.spyOn(log, "warn");
    const key = `incoming/${randomUUID()}`;
    const signed = await storage.createSignedPut(key, { contentType: "image/jpeg", maxBytes: 100, sha256: SHA, expiresSec: 900 });

    const put = await route.PUT(putRequest(signed.url, new Uint8Array([1, 2, 3])));
    const get = await route.GET(new Request(`http://localhost${signed.url}`));

    expect(put.status).toBe(404);
    expect(get.status).toBe(404);
    expect(warn.mock.calls).toEqual([
      ["storage.local_route_blocked", { method: "PUT", reason: "driver_not_local" }],
      ["storage.local_route_blocked", { method: "GET", reason: "driver_not_local" }],
    ]);
  });
});

describe("드라이버가 local이면 서명 주소로 올리고 내려받는다", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = SECRET;
  });

  it("유효한 PUT → 201 · 데이터 디렉터리에 바이트와 메타데이터 · 유효한 GET → 200 · 선언 형식 · 파일명 · nosniff", async () => {
    const { route, storage } = await loadRoute();
    const key = `incoming/${randomUUID()}`;
    const signed = await storage.createSignedPut(key, { contentType: "image/jpeg", maxBytes: 100, sha256: SHA, expiresSec: 900 });

    const put = await route.PUT(putRequest(signed.url, new Uint8Array([7, 8, 9])));

    expect(put.status).toBe(201);
    expect(await readFile(path.join(root, ".data", "uploads", key))).toEqual(Buffer.from([7, 8, 9]));
    expect(await storage.getMetadata(key)).toEqual({ size: 3, contentType: "image/jpeg", sha256: SHA });

    const view = await storage.createSignedGet(key, { expiresSec: 300, filename: "세금계산서.jpg", disposition: "inline" });
    const get = await route.GET(new Request(`http://localhost${view.url}`));

    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("image/jpeg");
    expect(get.headers.get("Content-Disposition")).toBe(`inline; filename*=UTF-8''${encodeURIComponent("세금계산서.jpg")}`);
    expect(get.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await get.arrayBuffer())).toEqual(Buffer.from([7, 8, 9]));
  });

  it("변조한 주소 → PUT · GET 모두 403이고 아무것도 쓰지 않는다", async () => {
    const { route, storage } = await loadRoute();
    const key = `incoming/${randomUUID()}`;
    const signed = await storage.createSignedPut(key, { contentType: "image/jpeg", maxBytes: 100, sha256: SHA, expiresSec: 900 });
    const tampered = signed.url.replace("max=100", "max=1000");

    const put = await route.PUT(putRequest(tampered, new Uint8Array([1, 2, 3])));
    const get = await route.GET(new Request(`http://localhost${signed.url.replace("op=put", "op=get")}`));

    expect(put.status).toBe(403);
    expect(get.status).toBe(403);
    expect(await storage.getMetadata(key)).toBeNull();
  });

  it("Content-Length와 실제 본문 길이가 다르면 거부하고 쓰지 않는다", async () => {
    const { route, storage } = await loadRoute();
    const key = `incoming/${randomUUID()}`;
    const signed = await storage.createSignedPut(key, { contentType: "image/jpeg", maxBytes: 100, sha256: SHA, expiresSec: 900 });

    const put = await route.PUT(putRequest(signed.url, new Uint8Array([1, 2, 3, 4]), { "Content-Length": "3" }));

    expect(put.status).toBeGreaterThanOrEqual(400);
    expect(await storage.getMetadata(key)).toBeNull();
  });
});
