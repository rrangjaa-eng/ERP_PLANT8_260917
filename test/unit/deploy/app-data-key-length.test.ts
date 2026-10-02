import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DATA_KEY_BYTES } from "@/lib/crypto";

// scripts/deploy.sh는 최초 배포 시 app-data-key-v1 시크릿이 없으면
// `openssl rand -base64 <n>`으로 새로 만든다. 이 <n>이 lib/crypto.ts가
// 요구하는 키 길이(APP_DATA_KEY_BYTES)와 어긋나면, 그 즉시 만들어진 키는
// keyFor()가 InvalidEncryptionKeyLengthError로 매번 거부해 모든 암호화
// 저장(예: 거래처 계좌번호)이 fail-closed로 막힌다 — deploy.sh는 shell,
// crypto.ts는 TypeScript라 지금까지 둘을 잇는 게이트가 없었다(48바이트로
// 생성되던 실측 결함). 이 테스트는 32를 두 번 박지 않고 두 소스에서 각각
// 읽어 대조한다 — 어느 한쪽만 바뀌어도 즉시 빨간불이 된다.

const DEPLOY_SH = readFileSync(resolve(process.cwd(), "scripts/deploy.sh"), "utf8");

function seedBytesFor(secretBase: string): number {
  const pattern = new RegExp(`_ensure_secret ${secretBase} (\\d+)`);
  const match = DEPLOY_SH.match(pattern);
  if (!match || match[1] === undefined) {
    throw new Error(`scripts/deploy.sh에서 "_ensure_secret ${secretBase} <n>" 호출을 찾지 못했다`);
  }
  return Number(match[1]);
}

describe("app-data-key-v1 seed 길이 계약(deploy.sh ↔ lib/crypto.ts)", () => {
  it("deploy.sh가 app-data-key-v1 생성에 쓰는 seed byte 수가 APP_DATA_KEY_BYTES와 일치한다", () => {
    expect(seedBytesFor("app-data-key-v1")).toBe(APP_DATA_KEY_BYTES);
  });
});
