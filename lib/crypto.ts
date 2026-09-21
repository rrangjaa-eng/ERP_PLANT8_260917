// lib/crypto.ts — Node 내장 crypto만 사용(신규 의존성 0, 03-RESEARCH.md Code
// Examples 1 실측 그대로). 인자와 반환값을 lib/log.ts에 절대 넘기지 않는다 —
// 오류 메시지에도 평문·암호문·키를 담지 않는다(무엇이 잘못됐는지만 말한다).
//
// 03-06 Task 1 결정: 직렬화 형식은 `v1:<iv>:<tag>:<ciphertext>`(콜론 구분,
// 뒤 세 조각은 각각 base64). 키는 base64 32바이트. 키가 없거나 길이가 틀리면
// 즉시 예외(fail-closed) — 평문 저장이나 빈 값 통과로 떨어지지 않는다. 키
// 회전은 새 버전 키를 추가하고 옛 키를 남긴다 — 복호화는 접두어의 버전으로
// 키를 고르므로 v1·v2가 동시에 있어도 둘 다 복호화된다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 권장 길이

// aes-256-gcm 키 길이(바이트). scripts/deploy.sh가 app-data-key-v1을 최초
// 생성할 때 이 값과 일치하는 seed byte 수로 openssl rand를 호출해야 한다 —
// 어긋나면 keyFor()가 매번 InvalidEncryptionKeyLengthError로 막는다
// (test/unit/deploy/app-data-key-length.test.ts가 두 소스를 대조한다).
export const APP_DATA_KEY_BYTES = 32;

type KeyVersion = "v1" | "v2";
const KNOWN_VERSIONS: readonly KeyVersion[] = ["v1", "v2"];

function isKeyVersion(value: string): value is KeyVersion {
  return (KNOWN_VERSIONS as readonly string[]).includes(value);
}

// 키가 없으면 즉시 throw — Phase 1 계약(lib/env.ts는 선택 문자열)이 앱을 띄우는
// 것과, 이 함수가 저장을 막는 것은 서로 다른 계약이다.
export class MissingEncryptionKeyError extends Error {}
export class InvalidEncryptionKeyLengthError extends Error {}
export class UnknownEncryptionKeyVersionError extends Error {}
export class MalformedCiphertextError extends Error {}

function rawKeyFor(version: KeyVersion): string | undefined {
  return version === "v1" ? env.APP_DATA_KEY_v1 : env.APP_DATA_KEY_v2;
}

function keyFor(version: KeyVersion): Buffer {
  const raw = rawKeyFor(version);
  if (!raw) {
    throw new MissingEncryptionKeyError(`암호화 키가 설정되지 않았습니다: APP_DATA_KEY_${version}`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== APP_DATA_KEY_BYTES) {
    throw new InvalidEncryptionKeyLengthError(
      `APP_DATA_KEY_${version}의 길이가 올바르지 않습니다 — base64로 인코딩된 32바이트여야 합니다.`,
    );
  }
  return key;
}

// 회전 중에는 두 키가 동시에 존재한다 — 새 암호화는 항상 설정된 가장 높은
// 버전을 쓴다.
function highestAvailableVersion(): KeyVersion {
  return env.APP_DATA_KEY_v2 ? "v2" : "v1";
}

export function encrypt(plaintext: string): string {
  const version = highestAvailableVersion();
  const key = keyFor(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(stored: string): string {
  const parts = stored.split(":");
  const [version, ivB64, tagB64, dataB64] = parts;
  if (parts.length !== 4 || version === undefined || ivB64 === undefined || tagB64 === undefined || dataB64 === undefined) {
    throw new MalformedCiphertextError("암호문 형식이 올바르지 않습니다 — 조각 수가 맞지 않습니다.");
  }
  if (!isKeyVersion(version)) {
    throw new UnknownEncryptionKeyVersionError(`알 수 없는 키 버전입니다: ${version}`);
  }
  const key = keyFor(version);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// 마스킹 표시 순수 함수 — 뒤 4자리가 없으면 빈 문자열(없는 계좌번호에 `****`를
// 그려 있는 것처럼 보이게 하지 않는다).
export function maskTail4(last4: string | null | undefined): string {
  if (!last4) return "";
  return `****-**-${last4}`;
}
