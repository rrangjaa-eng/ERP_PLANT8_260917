import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .claude/settings.json SessionStart 훅 순서와 scripts/install-gstack.sh의 고정 계약을
// 고정한다. 두 가지 계약을 지킨다:
// 1) 훅 순서 — install_pkgs.sh(패키지) → dev-db.sh(로컬 DB) → install-gstack.sh(gstack
//    팀 모드). gstack 설치가 가장 오래 걸리므로 DB 훅 뒤에 둔다. Codex는 2026-09-27 결정으로
//    제거됐다 — 어떤 훅도 install-codex.sh를 부르지 않는다.
// 2) 고정 버전 — install-gstack.sh는 클라우드 세션에서만 돌고(CLAUDE_CODE_REMOTE), 커밋 SHA를
//    못 박아 받으며(GSTACK_PIN), 팀 모드 setup이 켜는 자동 업그레이드를 끈다. 세션마다 다른
//    gstack으로 /review·/design-review가 돌지 않게 하는 장치다.

interface SettingsHook {
  type?: string;
  command?: string;
  timeout?: number;
}

interface SettingsHookEntry {
  matcher?: string;
  hooks?: SettingsHook[];
}

interface Settings {
  hooks?: Record<string, SettingsHookEntry[]>;
}

const SETTINGS_PATH = resolve(process.cwd(), ".claude/settings.json");
const INSTALL_GSTACK_PATH = resolve(process.cwd(), "scripts/install-gstack.sh");

const settingsRaw = readFileSync(SETTINGS_PATH, "utf8");
const settings = JSON.parse(settingsRaw) as Settings;
const installGstackSource = readFileSync(INSTALL_GSTACK_PATH, "utf8");

function startupResumeEntry(): SettingsHookEntry | undefined {
  return settings.hooks?.SessionStart?.find((entry) => entry.matcher === "startup|resume");
}

function allHookCommands(): string[] {
  return Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => entry.hooks ?? [])
    .map((hook) => hook.command ?? "");
}

describe(".claude/settings.json SessionStart 훅 순서", () => {
  it("install_pkgs.sh < dev-db.sh < install-gstack.sh 순서로 등록된다", () => {
    const entry = startupResumeEntry();
    expect(entry, "matcher가 startup|resume인 SessionStart 항목이 있어야 한다").toBeDefined();
    const commands = (entry?.hooks ?? []).map((hook) => hook.command ?? "");
    const indexes = [
      commands.findIndex((command) => command.includes("scripts/install_pkgs.sh")),
      commands.findIndex((command) => command.includes("scripts/dev-db.sh")),
      commands.findIndex((command) => command.includes("scripts/install-gstack.sh")),
    ];
    for (const index of indexes) expect(index).not.toBe(-1);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("install-gstack 훅 command가 올바른 형식·type·넉넉한 timeout을 갖는다", () => {
    const entry = startupResumeEntry();
    const gstackHook = (entry?.hooks ?? []).find((hook) =>
      (hook.command ?? "").includes("scripts/install-gstack.sh"),
    );
    expect(gstackHook).toBeDefined();
    expect(gstackHook?.command).toContain('bash "$CLAUDE_PROJECT_DIR"/scripts/install-gstack.sh');
    expect(gstackHook?.type).toBe("command");
    // ./setup --team이 기본 훅 timeout(60초)보다 오래 걸린다 — 잘리면 스킬이 반쪽만 설치된다.
    expect(gstackHook?.timeout ?? 0).toBeGreaterThanOrEqual(600);
  });

  it("어떤 훅도 install-codex.sh를 부르지 않는다(Codex 제거, 2026-09-27)", () => {
    const codexHooks = allHookCommands().filter((command) => command.includes("install-codex"));
    expect(codexHooks).toEqual([]);
  });
});

describe("scripts/install-gstack.sh 고정 계약", () => {
  it.each(["CLAUDE_CODE_REMOTE", "GSTACK_PIN=", "--depth 1", "auto_upgrade false", "./setup --team"])(
    "'%s'를 포함한다",
    (token) => {
      expect(installGstackSource).toContain(token);
    },
  );

  it("어떤 줄도 xtrace(set -x 계열)를 켜지 않는다", () => {
    const lines = installGstackSource.split("\n");
    const matches = lines
      .map((line, index) => (/^\s*set\s+-[a-z]*x/.test(line) ? index + 1 : -1))
      .filter((lineNumber) => lineNumber !== -1);
    expect(matches, `xtrace 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });
});
