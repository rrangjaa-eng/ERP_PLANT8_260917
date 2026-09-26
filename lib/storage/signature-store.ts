import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@/lib/env";

// 04.3-02 Task 2 ⑪ — 서명 이미지 저장소 포트. 키는 `signatures/` 접두어 +
// 허용 문자만 받아 경로 순회를 막는다. 드라이버는 환경으로 고른다 — 이
// 태스크는 로컬 드라이버(개발·테스트)만 만든다. 그 밖의 환경은 실패로
// 닫힌다(04.3-05가 GCS 드라이버를 더한다).
export type SignatureStore = {
  put(key: string, png: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
};

export class InvalidSignatureKeyError extends Error {}
export class UnsupportedSignatureStoreDriverError extends Error {}

const KEY_PATTERN = /^signatures\/[A-Za-z0-9._/-]+$/;

function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) {
    throw new InvalidSignatureKeyError(`서명 객체 키 형식이 올바르지 않습니다: ${key}`);
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

let cached: SignatureStore | null = null;

export function getSignatureStore(): SignatureStore {
  if (cached) return cached;
  if (env.APP_ENV === "local") {
    cached = localDriver();
    return cached;
  }
  throw new UnsupportedSignatureStoreDriverError(
    `APP_ENV '${env.APP_ENV}'용 서명 저장소 드라이버가 없습니다 — 04.3-05가 GCS 드라이버를 더한다.`,
  );
}
