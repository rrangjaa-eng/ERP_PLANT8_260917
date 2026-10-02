import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "@/scripts/purge-certs";

// 04.3-12 Task 2 — 파기 CLI 인자. 기본이 미리 보기(dry-run)이고 `--apply`만 적용이다(RESEARCH 보안 표 「dry-run 필수」).

describe("scripts/purge-certs parseArgs", () => {
  it("인자 없음은 미리 보기다", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  it("--apply는 적용이다", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });

  it("등호 결합(--apply=true)은 거부한다", () => {
    expect(() => parseArgs(["--apply=true"])).toThrow(UsageError);
  });

  it("모르는 플래그는 거부한다", () => {
    expect(() => parseArgs(["--force"])).toThrow(UsageError);
  });
});
