import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 04.3-08 Task 1 ⑥ — 회전 CLI가 KMS 뒤에도 돈다(codex #10). 평문 변수 없이 감싼 변수만
// 있는 환경에서 loadDataKeys()로 푼 키로 판정 · 재암호화하고, 대상에 확인증 두 칸이 있다.
// lib/crypto가 모듈 최상위에서 env를 읽으므로 test/unit/crypto.test.ts와 같이
// vi.resetModules() 뒤 동적 import로 다시 로드한다. 풀린 키는 프로세스 전역 칸에 있어
// 케이스마다 그 칸을 지운다(RB-P1).

const KEY_V1 = Buffer.alloc(32, 1).toString("base64");
const KEY_V2 = Buffer.alloc(32, 2).toString("base64");
const KMS_KEY = "projects/p/locations/asia-northeast3/keyRings/plant8-staging/cryptoKeys/app-data-key";
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

const WRAPPED: Record<string, string> = { "wrapped-v1": KEY_V1, "wrapped-v2": KEY_V2 };

function fakeUnwrap({ ciphertext }: { keyName: string; ciphertext: string }): Promise<Buffer> {
  return Promise.resolve(Buffer.from(WRAPPED[ciphertext] ?? ""));
}

async function v1Sample(plaintext: string): Promise<string> {
  process.env.APP_DATA_KEY_v1 = KEY_V1;
  const { encrypt } = await import("@/lib/crypto");
  const stored = encrypt(plaintext);
  delete process.env.APP_DATA_KEY_v1;
  vi.resetModules();
  return stored;
}

function memoryTarget(rows: { id: string; value: string | null }[]) {
  const writes: { id: string; value: string; previous: string }[] = [];
  return {
    writes,
    target: {
      label: "fake.column",
      fetchRows: () => Promise.resolve(rows),
      writeRow: (id: string, value: string, previous: string) => {
        writes.push({ id, value, previous });
        return Promise.resolve();
      },
    },
  };
}

describe("scripts/rotate-key — KMS 감싼 키로 회전(04.3-08)", () => {
  it("평문 변수 없이 감싼 v1 · v2만 있을 때 loadDataKeys 뒤 v1: 값을 v2:로 바꾸고 previous로 읽은 값을 넘긴다", async () => {
    const stored = await v1Sample("123-456");
    process.env.APP_DATA_KEY_v1_WRAPPED = "wrapped-v1";
    process.env.APP_DATA_KEY_v2_WRAPPED = "wrapped-v2";
    process.env.APP_DATA_KEY_KMS_KEY = KMS_KEY;
    const { loadDataKeys, decrypt } = await import("@/lib/crypto");
    const { rotateKey, newestVersion } = await import("@/scripts/rotate-key");
    await loadDataKeys({ unwrap: fakeUnwrap });

    const { target, writes } = memoryTarget([{ id: "a", value: stored }]);
    const results = await rotateKey([target]);

    expect(newestVersion()).toBe("v2");
    expect(results).toEqual([{ target: "fake.column", rotated: 1, skipped: 0 }]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.previous).toBe(stored);
    expect(writes[0]?.value.startsWith("v2:")).toBe(true);
    expect(decrypt(writes[0]?.value ?? "")).toBe("123-456");
  });

  it("감싼 v2가 없으면(v1만) 「두 키 … 모두 설정돼 있어야」 오류", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "wrapped-v1";
    process.env.APP_DATA_KEY_KMS_KEY = KMS_KEY;
    const { loadDataKeys } = await import("@/lib/crypto");
    const { rotateKey } = await import("@/scripts/rotate-key");
    await loadDataKeys({ unwrap: fakeUnwrap });

    await expect(rotateKey([memoryTarget([]).target])).rejects.toThrow(/두 키.*모두 설정돼 있어야/);
  });

  it("감싼 변수는 있지만 아직 풀지 않았으면 회전을 시작하지 않는다", async () => {
    process.env.APP_DATA_KEY_v1_WRAPPED = "wrapped-v1";
    process.env.APP_DATA_KEY_v2_WRAPPED = "wrapped-v2";
    process.env.APP_DATA_KEY_KMS_KEY = KMS_KEY;
    const { rotateKey } = await import("@/scripts/rotate-key");

    await expect(rotateKey([memoryTarget([]).target])).rejects.toThrow(/두 키.*모두 설정돼 있어야/);
  });

  it("TARGETS에 거래처 계좌번호 · cert_submissions.rrn_encrypted · cert_events.token_encrypted가 있다", async () => {
    const { TARGETS } = await import("@/scripts/rotate-key");

    expect(TARGETS.map((t) => t.label)).toEqual([
      "vendors.account_number_encrypted",
      "cert_submissions.rrn_encrypted",
      "cert_events.token_encrypted",
    ]);
  });
});
