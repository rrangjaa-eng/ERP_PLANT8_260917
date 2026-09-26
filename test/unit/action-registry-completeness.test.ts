import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.1-02(Codex MEDIUM · ENG-19): 누수 스캔은 actions.registry.ts의 등록만 검사한다 —
// 등록이 빠진 액션은 조용히 검사 밖에 남는다. 그래서 열거의 출발점은 registry가 아니라
// app/ 아래 모든 actions.ts다: 각 파일의 `export const …Action` 이름이 옆 등록 파일의
// `name: "…"`에 전부 있어야 하고, 등록 파일이 없는 파일은 아래 예외 목록과 정확히 같아야 한다.

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, "app");
const ACTIONS_FILE = "actions.ts";
const REGISTRY_FILE = "actions.registry.ts";

// 등록 파일 없는 액션 파일 — 경로 → 액션 이름(정확히 같아야 한다). 새 액션 파일을 여기에 넣지 않는다.
const ACTIONS_WITHOUT_REGISTRY: Record<string, string[]> = {
  // 본인 비밀번호 변경(Phase 1) — 세션 본인만 대상이고 돌려주는 DTO가 없어 누수 스캔 DTO 축에 올릴 것이 없다.
  "app/(app)/account/actions.ts": ["changePasswordAction"],
};

export type ActionFileEntry = { path: string; actionNames: string[]; registryNames: string[] | null };

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((name, i) => name === [...b].sort()[i]);
}

// (파일들, 예외) → 위반 목록. 등록 이름에 없는 액션 · 등록도 예외도 없는 파일 · 낡은 예외를 적는다.
export function registryViolations(entries: ActionFileEntry[], exceptions: Record<string, string[]>): string[] {
  const violations: string[] = [];
  for (const entry of entries) {
    const exception = exceptions[entry.path];
    if (entry.registryNames !== null) {
      for (const name of entry.actionNames) {
        if (!entry.registryNames.includes(name)) violations.push(`등록 빠짐: ${entry.path} ${name}`);
      }
      if (exception) violations.push(`낡은 예외(등록 파일이 생김): ${entry.path}`);
      continue;
    }
    if (!exception) violations.push(`등록 파일도 예외도 없음: ${entry.path}`);
    else if (!sameSet(exception, entry.actionNames)) {
      violations.push(`예외와 액션 이름이 다름: ${entry.path} [${entry.actionNames.join(", ")}]`);
    }
  }
  for (const path of Object.keys(exceptions)) {
    if (!entries.some((entry) => entry.path === path)) violations.push(`낡은 예외(파일 없음): ${path}`);
  }
  return violations;
}

function findActionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findActionFiles(full);
    return entry.name === ACTIONS_FILE ? [full] : [];
  });
}

function actionNamesIn(source: string): string[] {
  return [...source.matchAll(/export const (\w+Action)\b/g)].map((match) => match[1] ?? "");
}

function registryNamesIn(source: string): string[] {
  return [...source.matchAll(/name:\s*"(\w+)"/g)].map((match) => match[1] ?? "");
}

function realEntries(): ActionFileEntry[] {
  return findActionFiles(APP_DIR).map((file) => {
    const registry = join(dirname(file), REGISTRY_FILE);
    return {
      path: relative(ROOT, file),
      actionNames: actionNamesIn(readFileSync(file, "utf8")),
      registryNames: existsSync(registry) ? registryNamesIn(readFileSync(registry, "utf8")) : null,
    };
  });
}

describe("검출기 사례 (ENG-19)", () => {
  it("(a) 일부러 빠뜨린 등록 목록 → 빠진 이름을 적고 실패", () => {
    const entries = [{ path: "app/x/actions.ts", actionNames: ["aAction", "bAction"], registryNames: ["aAction"] }];
    expect(registryViolations(entries, {})).toEqual(["등록 빠짐: app/x/actions.ts bAction"]);
  });

  it("(b) 등록 파일도 예외 항목도 없는 actions.ts → 그 경로를 적고 실패", () => {
    const entries = [{ path: "app/y/actions.ts", actionNames: ["cAction"], registryNames: null }];
    expect(registryViolations(entries, {})).toEqual(["등록 파일도 예외도 없음: app/y/actions.ts"]);
  });

  it("(c) 예외 목록에 있는데 파일이 없거나 등록 파일이 생긴 항목 → 낡은 예외로 실패", () => {
    const entries = [{ path: "app/z/actions.ts", actionNames: ["dAction"], registryNames: ["dAction"] }];
    const exceptions = { "app/z/actions.ts": ["dAction"], "app/gone/actions.ts": ["eAction"] };
    expect(registryViolations(entries, exceptions)).toEqual([
      "낡은 예외(등록 파일이 생김): app/z/actions.ts",
      "낡은 예외(파일 없음): app/gone/actions.ts",
    ]);
  });

  it("예외 항목의 액션 이름이 하나 늘면 실패", () => {
    const entries = [{ path: "app/w/actions.ts", actionNames: ["fAction", "gAction"], registryNames: null }];
    expect(registryViolations(entries, { "app/w/actions.ts": ["fAction"] })).toEqual([
      "예외와 액션 이름이 다름: app/w/actions.ts [fAction, gAction]",
    ]);
  });
});

describe("app 아래 모든 actions.ts (T-04.1-57)", () => {
  const entries = realEntries();

  it("(d) 열거 결과에 account · leave · approvals 액션 파일이 있다(공허한 통과 방지)", () => {
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual(
      expect.arrayContaining(["app/(app)/account/actions.ts", "app/(app)/leave/actions.ts", "app/(app)/approvals/actions.ts"]),
    );
  });

  it("모든 액션이 옆 등록 파일에 있고, 등록 파일 없는 파일은 예외 목록과 정확히 같다", () => {
    const violations = registryViolations(entries, ACTIONS_WITHOUT_REGISTRY);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("예외 목록은 account 한 항목뿐이다", () => {
    expect(Object.keys(ACTIONS_WITHOUT_REGISTRY)).toEqual(["app/(app)/account/actions.ts"]);
  });
});
