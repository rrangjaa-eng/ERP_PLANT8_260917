import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  createAuthedRequest,
  createGcsObjectClient,
  GcsObjectExistsError,
  GcsUnavailableError,
  type GcsRequest,
  type GcsRequestInit,
} from "@/lib/gcp/gcs";

// 04.3-05 Task 1 — GCS JSON API 어댑터. 네트워크는 쓰지 않는다: 어댑터가 받는
// request 함수를 가짜로 주입해 (메서드, URL, 헤더, 본문)을 기록하고 상태 코드를
// 돌려준다(cloud-sql-admin.ts의 options.list 주입과 같은 결).

const KEY = "signatures/e1/w1-u.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeRequest(response: { status: number; data?: Buffer } | Error) {
  const calls: GcsRequestInit[] = [];
  const request: GcsRequest = (init) => {
    calls.push(init);
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response);
  };
  return { calls, request };
}

let logSpy: MockInstance<typeof console.log>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("createGcsObjectClient.putObject", () => {
  it("simple upload 한 번 — URL에 uploadType=media · 인코딩한 이름 · ifGenerationMatch=0, 헤더 Content-Type, 본문 = PNG", async () => {
    const { calls, request } = fakeRequest({ status: 200 });
    const client = createGcsObjectClient({ bucket: "b", request });

    await client.putObject(KEY, PNG, "image/png");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      "https://storage.googleapis.com/upload/storage/v1/b/b/o?uploadType=media&name=signatures%2Fe1%2Fw1-u.png&ifGenerationMatch=0",
    );
    expect(calls[0]?.headers).toEqual({ "Content-Type": "image/png" });
    expect(calls[0]?.body).toEqual(PNG);
  });

  it("같은 키에 서버가 412를 주면 GcsObjectExistsError — 덮어쓰지 않는다(D-1106)", async () => {
    const { request } = fakeRequest({ status: 412 });
    const client = createGcsObjectClient({ bucket: "b", request });

    await expect(client.putObject(KEY, PNG, "image/png")).rejects.toBeInstanceOf(GcsObjectExistsError);
  });
});

describe("createGcsObjectClient.getObject", () => {
  it("alt=media GET으로 본문 바이트를 Buffer로 돌려준다", async () => {
    const { calls, request } = fakeRequest({ status: 200, data: PNG });
    const client = createGcsObjectClient({ bucket: "b", request });

    const got = await client.getObject(KEY);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "https://storage.googleapis.com/storage/v1/b/b/o/signatures%2Fe1%2Fw1-u.png?alt=media",
    );
    expect(Buffer.isBuffer(got)).toBe(true);
    expect(got).toEqual(PNG);
  });

  it("404면 null", async () => {
    const { request } = fakeRequest({ status: 404 });
    const client = createGcsObjectClient({ bucket: "b", request });

    await expect(client.getObject(KEY)).resolves.toBeNull();
  });
});

describe("createGcsObjectClient.deleteObject", () => {
  it("DELETE 한 번, 204면 성공", async () => {
    const { calls, request } = fakeRequest({ status: 204 });
    const client = createGcsObjectClient({ bucket: "b", request });

    await expect(client.deleteObject(KEY)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://storage.googleapis.com/storage/v1/b/b/o/signatures%2Fe1%2Fw1-u.png");
  });

  it("404면 성공(이미 지워짐 — 파기 재실행이 안전하다)", async () => {
    const { request } = fakeRequest({ status: 404 });
    const client = createGcsObjectClient({ bucket: "b", request });

    await expect(client.deleteObject(KEY)).resolves.toBeUndefined();
  });
});

describe("실패 → GcsUnavailableError(키·버킷·본문 없이)", () => {
  const BUCKET = "secret-bucket-name";

  function loggedText(): string {
    return logSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
  }

  it.each([
    ["put 503", "put", { status: 503 }],
    ["get 500", "get", { status: 500 }],
    ["delete 502", "delete", { status: 502 }],
    ["get 403", "get", { status: 403 }],
    ["put 네트워크 오류", "put", new Error(`connect ECONNREFUSED https://storage.googleapis.com/b/${BUCKET}/o/${KEY}`)],
    ["get 시간 초과", "get", new Error(`timeout of 10000ms exceeded for ${KEY}`)],
  ] as const)("%s", async (_name, op, response) => {
    const { request } = fakeRequest(response instanceof Error ? response : { ...response });
    const client = createGcsObjectClient({ bucket: BUCKET, request });

    const call =
      op === "put"
        ? client.putObject(KEY, PNG, "image/png")
        : op === "get"
          ? client.getObject(KEY)
          : client.deleteObject(KEY);
    const error = await call.then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(GcsUnavailableError);
    const message = (error as Error).message;
    expect(message).toContain(op);
    expect(message).not.toContain(KEY);
    expect(message).not.toContain("w1-u");
    expect(message).not.toContain(BUCKET);

    const logged = loggedText();
    expect(logged).toContain("gcs.request_failed");
    expect(logged).toContain(op);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("w1-u");
    expect(logged).not.toContain(BUCKET);
  });

  it("5xx 오류 메시지·로그에 상태 코드가 있다", async () => {
    const { request } = fakeRequest({ status: 503 });
    const client = createGcsObjectClient({ bucket: BUCKET, request });

    await expect(client.getObject(KEY)).rejects.toThrow(/503/);
    const entry = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ event: "gcs.request_failed", op: "get", status: 503 });
    expect(Object.keys(entry).sort()).toEqual(["event", "message", "op", "severity", "status", "time"]);
  });
});

describe("createAuthedRequest — 성공한 인증 클라이언트만 재사용(E3-26)", () => {
  type Recorded = Record<string, unknown>;

  function fakeAuthClient(recorded: Recorded[]) {
    return {
      request<T>(opts: Recorded): Promise<{ status: number; data: T }> {
        recorded.push(opts);
        return Promise.resolve({ status: 200, data: new ArrayBuffer(0) as T });
      },
    };
  }

  const init: GcsRequestInit = {
    op: "get",
    method: "GET",
    url: "https://storage.googleapis.com/storage/v1/b/b/o/x?alt=media",
  };

  it("첫 만들기 거부 → 그 호출만 GcsUnavailableError, 다음 호출이 다시 만들고 성공 뒤에는 재생성하지 않는다", async () => {
    const recorded: Recorded[] = [];
    let loads = 0;
    const loadAuthClient = () => {
      loads += 1;
      if (loads === 1) return Promise.reject(new Error("metadata server unavailable"));
      return Promise.resolve(fakeAuthClient(recorded));
    };
    const request = createAuthedRequest(loadAuthClient);

    const first = await request(init).then(
      () => null,
      (e: unknown) => e,
    );
    expect(first).toBeInstanceOf(GcsUnavailableError);
    expect((first as Error).message).toContain("get");
    expect((first as Error).message).toContain("auth");

    await expect(request(init)).resolves.toMatchObject({ status: 200 });
    await expect(request(init)).resolves.toMatchObject({ status: 200 });
    expect(loads).toBe(2);
    expect(recorded).toHaveLength(2);
  });

  it("같은 순간의 호출들은 만들기 하나를 함께 기다린다", async () => {
    const recorded: Recorded[] = [];
    let loads = 0;
    const request = createAuthedRequest(() => {
      loads += 1;
      return Promise.resolve(fakeAuthClient(recorded));
    });

    await Promise.all([request(init), request(init), request(init)]);
    expect(loads).toBe(1);
    expect(recorded).toHaveLength(3);
  });

  it("라이브러리에 시간 초과 10초 · 바이트 응답 · 상태 판정 열기(4xx에 던지지 않음)를 넘긴다", async () => {
    const recorded: Recorded[] = [];
    const request = createAuthedRequest(() => Promise.resolve(fakeAuthClient(recorded)));

    await request({ ...init, op: "put", method: "POST", headers: { "Content-Type": "image/png" }, body: PNG });

    const opts = recorded[0] ?? {};
    expect(opts).toMatchObject({
      method: "POST",
      url: init.url,
      headers: { "Content-Type": "image/png" },
      data: PNG,
      responseType: "arraybuffer",
      timeout: 10_000,
    });
    const validateStatus = opts.validateStatus as (s: number) => boolean;
    expect(validateStatus(404)).toBe(true);
    expect(validateStatus(412)).toBe(true);
    expect(validateStatus(503)).toBe(true);
  });
});
