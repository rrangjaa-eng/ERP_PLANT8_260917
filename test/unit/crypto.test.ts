import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Task 1 결정 ①·②·③·④를 단위 테스트로 고정한다 — 직렬화 형식(v1:<iv>:<tag>:<ciphertext>),
// 키 base64 32바이트, fail-closed, v1·v2 혼재 복호화. lib/crypto.ts가 모듈 최상위에서
// lib/env.ts의 env를 읽으므로, 매 테스트가 다른 키 조합을 쓰려면 vi.resetModules() 뒤
// 동적 import로 다시 로드해야 한다(test/unit/env.test.ts와 같은 패턴).

const VALID_KEY_V1 = Buffer.alloc(32, 1).toString("base64");
const VALID_KEY_V2 = Buffer.alloc(32, 2).toString("base64");

let savedV1: string | undefined;
let savedV2: string | undefined;

beforeEach(() => {
  savedV1 = process.env.APP_DATA_KEY_v1;
  savedV2 = process.env.APP_DATA_KEY_v2;
  delete process.env.APP_DATA_KEY_v1;
  delete process.env.APP_DATA_KEY_v2;
  vi.resetModules();
});

afterEach(() => {
  if (savedV1 === undefined) delete process.env.APP_DATA_KEY_v1;
  else process.env.APP_DATA_KEY_v1 = savedV1;
  if (savedV2 === undefined) delete process.env.APP_DATA_KEY_v2;
  else process.env.APP_DATA_KEY_v2 = savedV2;
  vi.resetModules();
});

async function loadCrypto() {
  return import("@/lib/crypto");
}

describe("lib/crypto", () => {
  it("v1 키만 있을 때 암호화 결과가 v1: 접두어와 콜론으로 나뉜 네 조각이다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt } = await loadCrypto();

    const stored = encrypt("1234567890");
    const parts = stored.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("같은 평문을 두 번 암호화하면 결과 문자열이 다르지만 복호화 결과는 같다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt, decrypt } = await loadCrypto();

    const a = encrypt("계좌번호-1234");
    const b = encrypt("계좌번호-1234");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("계좌번호-1234");
    expect(decrypt(b)).toBe("계좌번호-1234");
  });

  it("키가 설정되지 않았으면 암호화가 즉시 예외를 던진다", async () => {
    const { encrypt } = await loadCrypto();
    expect(() => encrypt("x")).toThrow();
  });

  it("키가 설정되지 않았으면 복호화가 즉시 예외를 던진다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt } = await loadCrypto();
    const stored = encrypt("x");

    vi.resetModules();
    delete process.env.APP_DATA_KEY_v1;
    const { decrypt } = await loadCrypto();
    expect(() => decrypt(stored)).toThrow();
  });

  // lib/env.ts가 부팅 시점에 같은 길이 검사를 먼저 하므로(03-VERIFICATION 사람
  // 판정 2 해소), 길이가 틀린 키는 encrypt()에 닿기 전 모듈 로드에서 키 이름과
  // 함께 거부된다. keyFor()의 검사는 두 번째 방어선으로 남는다.
  it("키 길이가 32바이트가 아니면 모듈 로드에서 즉시 예외를 던지며 메시지가 키 이름을 가리킨다", async () => {
    process.env.APP_DATA_KEY_v1 = Buffer.alloc(16, 1).toString("base64");
    await expect(loadCrypto()).rejects.toThrow(/APP_DATA_KEY_v1/);
  });

  it("암호문 조각을 한 글자라도 바꾸면 복호화가 인증 태그 검증에서 실패한다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt, decrypt } = await loadCrypto();
    const stored = encrypt("변조테스트");
    const parts = stored.split(":");
    const lastPart = parts[3] ?? "";
    // ciphertext(마지막 조각)의 첫 글자를 다른 base64 글자로 바꾼다.
    const lastChar = lastPart[0];
    const tamperedLastPart = (lastChar === "A" ? "B" : "A") + lastPart.slice(1);
    const tampered = [...parts.slice(0, 3), tamperedLastPart];
    expect(() => decrypt(tampered.join(":"))).toThrow();
  });

  it("알 수 없는 버전 접두어면 복호화가 그 버전을 가리키는 예외를 던진다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { decrypt } = await loadCrypto();
    expect(() => decrypt("v9:aaaa:bbbb:cccc")).toThrow(/v9/);
  });

  it("두 번째 키가 설정된 상태에서 첫 번째 버전으로 암호화된 값이 여전히 복호화된다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt } = await loadCrypto();
    const v1Stored = encrypt("과거값");

    vi.resetModules();
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    process.env.APP_DATA_KEY_v2 = VALID_KEY_V2;
    const { decrypt } = await loadCrypto();
    expect(decrypt(v1Stored)).toBe("과거값");
  });

  it("두 번째 키가 설정되면 새 암호화가 두 번째 버전 접두어를 쓴다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    process.env.APP_DATA_KEY_v2 = VALID_KEY_V2;
    const { encrypt } = await loadCrypto();

    const stored = encrypt("새값");
    expect(stored.startsWith("v2:")).toBe(true);
  });

  it("v1·v2 혼재 복호화 — 두 버전으로 각각 암호화한 값이 같은 프로세스에서 모두 복호화된다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const { encrypt: encryptV1 } = await loadCrypto();
    const v1Stored = encryptV1("v1값");

    vi.resetModules();
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    process.env.APP_DATA_KEY_v2 = VALID_KEY_V2;
    const { encrypt, decrypt } = await loadCrypto();
    const v2Stored = encrypt("v2값");

    expect(v2Stored.startsWith("v2:")).toBe(true);
    expect(decrypt(v1Stored)).toBe("v1값");
    expect(decrypt(v2Stored)).toBe("v2값");
  });
});

describe("lib/crypto의 maskTail4", () => {
  it("뒤 4자리가 있으면 마스킹 문자열을 만든다", async () => {
    const { maskTail4 } = await loadCrypto();
    expect(maskTail4("1234")).toBe("****-**-1234");
  });

  it("뒤 4자리가 비어 있으면 빈 문자열을 돌려준다", async () => {
    const { maskTail4 } = await loadCrypto();
    expect(maskTail4("")).toBe("");
    expect(maskTail4(null)).toBe("");
    expect(maskTail4(undefined)).toBe("");
  });
});
