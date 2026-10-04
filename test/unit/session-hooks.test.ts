import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .claude/settings.json SessionStart 훅 순서와 scripts/install-gstack.sh·install-codex.sh의
// 고정 계약을 고정한다. 세 가지 계약을 지킨다:
// 1) 훅 순서 — install_pkgs.sh(패키지) → install-codex.sh(Codex CLI+자격, 디자인 검토 전용) →
//    dev-db.sh(로컬 DB) → install-gstack.sh(gstack 팀 모드). gstack 설치가 가장 오래 걸리므로
//    DB 훅 뒤에 둔다.
// 2) 고정 버전 — install-gstack.sh는 클라우드 세션에서만 돌고(CLAUDE_CODE_REMOTE), 커밋 SHA를
//    못 박아 받으며(GSTACK_PIN), 팀 모드 setup이 켜는 자동 업그레이드를 끈다. 세션마다 다른
//    gstack으로 /review·/design-review가 돌지 않게 하는 장치다. Codex는 디자인 검토에서만 쓰므로
//    (사용자 결정 2026-10-01) 설치·재개 두 경로 모두 codex_reviews를 끈다.
// 3) 누수 금지 — install-codex.sh(Codex는 디자인 검토 전용, ChatGPT 구독 로그인만)의 어떤 줄도
//    CODEX_AUTH_JSON_B64 값을 echo로 흘리거나 auth.json을 cat하거나 xtrace를 켜지 않는다. 이 값은
//    세션 트랜스크립트에 남으면 회수할 수 없다. API 키 경로와 npm 설치(pnpm만, CLAUDE.md §1)는 없다.

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
const INSTALL_CODEX_PATH = resolve(process.cwd(), "scripts/install-codex.sh");

const settingsRaw = readFileSync(SETTINGS_PATH, "utf8");
const settings = JSON.parse(settingsRaw) as Settings;
const installGstackSource = readFileSync(INSTALL_GSTACK_PATH, "utf8");
const installCodexSource = readFileSync(INSTALL_CODEX_PATH, "utf8");

function startupResumeEntry(): SettingsHookEntry | undefined {
  return settings.hooks?.SessionStart?.find((entry) => entry.matcher === "startup|resume");
}

describe(".claude/settings.json SessionStart 훅 순서", () => {
  it("install_pkgs.sh < install-codex.sh < dev-db.sh < install-gstack.sh 순서로 등록된다", () => {
    const entry = startupResumeEntry();
    expect(entry, "matcher가 startup|resume인 SessionStart 항목이 있어야 한다").toBeDefined();
    const commands = (entry?.hooks ?? []).map((hook) => hook.command ?? "");
    const indexes = [
      commands.findIndex((command) => command.includes("scripts/install_pkgs.sh")),
      commands.findIndex((command) => command.includes("scripts/install-codex.sh")),
      commands.findIndex((command) => command.includes("scripts/dev-db.sh")),
      commands.findIndex((command) => command.includes("scripts/install-gstack.sh")),
    ];
    for (const index of indexes) expect(index).not.toBe(-1);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("install-codex 훅 command가 올바른 형식·type·timeout을 갖는다", () => {
    const entry = startupResumeEntry();
    const codexHook = (entry?.hooks ?? []).find((hook) =>
      (hook.command ?? "").includes("scripts/install-codex.sh"),
    );
    expect(codexHook).toBeDefined();
    expect(codexHook?.command).toContain('bash "$CLAUDE_PROJECT_DIR"/scripts/install-codex.sh');
    expect(codexHook?.type).toBe("command");
    // 첫 세션은 플랫폼 바이너리를 내려받는다 — 기본 60초에 잘리지 않게.
    expect(codexHook?.timeout ?? 0).toBeGreaterThanOrEqual(120);
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

});

describe("scripts/install-gstack.sh 고정 계약", () => {
  it.each([
    "CLAUDE_CODE_REMOTE",
    "GSTACK_PIN=",
    "--depth 1",
    "auto_upgrade false",
    "./setup --team",
    "codex_reviews disabled",
  ])(
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

  it("이미 설치된 경로(재개)에서도 codex_reviews를 끈다", () => {
    const skipBranch = /if \[ -f "\$DONE_MARKER" \]; then\n([\s\S]*?)\nfi\n/.exec(installGstackSource)?.[1] ?? "";
    expect(skipBranch).toContain("codex_reviews disabled");
  });
});

describe("scripts/install-codex.sh 존재·양성 토큰", () => {
  it.each([
    "CLAUDE_CODE_REMOTE",
    "CODEX_VERSION=0.160.0",
    "CODEX_AUTH_JSON_B64",
    "umask 077",
    "codex login status",
    "pnpm add -g",
    "global-bin-dir",
  ])("'%s'를 포함한다", (token) => {
    expect(installCodexSource).toContain(token);
  });
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

  it("어떤 줄도 auth.json을 cat하지 않는다", () => {
    const matches = matchingLineNumbers(/\bcat\b[^\n]*auth\.json/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });

  it("어떤 줄도 xtrace(set -x 계열)를 켜지 않는다", () => {
    const matches = matchingLineNumbers(/^\s*set\s+-[a-z]*x/);
    expect(matches, `누수 의심 줄 번호: ${matches.join(", ")}`).toEqual([]);
  });

  it("API 키 로그인 경로가 없다(ChatGPT 구독만)", () => {
    expect(installCodexSource).not.toContain("OPENAI_API_KEY");
    expect(installCodexSource).not.toContain("--with-api-key");
  });

  it("npm으로 설치하지 않는다(pnpm만, CLAUDE.md §1)", () => {
    expect(installCodexSource).not.toContain("npm install");
  });
});
