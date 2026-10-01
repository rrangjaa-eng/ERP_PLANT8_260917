import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/install-codex.sh 행동 계약(SessionStart, startup|resume). ChatGPT refresh 토큰은 갱신마다
// 바뀐다 — 재개 때 env의 낡은 사본으로 더 새 auth.json을 덮으면 로그인이 풀린다. 그래서 env 사본의
// last_refresh가 더 새로울 때만 덮는다. 어떤 경로도 토큰 값을 출력하지 않는다.
const SCRIPT = resolve(process.cwd(), "scripts/install-codex.sh");

function auth(refresh: string, lastRefresh: string) {
  return JSON.stringify({ tokens: { refresh_token: refresh, access_token: `at-${refresh}` }, last_refresh: lastRefresh });
}

function run(envAuth: string | undefined, existing?: string) {
  const home = mkdtempSync(join(tmpdir(), "install-codex-"));
  const bin = join(home, "stub-bin");
  mkdirSync(bin);
  // 설치는 건너뛰도록 이미 같은 버전이 있는 codex를 흉내 낸다.
  writeFileSync(
    join(bin, "codex"),
    '#!/bin/sh\ncase "$1" in --version) echo "codex-cli 0.155.1" ;; login) echo "Logged in using ChatGPT" ;; esac\n',
  );
  chmodSync(join(bin, "codex"), 0o755);
  if (existing !== undefined) {
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex", "auth.json"), existing);
  }
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    CLAUDE_CODE_REMOTE: "true",
  };
  if (envAuth !== undefined) env.CODEX_AUTH_JSON_B64 = Buffer.from(envAuth).toString("base64");
  const result = spawnSync("/bin/bash", [SCRIPT], { env, encoding: "utf8" });
  const file = join(home, ".codex", "auth.json");
  return { result, file, output: `${result.stdout}${result.stderr}` };
}

function refreshOf(file: string): string {
  return (JSON.parse(readFileSync(file, "utf8")) as { tokens: { refresh_token: string } }).tokens.refresh_token;
}

describe("scripts/install-codex.sh 자격 복원", () => {
  it("auth.json이 없으면 env 사본을 600으로 쓴다", () => {
    const { result, file } = run(auth("rt-env-0001", "2026-09-01T00:00:00Z"));
    expect(result.status).toBe(0);
    expect(refreshOf(file)).toBe("rt-env-0001");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("기존 auth.json이 더 새로 갱신됐으면 덮지 않는다(재개)", () => {
    const newer = auth("rt-file-0002", "2026-09-30T00:00:00Z");
    const { result, file, output } = run(auth("rt-env-0001", "2026-09-01T00:00:00Z"), newer);
    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(newer);
    expect(output).toContain("kept");
  });

  it("env 사본이 더 새로우면(사용자가 값을 갈았으면) 덮는다", () => {
    const { file } = run(auth("rt-env-0003", "2026-10-01T00:00:00Z"), auth("rt-file-0002", "2026-09-30T00:00:00Z"));
    expect(refreshOf(file)).toBe("rt-env-0003");
  });

  it("기존 파일이 깨졌으면 env 사본으로 덮는다", () => {
    const { file } = run(auth("rt-env-0004", "2026-09-01T00:00:00Z"), "{not json");
    expect(refreshOf(file)).toBe("rt-env-0004");
  });

  it("env 사본이 잘못됐으면 쓰지 않고 0으로 끝난다", () => {
    const { result, file } = run("{not json");
    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it("어떤 경로도 토큰 값이나 base64 원문을 출력하지 않는다", () => {
    const envAuth = auth("rt-env-secret-0005", "2026-10-01T00:00:00Z");
    for (const existing of [undefined, auth("rt-file-secret-0006", "2026-10-02T00:00:00Z"), "{bad"]) {
      const { output } = run(envAuth, existing);
      expect(output).not.toContain("secret-000");
      expect(output).not.toContain(Buffer.from(envAuth).toString("base64"));
    }
  });
});
