import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, readPayload, UsageError } from "@/scripts/settings-import";

// ADMN-06: settings-import CLI. account-cli.ts와 같은 인자 규약(플래그와 값은
// 항상 별개 argv 원소, 등호 결합 거부) — parseArgs가 --file 하나만 받는다.
// readPayload는 파일 시스템·JSON 파싱 오류를 UsageError로 감싸 domain의
// ImportValidationError(스키마 검증 실패)와 구분한다.

describe("scripts/settings-import parseArgs", () => {
  it("--file <경로>를 파싱한다", () => {
    expect(parseArgs(["--file", "/tmp/export.json"])).toEqual({ file: "/tmp/export.json" });
  });

  it("--file이 없으면 UsageError", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  it("--file 뒤에 값이 없으면 UsageError", () => {
    expect(() => parseArgs(["--file"])).toThrow(UsageError);
  });

  it("등호 결합 토큰(--file=x.json)은 알 수 없는 플래그로 UsageError", () => {
    expect(() => parseArgs(["--file=x.json"])).toThrow(UsageError);
  });

  it("알 수 없는 플래그는 UsageError", () => {
    expect(() => parseArgs(["--path", "/tmp/export.json"])).toThrow(UsageError);
  });
});

describe("scripts/settings-import readPayload", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "settings-import-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("유효한 JSON 파일을 파싱해 반환한다", () => {
    const file = join(dir, "export.json");
    const payload = { schemaVersion: "1", exportedAt: "2026-09-21T00:00:00.000Z", settings: { a: 1 } };
    writeFileSync(file, JSON.stringify(payload), "utf8");

    expect(readPayload(file)).toEqual(payload);
  });

  it("존재하지 않는 파일이면 UsageError", () => {
    expect(() => readPayload(join(dir, "없음.json"))).toThrow(UsageError);
  });

  it("JSON 파싱에 실패하면 UsageError", () => {
    const file = join(dir, "broken.json");
    writeFileSync(file, "{ 이건 JSON이 아니다", "utf8");

    expect(() => readPayload(file)).toThrow(UsageError);
  });

  it("settings 필드가 없으면 UsageError", () => {
    const file = join(dir, "no-settings.json");
    writeFileSync(file, JSON.stringify({ schemaVersion: "1" }), "utf8");

    expect(() => readPayload(file)).toThrow(UsageError);
  });
});
