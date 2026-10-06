import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { env, resolvedStorageDriver } from "@/lib/env";
import { createAuthedRequest, createGcsObjectClient, GcsUnavailableError, type GcsOp, type GcsRequest, type GcsRequestInit, type GcsResponse } from "@/lib/gcp/gcs";
import { buildV4SignedUrl, rfc3986 } from "@/lib/gcp/gcs-v4";
import { log } from "@/lib/log";

// 05-04(EVID-01): 증빙 파일 저장소 포트. 파일 바이트는 서버를 지나지 않는다 — 브라우저가 서명된 PUT 주소로 저장소에
// 직접 올리고, 서버는 메타데이터(크기 · 형식 · 서명에 묶인 sha256)로 다시 확인한 뒤 `incoming/` → `evidence/`로 옮긴다.
// 04.3 서명 이미지 포트(lib/storage/signature-store.ts — put · get · delete)와는 다른 포트다: 증빙은 서명 주소 · 메타데이터
// 재확인 · move · retain이 필요해 그 포트를 넓히지 않는다. gcs 드라이버(05-12)는 lib/gcp/gcs.ts의 인증 요청을 재사용한다.

export type ObjectMetadata = { size: number; contentType: string; sha256: string | null };

export type SignedPut = { url: string; method: "PUT"; headers: Record<string, string> };

export type ObjectStorage = {
  // 서명 조건 = 형식 · 크기 상한 · sha256 메타. 브라우저는 돌려준 헤더를 그대로 보낸다.
  createSignedPut(key: string, opts: { contentType: string; maxBytes: number; sha256: string; expiresSec: number }): Promise<SignedPut>;
  createSignedGet(key: string, opts: { expiresSec: number; filename: string; disposition: "inline" | "attachment" }): Promise<{ url: string }>;
  // 없으면 null.
  getMetadata(key: string): Promise<ObjectMetadata | null>;
  // 원본을 대상으로 복사(대상이 있으면 덮어씀 · 형식 · sha256 메타 유지)한 뒤 원본을 지운다. 원본이 없으면 오류,
  // 원본 삭제의 「없음」은 성공(두 호출이 겹쳐도 안전).
  move(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  // 완료된 `evidence/` 객체의 보존 표식 — 1차 보호는 접두어 분리(수명 주기는 `incoming/`에만)이고 이것은 이중 방어다.
  retain(key: string): Promise<void>;
};

export class ObjectStorageNotConfiguredError extends Error {}

let gcsStorage: ObjectStorage | null = null;

// 환경별 드라이버 선택 — staging · prod(해석 기본값 gcs)는 gcs 드라이버, 로컬 · CI는 로컬 드라이버. 버킷 검사는 부팅이
// 아니라 첫 사용 때다(lib/env.ts 05-04 주석).
export function getObjectStorage(): ObjectStorage {
  if (resolvedStorageDriver(env) !== "gcs") return localStorageFromEnv();
  const bucket = env.GCS_EVIDENCE_BUCKET;
  if (!bucket) throw new ObjectStorageNotConfiguredError("GCS_EVIDENCE_BUCKET 없음 · gcs 증빙 저장소 버킷 미설정");
  // 서명(IAM signBlob)은 iamcredentials 호출이라 cloud-platform 범위가 필요하다 — 저장소 범위 토큰으로는 거부된다.
  gcsStorage ??= createGcsStorage({ bucket, auth: new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }) });
  return gcsStorage;
}

// ── 로컬 · CI 드라이버 ────────────────────────────────────────────────
// 바이트는 저장소 루트의 .data/uploads(키 그대로의 경로) · 메타데이터는 옆 사이드카 `{키}.json`. 서명 주소는 이 앱의
// /api/storage-local/{키}(HMAC-SHA256 — 키는 BETTER_AUTH_SECRET에서 HKDF로 파생)이고 그 라우트는 드라이버가 local일 때만 열린다.
// 키는 서버가 만든 두 꼴만 받는다 — 데이터 디렉터리 밖으로 나가는 경로는 만들 수 없다(T-05-404).

const LOCAL_ROUTE_PREFIX = "/api/storage-local/";
const LOCAL_KEY_SHAPE = /^(incoming|evidence)\/[0-9a-f-]{36}$/;
const SIG_SHAPE = /^[0-9a-f]{64}$/;

export type LocalObjectStorage = ObjectStorage & {
  writeObject(key: string, bytes: Uint8Array, metadata: ObjectMetadata): Promise<void>;
  readObject(key: string): Promise<{ bytes: Buffer; metadata: ObjectMetadata } | null>;
};

type SignedFields =
  | { op: "put"; key: string; exp: number; max: number; ct: string; sha: string }
  | { op: "get"; key: string; exp: number; fn: string; disp: "inline" | "attachment" };

export type LocalSignedCheck =
  | { ok: true; op: "put"; key: string; maxBytes: number; contentType: string; sha256: string }
  | { ok: true; op: "get"; key: string; filename: string; disposition: "inline" | "attachment" }
  | { ok: false; reason: string };

function signingKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "storage-local", 32));
}

function signatureOf(secret: string, fields: SignedFields): string {
  const canonical =
    fields.op === "put"
      ? JSON.stringify([fields.op, fields.key, fields.exp, fields.max, fields.ct, fields.sha])
      : JSON.stringify([fields.op, fields.key, fields.exp, fields.fn, fields.disp]);
  return createHmac("sha256", signingKey(secret)).update(canonical).digest("hex");
}

function signedUrl(secret: string, baseUrl: string, fields: SignedFields): string {
  const params = new URLSearchParams({ op: fields.op, exp: String(fields.exp) });
  if (fields.op === "put") {
    params.set("max", String(fields.max));
    params.set("ct", fields.ct);
    params.set("sha", fields.sha);
  } else {
    params.set("fn", fields.fn);
    params.set("disp", fields.disp);
  }
  params.set("sig", signatureOf(secret, fields));
  return `${baseUrl}${LOCAL_ROUTE_PREFIX}${fields.key}?${params.toString()}`;
}

function assertLocalKey(key: string): void {
  if (!LOCAL_KEY_SHAPE.test(key)) throw new Error("허용되지 않는 저장소 키");
}

function refused(reason: string): LocalSignedCheck {
  return { ok: false, reason };
}

// 순수 검증 — 라우트가 요청마다 부른다. 경로의 키 꼴 · 서명(timingSafeEqual) · 만료 · 메서드, PUT이면 크기 상한 · 형식 ·
// sha256 메타 헤더까지 서명된 값과 맞아야 한다.
export function verifyLocalSignedRequest(
  url: string,
  request: { secret: string; method: "PUT" | "GET"; contentLength?: number; contentType?: string; shaHeader?: string; now: Date },
): LocalSignedCheck {
  if (!request.secret) return refused("no_secret");
  const parsed = new URL(url, "http://local");
  if (!parsed.pathname.startsWith(LOCAL_ROUTE_PREFIX)) return refused("path");
  let key: string;
  try {
    key = decodeURIComponent(parsed.pathname.slice(LOCAL_ROUTE_PREFIX.length));
  } catch {
    // 잘못된 % 이스케이프(URIError) — 키 꼴 밖과 같은 거부(라우트 500이 아니라 403).
    return refused("key");
  }
  if (!LOCAL_KEY_SHAPE.test(key)) return refused("key");
  const query = parsed.searchParams;
  const op = query.get("op");
  const exp = Number(query.get("exp"));
  const sig = query.get("sig") ?? "";
  if ((op === "put" && request.method !== "PUT") || (op === "get" && request.method !== "GET") || (op !== "put" && op !== "get")) return refused("method");
  if (!Number.isInteger(exp) || !SIG_SHAPE.test(sig)) return refused("shape");

  let fields: SignedFields;
  if (op === "put") {
    const max = Number(query.get("max"));
    if (!Number.isInteger(max) || max < 1) return refused("shape");
    fields = { op, key, exp, max, ct: query.get("ct") ?? "", sha: query.get("sha") ?? "" };
  } else {
    const disp = query.get("disp");
    if (disp !== "inline" && disp !== "attachment") return refused("shape");
    fields = { op, key, exp, fn: query.get("fn") ?? "", disp };
  }
  if (!timingSafeEqual(Buffer.from(signatureOf(request.secret, fields), "hex"), Buffer.from(sig, "hex"))) return refused("signature");
  if (Math.floor(request.now.getTime() / 1000) >= exp) return refused("expired");

  if (fields.op === "get") return { ok: true, op: "get", key, filename: fields.fn, disposition: fields.disp };
  const length = request.contentLength;
  if (length === undefined || !Number.isInteger(length) || length < 1 || length > fields.max) return refused("size");
  if (request.contentType !== fields.ct) return refused("content_type");
  if (request.shaHeader !== fields.sha) return refused("sha256");
  return { ok: true, op: "put", key, maxBytes: fields.max, contentType: fields.ct, sha256: fields.sha };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

type Sidecar = ObjectMetadata & { retained?: boolean };

export function createLocalStorage(opts: { secret: string; dataDir: string; baseUrl: string; now?: () => Date }): LocalObjectStorage {
  const now = opts.now ?? (() => new Date());
  const objectPath = (key: string) => path.join(opts.dataDir, key);
  const sidecarPath = (key: string) => `${objectPath(key)}.json`;
  const expiry = (expiresSec: number) => Math.floor(now().getTime() / 1000) + expiresSec;

  async function readSidecar(key: string): Promise<Sidecar | null> {
    try {
      return JSON.parse(await readFile(sidecarPath(key), "utf8")) as Sidecar;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  return {
    createSignedPut(key, put) {
      if (!LOCAL_KEY_SHAPE.test(key)) return Promise.reject(new Error("허용되지 않는 저장소 키"));
      const fields: SignedFields = { op: "put", key, exp: expiry(put.expiresSec), max: put.maxBytes, ct: put.contentType, sha: put.sha256 };
      return Promise.resolve({
        url: signedUrl(opts.secret, opts.baseUrl, fields),
        method: "PUT" as const,
        headers: { "Content-Type": put.contentType, "x-goog-meta-sha256": put.sha256 },
      });
    },

    createSignedGet(key, get) {
      if (!LOCAL_KEY_SHAPE.test(key)) return Promise.reject(new Error("허용되지 않는 저장소 키"));
      const fields: SignedFields = { op: "get", key, exp: expiry(get.expiresSec), fn: get.filename, disp: get.disposition };
      return Promise.resolve({ url: signedUrl(opts.secret, opts.baseUrl, fields) });
    },

    async getMetadata(key) {
      assertLocalKey(key);
      const sidecar = await readSidecar(key);
      return sidecar ? { size: sidecar.size, contentType: sidecar.contentType, sha256: sidecar.sha256 } : null;
    },

    async move(fromKey, toKey) {
      assertLocalKey(fromKey);
      assertLocalKey(toKey);
      await mkdir(path.dirname(objectPath(toKey)), { recursive: true });
      await rename(objectPath(fromKey), objectPath(toKey));
      await rename(sidecarPath(fromKey), sidecarPath(toKey));
    },

    async delete(key) {
      assertLocalKey(key);
      await rm(objectPath(key), { force: true });
      await rm(sidecarPath(key), { force: true });
    },

    // 로컬에는 수명 주기가 없다 — 인터페이스를 맞추는 표식만.
    async retain(key) {
      assertLocalKey(key);
      const sidecar = await readSidecar(key);
      if (!sidecar) throw new Error("보존 표식 대상 객체 없음");
      await writeFile(sidecarPath(key), JSON.stringify({ ...sidecar, retained: true }));
    },

    async writeObject(key, bytes, metadata) {
      assertLocalKey(key);
      await mkdir(path.dirname(objectPath(key)), { recursive: true });
      await writeFile(objectPath(key), bytes);
      await writeFile(sidecarPath(key), JSON.stringify({ size: metadata.size, contentType: metadata.contentType, sha256: metadata.sha256 }));
    },

    async readObject(key) {
      assertLocalKey(key);
      const sidecar = await readSidecar(key);
      if (!sidecar) return null;
      try {
        return { bytes: await readFile(objectPath(key)), metadata: { size: sidecar.size, contentType: sidecar.contentType, sha256: sidecar.sha256 } };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

// 데이터 디렉터리 = 저장소 루트(작업 디렉터리)의 .data/uploads — .gitignore의 `.data/`.
export function localStorageFromEnv(): LocalObjectStorage {
  if (!env.BETTER_AUTH_SECRET) throw new ObjectStorageNotConfiguredError("BETTER_AUTH_SECRET 없음 · 로컬 저장소 서명 키 없음");
  return createLocalStorage({ secret: env.BETTER_AUTH_SECRET, dataDir: path.join(process.cwd(), ".data", "uploads"), baseUrl: "" });
}

// ── gcs 드라이버(05-12) ────────────────────────────────────────────────
// 서명 = auth.sign(Cloud Run 런타임 SA는 개인 키가 없어 IAM signBlob — 런타임 SA 자기 자신의 TokenCreator), REST = 04.3
// GcsRequest(lib/gcp/gcs.ts). 로그 · 오류에는 연산 이름과 상태 코드 · 오류 종류만 — 객체 키 · 버킷 · 이메일 없음.

export type GcsSigner = {
  sign(data: string): Promise<string>;
  getCredentials(): Promise<{ client_email?: string | null }>;
};

const GCS_API = "https://storage.googleapis.com/storage/v1";

// 05-12 스파이크: read_write 범위 토큰으로 retain PATCH(temporaryHold)만 403이었다. 권한 상한은 버킷 IAM(objectUser)이 그대로 정한다.
export const GCS_OBJECT_SCOPE = "https://www.googleapis.com/auth/devstorage.full_control";

const defaultGcsRequest = createAuthedRequest(() => new GoogleAuth({ scopes: [GCS_OBJECT_SCOPE] }).getClient());

function errorReason(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" || typeof code === "number" ? `${error.name}:${code}` : error.name;
}

export function createGcsStorage(opts: {
  bucket: string;
  auth: GcsSigner;
  request?: GcsRequest;
  now?: () => Date;
  log?: { warn(event: string, fields?: Record<string, unknown>): void };
}): ObjectStorage {
  const request = opts.request ?? defaultGcsRequest;
  const now = opts.now ?? (() => new Date());
  const logger = opts.log ?? log;
  const b = encodeURIComponent(opts.bucket);
  const objectUrl = (key: string) => `${GCS_API}/b/${b}/o/${encodeURIComponent(key)}`;
  const objects = createGcsObjectClient({ bucket: opts.bucket, request });

  async function signUrl(op: "put" | "get", input: { method: "PUT" | "GET"; objectKey: string; headers: Record<string, string>; query: Record<string, string>; expiresSec: number }) {
    try {
      const { client_email: email } = await opts.auth.getCredentials();
      if (!email) throw new Error("서명 계정 이메일 없음");
      return await buildV4SignedUrl({ ...input, bucket: opts.bucket, credentialEmail: email, now: now(), sign: (data) => opts.auth.sign(data) });
    } catch (error) {
      logger.warn("storage.sign_failed", { op, reason: errorReason(error) });
      throw error;
    }
  }

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
  const gcsErrorMessage = (res: GcsResponse): string => {
    try {
      return parse<{ error?: { message?: string } }>(res).error?.message?.slice(0, 200) ?? "";
    } catch {
      return "";
    }
  };
  const parse = <T>(res: GcsResponse): T => JSON.parse((res.data ?? Buffer.alloc(0)).toString("utf8") || "{}") as T;

  return {
    async createSignedPut(key, put) {
      const headers = { "Content-Type": put.contentType, "x-goog-content-length-range": `1,${put.maxBytes}`, "x-goog-meta-sha256": put.sha256 };
      const signed = await signUrl("put", { method: "PUT", objectKey: key, headers, query: {}, expiresSec: put.expiresSec });
      return { url: signed.url, method: "PUT" as const, headers: signed.headers };
    },

    async createSignedGet(key, get) {
      const disposition = `${get.disposition}; filename*=UTF-8''${rfc3986(get.filename)}`;
      const signed = await signUrl("get", { method: "GET", objectKey: key, headers: {}, query: { "response-content-disposition": disposition }, expiresSec: get.expiresSec });
      return { url: signed.url };
    },

    async getMetadata(key) {
      const res = await send({ op: "meta", method: "GET", url: objectUrl(key) });
      if (res.status === 404) return null;
      if (!ok(res.status)) fail("meta", res.status);
      const body = parse<{ size?: string; contentType?: string; metadata?: { sha256?: string } }>(res);
      return { size: Number(body.size), contentType: body.contentType ?? "", sha256: body.metadata?.sha256 ?? null };
    },

    // 같은 버킷 안 재작성(형식 · 사용자 메타가 따라간다) → 원본 삭제. 재작성이 실패하면 원본을 지우지 않는다 — 원본은
    // incoming/에 남아 수명 주기가 7일 뒤 지운다(T-05-1208).
    async move(fromKey, toKey) {
      const rewriteUrl = `${objectUrl(fromKey)}/rewriteTo/b/${b}/o/${encodeURIComponent(toKey)}`;
      let token: string | undefined;
      for (;;) {
        const res = await send({ op: "move", method: "POST", url: token ? `${rewriteUrl}?rewriteToken=${encodeURIComponent(token)}` : rewriteUrl });
        if (!ok(res.status)) fail("move", res.status);
        const body = parse<{ done?: boolean; rewriteToken?: string }>(res);
        if (body.done) break;
        if (!body.rewriteToken) fail("move", res.status);
        token = body.rewriteToken;
      }
      await objects.deleteObject(fromKey);
    },

    delete(key) {
      return objects.deleteObject(key);
    },

    async retain(key) {
      const res = await send({
        op: "retain",
        method: "PATCH",
        url: objectUrl(key),
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ temporaryHold: true })),
      });
      if (!ok(res.status)) {
        logger.warn("gcs.request_failed", { op: "retain", status: res.status, reason: gcsErrorMessage(res) });
        throw new GcsUnavailableError("retain", res.status);
      }
    },
  };
}
