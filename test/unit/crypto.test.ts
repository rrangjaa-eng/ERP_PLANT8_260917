import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Task 1 결정 ①·②·③·④를 단위 테스트로 고정한다 — 직렬화 형식(v1:<iv>:<tag>:<ciphertext>),
// 키 base64 32바이트, fail-closed, v1·v2 혼재 복호화. lib/crypto.ts가 모듈 최상위에서
// lib/env.ts의 env를 읽으므로, 매 테스트가 다른 키 조합을 쓰려면 vi.resetModules() 뒤
// 동적 import로 다시 로드해야 한다(test/unit/env.test.ts와 같은 패턴).

const VALID_KEY_V1 = Buffer.alloc(32, 1).toString("base64");
const VALID_KEY_V2 = Buffer.alloc(32, 2).toString("base64");

// 04.3-08 — 감싼 키 변수 셋도 케이스마다 비우고 되돌린다. 풀린 키는 프로세스 전역
// 칸(Symbol.for("plant8.appDataKeys"))에 있어 vi.resetModules()로 지워지지 않으므로
// 케이스 앞뒤로 그 칸도 지운다(RB-P1).
const KEY_ENV = [
  "APP_DATA_KEY_v1",
  "APP_DATA_KEY_v2",
  "APP_DATA_KEY_v1_WRAPPED",
  "APP_DATA_KEY_v2_WRAPPED",
  "APP_DATA_KEY_KMS_KEY",
] as const;
const DATA_KEY_SLOT = Symbol.for("plant8.appDataKeys");

function clearDataKeySlot(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT];
}

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of KEY_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  clearDataKeySlot();
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEY_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearDataKeySlot();
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

// 04.3-08 Task 1 — KMS 봉투. 데이터 키 값은 그대로 두고 보관만 바뀐다: 감싼 변수가
// 있으면 loadDataKeys()가 한 번 풀어 프로세스 전역 칸에 두고, encrypt/decrypt는 그대로
// 동기 함수다. unwrap은 주입한 가짜뿐이다(네트워크 · KMS 어댑터 로드 없음).
const KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/plant8-staging/cryptoKeys/app-data-key";

function setWrapped(version: "v1" | "v2", ciphertext = `wrapped-${version}`): void {
  process.env[`APP_DATA_KEY_${version}_WRAPPED`] = ciphertext;
  process.env.APP_DATA_KEY_KMS_KEY = KMS_KEY;
}

// 평문 변수로 키를 쓰던 시절(승격 전)의 v1: 표본을 만든다.
async function legacySample(keyText: string, plaintext: string): Promise<string> {
  process.env.APP_DATA_KEY_v1 = keyText;
  const { encrypt } = await loadCrypto();
  const stored = encrypt(plaintext);
  delete process.env.APP_DATA_KEY_v1;
  vi.resetModules();
  return stored;
}

describe("lib/crypto loadDataKeys — KMS 봉투(04.3-08)", () => {
  it("감싼 변수가 없으면 unwrap을 부르지 않고 평문 환경 변수 키를 그대로 쓴다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const unwrap = vi.fn(() => Promise.resolve(Buffer.from(VALID_KEY_V2)));
    const { loadDataKeys, encrypt, decrypt } = await loadCrypto();

    await loadDataKeys({ unwrap });

    expect(unwrap).not.toHaveBeenCalled();
    const stored = encrypt("x");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decrypt(stored)).toBe("x");
  });

  it("감싼 변수 + KMS 키 이름이 있고 아직 풀지 않았으면 encrypt · decrypt가 MissingEncryptionKeyError", async () => {
    const legacy = await legacySample(VALID_KEY_V1, "과거값");
    setWrapped("v1");
    const { encrypt, decrypt, MissingEncryptionKeyError } = await loadCrypto();

    expect(() => encrypt("x")).toThrow(MissingEncryptionKeyError);
    expect(() => decrypt(legacy)).toThrow(MissingEncryptionKeyError);
  });

  it("unwrap이 키 K의 base64 텍스트를 돌려주면 encrypt가 v1:이고, 같은 K를 평문 변수로 쓰던 시절의 v1: 표본이 풀린다", async () => {
    const legacy = await legacySample(VALID_KEY_V1, "과거 계좌번호");
    setWrapped("v1");
    const unwrap = vi.fn(() => Promise.resolve(Buffer.from(VALID_KEY_V1, "utf8")));
    const { loadDataKeys, encrypt, decrypt } = await loadCrypto();

    await loadDataKeys({ unwrap });

    expect(unwrap).toHaveBeenCalledWith({ keyName: KMS_KEY, ciphertext: "wrapped-v1" });
    expect(encrypt("x").startsWith("v1:")).toBe(true);
    expect(decrypt(legacy)).toBe("과거 계좌번호");
  });

  it("인코딩 계약 — openssl rand -base64 32 모양(44자 + 끝 개행) 텍스트가 32바이트 키로 풀린다", async () => {
    const keyText = `${Buffer.alloc(32, 7).toString("base64")}\n`;
    expect(keyText).toHaveLength(45);
    const legacy = await legacySample(keyText.trim(), "주민번호 표본");
    setWrapped("v1");
    const { loadDataKeys, decrypt } = await loadCrypto();

    await loadDataKeys({ unwrap: () => Promise.resolve(Buffer.from(keyText, "utf8")) });

    expect(decrypt(legacy)).toBe("주민번호 표본");
  });

  it("unwrap이 텍스트가 아니라 날 32바이트를 돌려주면 InvalidEncryptionKeyLengthError(메시지에 값 없음) · 칸은 비어 있다", async () => {
    setWrapped("v1");
    const raw = Buffer.alloc(32, 1);
    const { loadDataKeys, encrypt, InvalidEncryptionKeyLengthError, MissingEncryptionKeyError } = await loadCrypto();

    const error = await loadDataKeys({ unwrap: () => Promise.resolve(raw) }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidEncryptionKeyLengthError);
    expect((error as Error).message).not.toContain(raw.toString("base64"));
    expect((error as Error).message).not.toContain("wrapped-v1");
    expect((globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT]).toBeUndefined();
    expect(() => encrypt("x")).toThrow(MissingEncryptionKeyError);
  });

  // 검토 반영 L6 — 도중에 던지면 이미 채워진 칸은 그대로다(새 Map을 다 채운 뒤에만 바꾼다).
  it("이미 채워진 칸이 있을 때 loadDataKeys가 실패하면 칸은 같은 Map 그대로이고 앞 키로 계속 푼다", async () => {
    setWrapped("v1");
    setWrapped("v2");
    const keys: Record<string, string> = { "wrapped-v1": VALID_KEY_V1, "wrapped-v2": VALID_KEY_V2 };
    const { loadDataKeys, encrypt, decrypt } = await loadCrypto();
    await loadDataKeys({ unwrap: ({ ciphertext }) => Promise.resolve(Buffer.from(keys[ciphertext] ?? "")) });
    const slotBefore = (globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT];
    const stored = encrypt("앞 키");

    // v1은 다른 키로 풀리고 v2에서 던진다 — 반쯤 채운 새 Map이 칸에 들어가면 안 된다.
    const unwrap = ({ ciphertext }: { ciphertext: string }) =>
      ciphertext === "wrapped-v2" ? Promise.reject(new Error("KMS down")) : Promise.resolve(Buffer.from(VALID_KEY_V2));
    await expect(loadDataKeys({ unwrap })).rejects.toThrow("KMS down");

    expect((globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT]).toBe(slotBefore);
    expect(decrypt(stored)).toBe("앞 키");
  });

  it("풀린 텍스트가 32바이트로 해석되지 않으면(16바이트 키) InvalidEncryptionKeyLengthError", async () => {
    setWrapped("v1");
    const { loadDataKeys, InvalidEncryptionKeyLengthError } = await loadCrypto();

    await expect(
      loadDataKeys({ unwrap: () => Promise.resolve(Buffer.from(Buffer.alloc(16, 1).toString("base64"))) }),
    ).rejects.toBeInstanceOf(InvalidEncryptionKeyLengthError);
  });

  it("RB-P1 — 다른 모듈 인스턴스(vi.resetModules 뒤 다시 import)가 loadDataKeys 없이도 풀린 키로 암호화 · 복호화한다", async () => {
    setWrapped("v1");
    const first = await loadCrypto();
    await first.loadDataKeys({ unwrap: () => Promise.resolve(Buffer.from(VALID_KEY_V1)) });
    const fromFirst = first.encrypt("첫 인스턴스");

    vi.resetModules();
    const second = await loadCrypto();
    expect(second).not.toBe(first);

    expect(second.encrypt("둘째").startsWith("v1:")).toBe(true);
    expect(second.decrypt(fromFirst)).toBe("첫 인스턴스");
    expect((globalThis as unknown as Record<symbol, unknown>)[DATA_KEY_SLOT]).toBeInstanceOf(Map);

    clearDataKeySlot();
    vi.resetModules();
    const third = await loadCrypto();
    expect(() => third.encrypt("x")).toThrow(third.MissingEncryptionKeyError);
  });

  it("isKeyVersionUsable — 평문 변수가 있거나 풀린 키가 있을 때만 참", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    setWrapped("v2");
    const { loadDataKeys, isKeyVersionUsable } = await loadCrypto();

    expect(isKeyVersionUsable("v1")).toBe(true);
    expect(isKeyVersionUsable("v2")).toBe(false);

    await loadDataKeys({ unwrap: () => Promise.resolve(Buffer.from(VALID_KEY_V2)) });
    expect(isKeyVersionUsable("v2")).toBe(true);
  });

  it("newestKeyVersion — v2 평문 · 감싼 변수가 없으면 v1, 감싼 변수만 있는 v2도 v2로 센다", async () => {
    process.env.APP_DATA_KEY_v1 = VALID_KEY_V1;
    const a = await loadCrypto();
    expect(a.newestKeyVersion()).toBe("v1");

    vi.resetModules();
    setWrapped("v2");
    const b = await loadCrypto();
    expect(b.newestKeyVersion()).toBe("v2");
  });

  it("v1 · v2 감싼 키를 함께 풀면 newestKeyVersion이 v2 · 새 encrypt는 v2: · 승격 전 v1 표본도 풀린다", async () => {
    const legacy = await legacySample(VALID_KEY_V1, "회전 전");
    setWrapped("v1");
    setWrapped("v2");
    const keys: Record<string, string> = { "wrapped-v1": VALID_KEY_V1, "wrapped-v2": VALID_KEY_V2 };
    const { loadDataKeys, encrypt, decrypt, newestKeyVersion } = await loadCrypto();

    await loadDataKeys({ unwrap: ({ ciphertext }) => Promise.resolve(Buffer.from(keys[ciphertext] ?? "")) });

    expect(newestKeyVersion()).toBe("v2");
    expect(encrypt("회전 뒤").startsWith("v2:")).toBe(true);
    expect(decrypt(legacy)).toBe("회전 전");
  });
});
