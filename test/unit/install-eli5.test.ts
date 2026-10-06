import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/install-eli5.sh 행동 계약(SessionStart, startup|resume). 클라우드 세션에서만 고정 커밋의
// eli5 SKILL.md를 받아 ~/.claude/skills/eli5에 둔다. 스킬은 모든 세션 프롬프트에 들어가므로 받은
// 내용이 고정 sha256과 다르면 설치하지 않고, 깨진 기존 파일은 다시 받는다. 어떤 실패도 세션을 막지 않는다.
const SCRIPT = resolve(process.cwd(), "scripts/install-eli5.sh");

// anthropics/claude-plugins-community@f60f045 eli5/skills/eli5/SKILL.md 원문.
const UPSTREAM =
  "---\nname: eli5\ndescription: Explain a topic like I'm a 5 year old. Use when the user types /eli5 <topic> or asks for a dead-simple picture explainer of how something works.\n---\n\n# eli5\n\nExplain like I'm someone who knows nothing about this topic, using a HTML artifact with big pictures and few words.\n\nTopic: $ARGUMENTS\n";

function run(opts: { remote: boolean; served?: string; existing?: string }) {
  const home = mkdtempSync(join(tmpdir(), "install-eli5-"));
  const bin = join(home, "stub-bin");
  mkdirSync(bin);
  const body = join(home, "served-body");
  // 네트워크 대신 -o 대상에 served-body를 복사하는 curl. served가 없으면 실패(22)를 흉내 낸다.
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && { shift; out="$1"; }; shift; done\n[ -f "${body}" ] || exit 22\ncp "${body}" "$out"\n`,
  );
  chmodSync(join(bin, "curl"), 0o755);
  if (opts.served !== undefined) writeFileSync(body, opts.served);
  const file = join(home, ".claude", "skills", "eli5", "SKILL.md");
  if (opts.existing !== undefined) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, opts.existing);
  }
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, HOME: home };
  if (opts.remote) env.CLAUDE_CODE_REMOTE = "true";
  const result = spawnSync("/bin/bash", [SCRIPT], { env, encoding: "utf8" });
  return { result, file, output: `${result.stdout}${result.stderr}` };
}

describe("scripts/install-eli5.sh", () => {
  it("로컬 세션(CLAUDE_CODE_REMOTE 없음)에서는 아무것도 하지 않는다", () => {
    const { result, file } = run({ remote: false, served: UPSTREAM });
    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it("클라우드에서 고정 해시와 같은 내용을 받으면 설치한다", () => {
    const { result, file } = run({ remote: true, served: UPSTREAM });
    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(UPSTREAM);
  });

  it("받은 내용이 고정 해시와 다르면 설치하지 않는다", () => {
    const { result, file, output } = run({ remote: true, served: "<html>proxy page</html>" });
    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(output).toContain("failed");
  });

  it("다운로드가 실패해도 세션을 막지 않는다", () => {
    const { result, file } = run({ remote: true });
    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it("깨진 기존 파일은 다시 받아 바꾼다(재개)", () => {
    const { result, file } = run({ remote: true, served: UPSTREAM, existing: "" });
    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(UPSTREAM);
  });

  it("깨진 기존 파일은 다시 받기가 실패해도 남기지 않는다", () => {
    const { result, file } = run({ remote: true, existing: "injected" });
    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it("같은 해시의 기존 파일이 있으면 받지 않고 건너뛴다", () => {
    const { result, output } = run({ remote: true, existing: UPSTREAM });
    expect(result.status).toBe(0);
    expect(output).toContain("already installed");
  });
});
