import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// 04.3-08 검토 반영 H1 · L6 — instrumentation.ts register(). Next 16 프로덕션은 첫 요청의
// prepare()에서 register()를 부르고 그 거절을 캐시한다(재시도 없음 → 모든 요청 500). 그래서
// 데이터 키를 끝내 못 풀면 오류 이름만 남기고 프로세스를 끝내 Cloud Run이 인스턴스를 바꾸게 한다.

const loadDataKeys = vi.fn<() => Promise<void>>();

class MissingEncryptionKeyError extends Error {}

let savedRuntime: string | undefined;
let exitSpy: MockInstance<typeof process.exit>;
let logSpy: MockInstance<typeof console.log>;

beforeEach(() => {
  savedRuntime = process.env.NEXT_RUNTIME;
  loadDataKeys.mockReset();
  vi.resetModules();
  vi.doMock("@/lib/crypto", () => ({ loadDataKeys }));
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  if (savedRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = savedRuntime;
  vi.doUnmock("@/lib/crypto");
  exitSpy.mockRestore();
  logSpy.mockRestore();
});

describe("instrumentation register()", () => {
  it("Node 런타임이 아니면(edge) loadDataKeys를 부르지 않는다", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("@/instrumentation");

    await register();

    expect(loadDataKeys).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("Node 런타임이면 loadDataKeys를 한 번 부르고, 성공하면 프로세스를 끝내지 않는다", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    loadDataKeys.mockResolvedValue(undefined);
    const { register } = await import("@/instrumentation");

    await register();

    expect(loadDataKeys).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("데이터 키를 못 풀면 오류 이름만 로그로 남기고 process.exit(1) — 메시지는 남기지 않는다", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    loadDataKeys.mockRejectedValue(new MissingEncryptionKeyError("키를 아직 풀지 않았습니다: APP_DATA_KEY_v1"));
    const { register } = await import("@/instrumentation");

    await register();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("instrumentation.data_key_load_failed"));
    expect(line).toBeDefined();
    const entry = JSON.parse(line ?? "{}") as Record<string, unknown>;
    expect(entry.name).toBe("MissingEncryptionKeyError");
    expect(line).not.toContain("APP_DATA_KEY_v1");
  });
});
