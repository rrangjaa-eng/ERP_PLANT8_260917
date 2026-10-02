// lib/crypto.ts — Node 내장 crypto만 사용(신규 의존성 0, 03-RESEARCH.md Code
// Examples 1 실측 그대로). 인자와 반환값을 lib/log.ts에 절대 넘기지 않는다 —
// 오류 메시지에도 평문·암호문·키를 담지 않는다(무엇이 잘못됐는지만 말한다).
//
// 03-06 Task 1 결정: 직렬화 형식은 `v1:<iv>:<tag>:<ciphertext>`(콜론 구분,
// 뒤 세 조각은 각각 base64). 키는 base64 32바이트. 키가 없거나 길이가 틀리면
// 즉시 예외(fail-closed) — 평문 저장이나 빈 값 통과로 떨어지지 않는다. 키
// 회전은 새 버전 키를 추가하고 옛 키를 남긴다 — 복호화는 접두어의 버전으로
// 키를 고르므로 v1·v2가 동시에 있어도 둘 다 복호화된다.
//
// 04.3-08 KMS 봉투: 스테이징·프로덕션은 데이터 키를 평문이 아니라 Cloud KMS로 감싼
// APP_DATA_KEY_{v}_WRAPPED로 받고, 기동 때 loadDataKeys()가 한 번 풀어 프로세스 전역
// 칸(globalThis[Symbol.for("plant8.appDataKeys")])에 둔다 — encrypt/decrypt는 그대로 동기.
// 인코딩 계약: KMS 평문 = 평문 시크릿과 같은 base64 텍스트, 감싼 값 = KMS 암호문의 한 줄
// base64. 환경 변수와 KMS 두 경로가 같은 해석 함수(parseKeyText)를 쓴다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 권장 길이

// aes-256-gcm 키 길이(바이트). scripts/deploy.sh가 app-data-key-v1을 최초
// 생성할 때 이 값과 일치하는 seed byte 수로 openssl rand를 호출해야 한다 —
// 어긋나면 keyFor()가 매번 InvalidEncryptionKeyLengthError로 막는다
// (test/unit/deploy/app-data-key-length.test.ts가 두 소스를 대조한다).
export const APP_DATA_KEY_BYTES = 32;

export type KeyVersion = "v1" | "v2";
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

function wrappedKeyFor(version: KeyVersion): string | undefined {
  return version === "v1" ? env.APP_DATA_KEY_v1_WRAPPED : env.APP_DATA_KEY_v2_WRAPPED;
}

// 키 텍스트 해석은 여기 한 곳 — 앞뒤 공백·개행 제거 → base64 풀기 → 32바이트 확인.
function parseKeyText(text: string, version: KeyVersion): Buffer {
  const key = Buffer.from(text.trim(), "base64");
  if (key.length !== APP_DATA_KEY_BYTES) {
    throw new InvalidEncryptionKeyLengthError(
      `APP_DATA_KEY_${version}의 길이가 올바르지 않습니다 — base64로 인코딩된 32바이트여야 합니다.`,
    );
  }
  return key;
}

// RB-P1 — Next 16은 instrumentation의 register()와 라우트·RSC·서버 액션을 서로 다른
// 모듈 인스턴스로 부를 수 있다. 모듈 변수가 아니라 프로세스 전역 등록부(Symbol.for)에
// 두어야 register()가 푼 키를 요청 경로의 인스턴스가 본다.
const DATA_KEY_SLOT = Symbol.for("plant8.appDataKeys");
type DataKeySlot = Record<symbol, Map<KeyVersion, Buffer> | undefined>;

function dataKeySlot(): DataKeySlot {
  return globalThis;
}

function unwrappedKeyFor(version: KeyVersion): Buffer | undefined {
  return dataKeySlot()[DATA_KEY_SLOT]?.get(version);
}

function keyFor(version: KeyVersion): Buffer {
  const unwrapped = unwrappedKeyFor(version);
  if (unwrapped) return unwrapped;
  if (wrappedKeyFor(version)) {
    throw new MissingEncryptionKeyError(`키를 아직 풀지 않았습니다: APP_DATA_KEY_${version}`);
  }
  const raw = rawKeyFor(version);
  if (!raw) {
    throw new MissingEncryptionKeyError(`암호화 키가 설정되지 않았습니다: APP_DATA_KEY_${version}`);
  }
  return parseKeyText(raw, version);
}

export type UnwrapDataKey = (input: { keyName: string; ciphertext: string }) => Promise<Buffer>;

// 감싼 변수가 있는 버전만 KMS로 풀어 새 Map을 다 채운 뒤 한 번에 칸에 넣는다 — 도중에
// 던지면 칸은 그대로다. KMS 어댑터는 여기서만 동적으로 불러온다(E3-11 — 이 파일은
// 클라이언트 부품도 import하므로 정적 import면 google-auth-library가 번들로 끌려간다).
export async function loadDataKeys(deps: { unwrap?: UnwrapDataKey } = {}): Promise<void> {
  const wrapped = KNOWN_VERSIONS.flatMap((version) => {
    const ciphertext = wrappedKeyFor(version);
    return ciphertext ? [{ version, ciphertext }] : [];
  });
  if (wrapped.length === 0) return;
  const keyName = env.APP_DATA_KEY_KMS_KEY;
  if (!keyName) {
    throw new MissingEncryptionKeyError("KMS 키 이름이 설정되지 않았습니다: APP_DATA_KEY_KMS_KEY");
  }
  const unwrap = deps.unwrap ?? (await import("@/lib/gcp/kms")).decryptWithKms;
  const keys = new Map<KeyVersion, Buffer>();
  for (const { version, ciphertext } of wrapped) {
    const plaintext = await unwrap({ keyName, ciphertext });
    keys.set(version, parseKeyText(plaintext.toString("utf8"), version));
  }
  dataKeySlot()[DATA_KEY_SLOT] = keys;
}

// 회전 CLI(scripts/rotate-key.ts)도 이 두 판정을 쓴다.
export function isKeyVersionUsable(version: KeyVersion): boolean {
  return Boolean(rawKeyFor(version)) || unwrappedKeyFor(version) !== undefined;
}

// 회전 중에는 두 키가 동시에 존재한다 — 새 암호화는 항상 설정된 가장 높은
// 버전을 쓴다(감싼 변수만 있는 v2도 센다 — 아직 안 풀렸으면 keyFor가 실패로 닫힌다).
export function newestKeyVersion(): KeyVersion {
  return isKeyVersionUsable("v2") || wrappedKeyFor("v2") ? "v2" : "v1";
}

export function encrypt(plaintext: string): string {
  const version = newestKeyVersion();
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
