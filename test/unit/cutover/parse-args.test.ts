import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "@/scripts/cutover-cli";

// 08-02(D8-05): 전환 CLI 인자 — 인자 없음 = dry-run, apply는 확인 문자열이 있어야 한다. 플래그와 값은 별개 argv(등호 결합 거부).
const TOKEN = "12-0a1b2c3d";
const RUN_URL = "https://github.com/acme/erp/actions/runs/123456789";

describe("scripts/cutover-cli parseArgs", () => {
  it("인자가 없으면 dry-run이다", () => {
    expect(parseArgs([])).toEqual({ apply: false, confirm: null, runUrl: null });
  });

  it("--apply --confirm <확인 문자열>을 읽는다", () => {
    expect(parseArgs(["--apply", "--confirm", TOKEN])).toEqual({ apply: true, confirm: TOKEN, runUrl: null });
  });

  it("--run-url은 GitHub Actions 실행 주소만 받는다", () => {
    expect(parseArgs(["--apply", "--confirm", TOKEN, "--run-url", RUN_URL]).runUrl).toBe(RUN_URL);
    expect(() => parseArgs(["--run-url", "https://example.com/actions/runs/1"])).toThrow(UsageError);
    expect(() => parseArgs(["--run-url", "https://github.com/acme/erp/actions/runs/abc"])).toThrow(UsageError);
  });

  it("--apply만 있으면 사용 오류다", () => {
    expect(() => parseArgs(["--apply"])).toThrow(UsageError);
  });

  it("--confirm만 있고 --apply가 없으면 사용 오류다", () => {
    expect(() => parseArgs(["--confirm", TOKEN])).toThrow(UsageError);
  });

  it("확인 문자열이 꼴 밖이면 사용 오류다", () => {
    expect(() => parseArgs(["--apply", "--confirm", "12-XYZ"])).toThrow(UsageError);
    expect(() => parseArgs(["--apply", "--confirm", "12-0a1b2c3"])).toThrow(UsageError);
    expect(() => parseArgs(["--apply", "--confirm"])).toThrow(UsageError);
  });

  it("등호 결합(--confirm=x)은 사용 오류다", () => {
    expect(() => parseArgs(["--apply", `--confirm=${TOKEN}`])).toThrow(UsageError);
  });

  it("모르는 플래그 · 남는 인자는 사용 오류다", () => {
    expect(() => parseArgs(["--force"])).toThrow(UsageError);
    expect(() => parseArgs(["extra"])).toThrow(UsageError);
  });
});
