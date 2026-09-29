import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// 04.3-08 검토 반영 L6 — 감싼 변수만 있고 키를 아직 풀지 않은(register()가 못 돈) 라우트
// 인스턴스에서 /api/health는 주입 없는 기본 데이터 키 왕복으로 503 { ok: false }를 낸다.
// DB ping만 가짜로 바꾼다(그 밖은 실제 domain/health · lib/crypto).

const KEY_ENV = [
  "APP_DATA_KEY_v1",
  "APP_DATA_KEY_v2",
  "APP_DATA_KEY_v1_WRAPPED",
  "APP_DATA_KEY_v2_WRAPPED",
  "APP_DATA_KEY_KMS_KEY",
] as const;
const DATA_KEY_SLOT = Symbol.for("plant8.appDataKeys");

let savedEnv: Record<string, string | undefined> = {};
let logSpy: MockInstance<typeof console.log>;

function clearDataKeySlot(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT];
}

beforeEach(() => {
  savedEnv = {};
  for (const key of KEY_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  clearDataKeySlot();
  vi.resetModules();
  vi.doMock("@/repositories/health", () => ({ pingDatabase: () => Promise.resolve() }));
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const key of KEY_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearDataKeySlot();
  vi.doUnmock("@/repositories/health");
  vi.resetModules();
  logSpy.mockRestore();
});

describe("/api/health — 감싼 키를 풀지 않은 인스턴스", () => {
  it("감싼 v1 변수만 있고 칸이 비었으면 기본 왕복이 실패해 503 { ok: false }", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "wrapped-v1";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("같은 조건에서 풀린 키가 칸에 있으면 200 { ok: true }", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "wrapped-v1";
    process.env.APP_DATA_KEY_KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";
    const { loadDataKeys } = await import("@/lib/crypto");
    await loadDataKeys({ unwrap: () => Promise.resolve(Buffer.from(Buffer.alloc(32, 5).toString("base64"))) });
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(200);
  });
});
