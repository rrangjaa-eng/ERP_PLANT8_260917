import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .claude/settings.json SessionStart 훅 순서와 scripts/install-codex.sh의 누수 금지를
// 고정한다. 두 가지 계약을 지킨다:
// 1) 훅 순서 — install_pkgs.sh(패키지) → install-codex.sh(Codex CLI+자격) →
//    dev-db.sh(로컬 DB). 순서가 깨지면 Codex 자격 주입 전에 DB 훅이 세션을 막을 수 있다.
// 2) 누수 금지 — install-codex.sh의 어떤 줄도 CODEX_AUTH_JSON_B64/OPENAI_API_KEY 값을
//    echo/cat으로 stdout에 흘리거나 xtrace로 노출하지 않는다. 이 값은 세션 트랜스크립트에
//    남으면 회수 불가능하다(threat T-c04-01).

interface SettingsHook {
  type?: string;
  command?: string;
}

interface SettingsSessionStartEntry {
  matcher?: string;
  hooks?: SettingsHook[];
}

interface Settings {
  hooks?: {
    SessionStart?: SettingsSessionStartEntry[];
  };
}

const SETTINGS_PATH = resolve(process.cwd(), ".claude/settings.json");
const INSTALL_CODEX_PATH = resolve(process.cwd(), "scripts/install-codex.sh");

const settingsRaw = readFileSync(SETTINGS_PATH, "utf8");
const settings = JSON.parse(settingsRaw) as Settings;
const installCodexSource = readFileSync(INSTALL_CODEX_PATH, "utf8");

function startupResumeEntry(): SettingsSessionStartEntry | undefined {
  return settings.hooks?.SessionStart?.find((entry) => entry.matcher === "startup|resume");
}

describe(".claude/settings.json SessionStart 훅 순서", () => {
  it("install_pkgs.sh < install-codex.sh < dev-db.sh 순서로 등록된다", () => {
    const entry = startupResumeEntry();
    expect(entry, "matcher가 startup|resume인 SessionStart 항목이 있어야 한다").toBeDefined();
    const commands = (entry?.hooks ?? []).map((hook) => hook.command ?? "");
    const indexes = [
      commands.findIndex((command) => command.includes("scripts/install_pkgs.sh")),
      commands.findIndex((command) => command.includes("scripts/install-codex.sh")),
      commands.findIndex((command) => command.includes("scripts/dev-db.sh")),
    ];
    for (const index of indexes) expect(index).not.toBe(-1);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("install-codex 훅 command가 올바른 형식과 type을 갖는다", () => {
    const entry = startupResumeEntry();
    const codexHook = (entry?.hooks ?? []).find((hook) =>
      (hook.command ?? "").includes("scripts/install-codex.sh"),
    );
    expect(codexHook).toBeDefined();
    expect(codexHook?.command).toContain('bash "$CLAUDE_PROJECT_DIR"/scripts/install-codex.sh');
    expect(codexHook?.type).toBe("command");
  });
});

describe("scripts/install-codex.sh 존재·양성 토큰", () => {
  it.each(["CLAUDE_CODE_REMOTE", "CODEX_VERSION=0.155.1", "CODEX_AUTH_JSON_B64", "umask 077", "codex login status"])(
    "'%s'를 포함한다",
    (token) => {
      expect(installCodexSource).toContain(token);
    },
  );
});

describe("scripts/install-codex.sh 누수 금지 (줄 단위)", () => {
  const lines = installCodexSource.split("\n");

  function matchingLineNumbers(pattern: RegExp): number[] {
    return lines
      .map((line, index) => (pattern.test(line) ? index + 1 : -1))
      .filter((lineNumber) => lineNumber !== -1);
  }

  it("어떤 줄도 CODEX_AUTH_JSON_B64 값을 echo하지 않는다", () => {
    const matches = matchingLineNumbers(/\becho\b[^\n]*\$\{?CODEX_AUTH_JSON_B64/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });

  it("어떤 줄도 OPENAI_API_KEY 값을 echo하지 않는다", () => {
    const matches = matchingLineNumbers(/\becho\b[^\n]*\$\{?OPENAI_API_KEY/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });

  it("어떤 줄도 auth.json을 cat하지 않는다", () => {
    const matches = matchingLineNumbers(/\bcat\b[^\n]*auth\.json/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });

  it("어떤 줄도 xtrace(set -x 계열)를 켜지 않는다", () => {
    const matches = matchingLineNumbers(/^\s*set\s+-[a-z]*x/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });
});
