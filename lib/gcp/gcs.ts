import { GoogleAuth } from "google-auth-library";
import { log } from "@/lib/log";

// 04.3-05 — GCS JSON API 어댑터(서명 이미지 전용). SDK 없이 이미 있는
// google-auth-library로 REST를 부른다. 부르는 연산은 COVERAGE.md의 INTEGRATE
// 셋뿐이다: objects.insert(simple upload) · objects.get(alt=media) · objects.delete.
// 오류 메시지·로그에는 연산 이름과 상태 코드만 — 객체 키(행사·당첨자 id)·버킷
// 이름·본문은 넣지 않는다(lib/crypto.ts와 같은 원칙).

export type GcsOp = "put" | "get" | "delete" | "meta" | "move" | "retain";

export type GcsRequestInit = {
  op: GcsOp;
  method: "POST" | "GET" | "DELETE" | "PATCH";
  url: string;
  headers?: Record<string, string>;
  body?: Buffer;
};

export type GcsResponse = { status: number; data?: Buffer };

export type GcsRequest = (init: GcsRequestInit) => Promise<GcsResponse>;

type AuthClientLike = {
  request<T>(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    data?: Buffer;
    responseType: "arraybuffer";
    timeout: number;
    validateStatus: (status: number) => boolean;
  }): Promise<{ status: number; data: T }>;
};

export class GcsUnavailableError extends Error {
  constructor(op: GcsOp, cause: number | "network" | "auth") {
    super(`GCS ${op} 실패: ${cause}`);
  }
}

export class GcsObjectExistsError extends Error {
  constructor() {
    super("GCS put 실패: 이미 있는 객체(412)");
  }
}

const TIMEOUT_MS = 10_000;

// E3-26 — 만들기에 성공한 클라이언트만 재사용한다. 만드는 중인 Promise는 같은
// 순간의 호출들이 함께 기다리되, 거부되면 비워 다음 호출이 다시 만든다(거부된
// Promise를 붙들면 기동 직후 한 번의 장애가 인스턴스 수명 내내 재생된다).
export function createAuthedRequest(loadAuthClient: () => Promise<AuthClientLike>): GcsRequest {
  let pending: Promise<AuthClientLike> | null = null;
  return async ({ op, method, url, headers, body }) => {
    if (!pending) {
      const loading = loadAuthClient();
      pending = loading;
      loading.catch(() => {
        if (pending === loading) pending = null;
      });
    }
    let client: AuthClientLike;
    try {
      client = await pending;
    } catch {
      throw new GcsUnavailableError(op, "auth");
    }
    const res = await client.request<ArrayBuffer>({
      method,
      url,
      headers,
      data: body,
      responseType: "arraybuffer",
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    return { status: res.status, data: Buffer.from(res.data) };
  };
}

const defaultRequest = createAuthedRequest(() =>
  new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] }).getClient(),
);

const API = "https://storage.googleapis.com";

export function createGcsObjectClient({ bucket, request = defaultRequest }: { bucket: string; request?: GcsRequest }) {
  const b = encodeURIComponent(bucket);

  async function send(init: GcsRequestInit): Promise<GcsResponse> {
    try {
      return await request(init);
    } catch (e) {
      const cause = e instanceof GcsUnavailableError ? "auth" : "network";
      log.warn("gcs.request_failed", { op: init.op, status: cause });
      throw new GcsUnavailableError(init.op, cause);
    }
  }

  function fail(op: GcsOp, status: number): never {
    log.warn("gcs.request_failed", { op, status });
    throw new GcsUnavailableError(op, status);
  }

  const ok = (status: number) => status >= 200 && status < 300;

  return {
    async putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
      const res = await send({
        op: "put",
        method: "POST",
        url: `${API}/upload/storage/v1/b/${b}/o?uploadType=media&name=${encodeURIComponent(key)}&ifGenerationMatch=0`,
        headers: { "Content-Type": contentType },
        body: bytes,
      });
      if (res.status === 412) throw new GcsObjectExistsError();
      if (!ok(res.status)) fail("put", res.status);
    },

    async getObject(key: string): Promise<Buffer | null> {
      const res = await send({
        op: "get",
        method: "GET",
        url: `${API}/storage/v1/b/${b}/o/${encodeURIComponent(key)}?alt=media`,
      });
      if (res.status === 404) return null;
      if (!ok(res.status)) fail("get", res.status);
      return res.data ?? Buffer.alloc(0);
    },

    async deleteObject(key: string): Promise<void> {
      const res = await send({
        op: "delete",
        method: "DELETE",
        url: `${API}/storage/v1/b/${b}/o/${encodeURIComponent(key)}`,
      });
      if (res.status === 404) return;
      if (!ok(res.status)) fail("delete", res.status);
    },
  };
}
