import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { decryptWithKms, KmsUnavailableError, type KmsRequest, type KmsRequestInit } from "@/lib/gcp/kms";

// 04.3-08 Task 1 — Cloud KMS cryptoKeys.decrypt REST 어댑터. 네트워크는 쓰지 않는다:
// 주입한 request가 (URL, 본문)을 기록하고 상태 코드 · 응답을 돌려준다(gcs.test.ts와 같은 결).

const KEY_NAME = "projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k";

function fakeRequest(response: { status: number; data?: { plaintext?: string } } | Error) {
  const calls: KmsRequestInit[] = [];
  const request: KmsRequest = (init) => {
    calls.push(init);
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response);
  };
  return { calls, request };
}

// 검토 반영 H1 — 일시 오류(네트워크 · 429 · 5xx)는 지수 백오프로 다시 부른다. 대기는 가짜
// 타이머로 흘려보낸다.
function sequenceRequest(responses: ({ status: number; data?: { plaintext?: string } } | Error)[]) {
  const calls: KmsRequestInit[] = [];
  const request: KmsRequest = (init) => {
    calls.push(init);
    const response = responses[Math.min(calls.length, responses.length) - 1];
    if (response === undefined) return Promise.reject(new Error("no response"));
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response);
  };
  return { calls, request };
}

async function settle(promise: Promise<unknown>): Promise<unknown> {
  const outcome = promise.catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(60_000);
  return outcome;
}

let logSpy: MockInstance<typeof console.log>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  logSpy.mockRestore();
});

describe("decryptWithKms", () => {
  it("키 이름 경로의 :decrypt에 POST 한 번 — 본문은 앞뒤 공백 · 개행을 뗀 암호문", async () => {
    const plain = Buffer.from("key-text\n");
    const { calls, request } = fakeRequest({ status: 200, data: { plaintext: plain.toString("base64") } });

    await decryptWithKms({ keyName: KEY_NAME, ciphertext: "  QUJD\n", request });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://cloudkms.googleapis.com/v1/projects/p/locations/asia-northeast3/keyRings/r/cryptoKeys/k:decrypt",
    );
    expect(calls[0]?.body).toEqual({ ciphertext: "QUJD" });
  });

  it("응답 plaintext(base64)를 그 바이트 그대로의 Buffer로 돌려준다 — 길이를 해석하지 않는다", async () => {
    const bytes = Buffer.from([0, 1, 2, 3, 250]);
    const { request } = fakeRequest({ status: 200, data: { plaintext: bytes.toString("base64") } });

    const got = await decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request });

    expect(Buffer.isBuffer(got)).toBe(true);
    expect(got).toEqual(bytes);
  });

  it.each([403, 500, 503])("상태 %i면 KmsUnavailableError — 메시지에 키 이름 · 암호문이 없고 상태 코드만", async (status) => {
    const { request } = fakeRequest({ status });

    const error = await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }));

    expect(error).toBeInstanceOf(KmsUnavailableError);
    const message = (error as Error).message;
    expect(message).toContain(String(status));
    expect(message).not.toContain(KEY_NAME);
    expect(message).not.toContain("QUJD");
  });

  it("시간 초과 · 네트워크 오류(request가 던짐)면 KmsUnavailableError", async () => {
    const { request } = fakeRequest(new Error("timeout of 10000ms exceeded"));

    expect(await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }))).toBeInstanceOf(
      KmsUnavailableError,
    );
  });

  it("200인데 plaintext가 없으면 KmsUnavailableError", async () => {
    const { request } = fakeRequest({ status: 200, data: {} });

    await expect(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request })).rejects.toBeInstanceOf(
      KmsUnavailableError,
    );
  });

  it("실패 로그 kms.decrypt_failed는 상태만 담고 키 이름 · 암호문 · 평문이 없다", async () => {
    const { request } = fakeRequest({ status: 403 });

    await decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }).catch(() => undefined);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const line = lines.find((l) => l.includes("kms.decrypt_failed"));
    expect(line).toBeDefined();
    expect(JSON.parse(line ?? "{}")).toMatchObject({ event: "kms.decrypt_failed", status: 403 });
    expect(line).not.toContain(KEY_NAME);
    expect(line).not.toContain("QUJD");
  });
});

describe("decryptWithKms — 일시 오류 재시도(검토 반영 H1)", () => {
  const OK = { status: 200, data: { plaintext: Buffer.from("key").toString("base64") } };

  it.each([
    ["네트워크 오류", new Error("socket hang up")],
    ["429", { status: 429 }],
    ["503", { status: 503 }],
  ] as const)("%s 두 번 뒤 성공하면 세 번째 호출의 평문을 돌려준다", async (_name, failure) => {
    const { calls, request } = sequenceRequest([failure, failure, OK]);

    const got = await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }));

    expect(got).toEqual(Buffer.from("key"));
    expect(calls).toHaveLength(3);
  });

  it("5xx가 계속되면 세 번 부른 뒤 KmsUnavailableError(마지막 상태)", async () => {
    const { calls, request } = sequenceRequest([{ status: 500 }]);

    const error = await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }));

    expect(error).toBeInstanceOf(KmsUnavailableError);
    expect((error as Error).message).toContain("500");
    expect(calls).toHaveLength(3);
  });

  it.each([403, 404, 400])("상태 %i는 다시 부르지 않는다(한 번)", async (status) => {
    const { calls, request } = sequenceRequest([{ status }]);

    const error = await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }));

    expect(error).toBeInstanceOf(KmsUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it("200인데 plaintext가 없으면 다시 부르지 않는다", async () => {
    const { calls, request } = sequenceRequest([{ status: 200, data: {} }]);

    expect(await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }))).toBeInstanceOf(
      KmsUnavailableError,
    );
    expect(calls).toHaveLength(1);
  });

  it("대기는 지수 백오프 — 첫 실패 뒤 500ms, 둘째 실패 뒤 1000ms", async () => {
    const { calls, request } = sequenceRequest([{ status: 503 }]);

    const outcome = decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    expect(await outcome).toBeInstanceOf(KmsUnavailableError);
  });

  it("시도마다 남는 kms.decrypt_failed 로그에 키 이름 · 암호문이 없다", async () => {
    const { request } = sequenceRequest([{ status: 503 }]);

    await settle(decryptWithKms({ keyName: KEY_NAME, ciphertext: "QUJD", request }));

    const lines = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("kms.decrypt_failed"));
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).not.toContain(KEY_NAME);
      expect(line).not.toContain("QUJD");
    }
  });
});
