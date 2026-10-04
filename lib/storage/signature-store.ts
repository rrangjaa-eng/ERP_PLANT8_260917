import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@/lib/env";
import { createGcsObjectClient, type GcsRequest } from "@/lib/gcp/gcs";

// 04.3-02 Task 2 ⑪ — 서명 이미지 저장소 포트. 키는 `signatures/` 접두어 +
// 허용 문자만 받아 경로 순회를 막는다. 드라이버는 환경으로 고른다 — 로컬은
// 가짜 드라이버(개발·테스트), 그 밖은 GCS 드라이버(04.3-05), 버킷 설정이
// 없으면 실패로 닫힌다(서명 없이 제출이 저장되는 길이 없다).
export type SignatureStore = {
  put(key: string, png: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
};

export class InvalidSignatureKeyError extends Error {}
export class SignatureStoreNotConfiguredError extends Error {}

const KEY_PATTERN = /^signatures\/[A-Za-z0-9._/-]+$/;

function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) {
    throw new InvalidSignatureKeyError("서명 객체 키 형식 오류");
  }
}

function localDriver(): SignatureStore {
  const root = join(tmpdir(), "plant8-cert-signatures");
  return {
    put(key, png) {
      assertValidKey(key);
      const path = join(root, key);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, png);
      return Promise.resolve();
    },
    get(key) {
      assertValidKey(key);
      const path = join(root, key);
      return Promise.resolve(existsSync(path) ? readFileSync(path) : null);
    },
    delete(key) {
      assertValidKey(key);
      const path = join(root, key);
      if (existsSync(path)) rmSync(path);
      return Promise.resolve();
    },
  };
}

function gcsDriver(bucket: string, request: GcsRequest | undefined): SignatureStore {
  const client = createGcsObjectClient({ bucket, request });
  return {
    async put(key, png) {
      assertValidKey(key);
      await client.putObject(key, png, "image/png");
    },
    async get(key) {
      assertValidKey(key);
      return client.getObject(key);
    },
    async delete(key) {
      assertValidKey(key);
      await client.deleteObject(key);
    },
  };
}

let cached: SignatureStore | null = null;

// deps.request는 테스트가 GCS 드라이버에 가짜 요청 함수를 넣는 자리다 — 주입한
// 저장소는 캐시하지 않는다.
export function getSignatureStore(deps?: { request?: GcsRequest }): SignatureStore {
  if (cached && !deps) return cached;
  let store: SignatureStore;
  if (env.APP_ENV === "local") {
    store = localDriver();
  } else if (env.CERT_SIGNATURE_BUCKET) {
    store = gcsDriver(env.CERT_SIGNATURE_BUCKET, deps?.request);
  } else {
    throw new SignatureStoreNotConfiguredError("서명 저장소 설정 없음: CERT_SIGNATURE_BUCKET");
  }
  if (!deps) cached = store;
  return store;
}
