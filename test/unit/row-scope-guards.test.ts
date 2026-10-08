import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 06.2-06 — 06.2-03 독립 검토 M-1 · M-7 구조 테스트(소스 스캔, DB 없음).
//  M-1: 옛 `scopeFor()` 결과(`Scope`, rows: all | none)는 `RowScope` 유니온에 구조적으로 대입된다 — tsc가 못 잡는다. 그래서
//       `scopeFor(` 를 부르는 파일은 `RowScope`를 받는 리포지토리 함수를 한 줄도 담지 않는다(마스터 리포지토리 전용 옛 값이 전 행으로 새지 않게).
//  M-7: `rowScopeCondition`의 하위 질의는 안쪽 `teams` · `project_members`에 묶인다 — cols는 바깥 질의 표(projects 등)의 열이어야 하고
//       `teams.` · `projectMembers.` 열을 넘기면 조건이 조용히 틀린다.

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

type SourceFile = { file: string; src: string };

function sourcesUnder(...dirs: string[]): SourceFile[] {
  return dirs.flatMap((dir) => walk(resolve(ROOT, dir))).map((full) => ({ file: relative(ROOT, full), src: readFileSync(full, "utf8") }));
}

// 주석 줄을 비운다(블록 주석 · `//`). 줄 안 뒤쪽 주석은 남는다 — 이 스캔은 주석의 함수 이름 언급까지 막지는 않으려고 줄 전체 주석만 뺀다.
function codeOf(src: string): string {
  let inBlock = false;
  return src
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (inBlock) {
        if (trimmed.includes("*/")) inBlock = false;
        return "";
      }
      if (trimmed.startsWith("/*")) {
        if (!trimmed.includes("*/")) inBlock = true;
        return "";
      }
      return trimmed.startsWith("//") ? "" : line;
    })
    .join("\n");
}

// `RowScope`를 받는 리포지토리 함수 — 이름이 바뀌면 아래 존재 단언이 붉다.
export const ROW_SCOPE_TAKERS: readonly string[] = [
  "rowScopeCondition",
  "projectFilterConditions",
  "findProjectInScope",
  "listProjectIdsInScope",
  "listProjectsPage",
  "aggregateProjects",
  "listLinkProjects",
  "findProjectNames",
  "listProjectOptions",
];

const OLD_SCOPE_CALL = /\b(?!rowScopeFor\b)\w*[sS]copeFor\s*\(/;

// M-1 한 파일: 옛 scopeFor를 부르면서 RowScope 받는 함수 이름도 담은 경우의 설명.
export function oldScopeNearRowScopeIn(file: string, src: string, takers: readonly string[] = ROW_SCOPE_TAKERS): string[] {
  const code = codeOf(src);
  if (!OLD_SCOPE_CALL.test(code)) return [];
  return takers.filter((name) => new RegExp(`\\b${name}\\b`).test(code)).map((name) => `${file}: scopeFor( 와 ${name} 가 같은 파일에 있다`);
}

// `rowScopeCondition(` 호출의 인자 글자(짝 맞는 괄호까지).
function rowScopeCallArgs(code: string): string[] {
  const out: string[] = [];
  const marker = /\browScopeCondition\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(code)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    out.push(code.slice(start, i - 1));
  }
  return out;
}

// M-7 한 파일: rowScopeCondition 인자에 안쪽 질의 표(teams · projectMembers)의 열이 들어간 호출 설명.
export function innerTableColsIn(file: string, src: string): string[] {
  return rowScopeCallArgs(codeOf(src))
    .filter((args) => /\b(teams|projectMembers)\.\w+/.test(args))
    .map((args) => `${file}: rowScopeCondition(${args.replace(/\s+/g, " ").trim()})`);
}

describe("M-1 — 옛 scopeFor 결과가 RowScope 자리로 새지 않는다", () => {
  it("scopeFor( 를 부르는 파일은 RowScope를 받는 리포지토리 함수를 담지 않는다", () => {
    const files = sourcesUnder("domain", "repositories", "app", "lib").filter(({ file }) => file !== "domain/permissions/scope-for.ts");
    const violations = files.flatMap(({ file, src }) => oldScopeNearRowScopeIn(file, src));
    expect(violations).toEqual([]);
  });

  it("RowScope를 받는 함수 이름이 모두 repositories에 export로 있다(이름이 바뀌면 스캔이 헛돈다)", () => {
    const exported = sourcesUnder("repositories").flatMap(({ src }) =>
      [...src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]),
    );
    for (const name of ROW_SCOPE_TAKERS) expect(exported, name).toContain(name);
  });

  it("실제 소스에서 옛 scopeFor 호출이 보인다(정규식이 깨져 0이 되면 붉다)", () => {
    const callers = sourcesUnder("domain", "repositories").filter(({ src }) => OLD_SCOPE_CALL.test(codeOf(src)));
    expect(callers.length).toBeGreaterThan(0);
  });

  it("자기 검사 — 같은 파일에 옛 scopeFor와 findProjectInScope가 있으면 위반, rowScopeFor만 있으면 통과", () => {
    expect(oldScopeNearRowScopeIn("domain/x.ts", "const s = await scopeFor(viewer, \"vendor\");\nfindProjectInScope(viewer, s, id);")).toEqual([
      "domain/x.ts: scopeFor( 와 findProjectInScope 가 같은 파일에 있다",
    ]);
    expect(oldScopeNearRowScopeIn("domain/y.ts", "const s = await rowScopeFor(viewer, \"project\");\nfindProjectInScope(viewer, s, id);")).toEqual([]);
    expect(oldScopeNearRowScopeIn("domain/z.ts", "// scopeFor( 는 옛 값\nfindProjectInScope(viewer, s, id);")).toEqual([]);
  });
});

describe("M-7 — rowScopeCondition cols는 바깥 질의 표의 열이다", () => {
  it("rowScopeCondition 호출 인자에 teams. · projectMembers. 열이 없다", () => {
    const files = sourcesUnder("domain", "repositories", "app", "lib").filter(({ file }) => file !== "repositories/row-scope.ts");
    expect(files.flatMap(({ file, src }) => innerTableColsIn(file, src))).toEqual([]);
  });

  it("실제 소스에서 rowScopeCondition 호출이 보인다(스캔이 헛돌면 붉다)", () => {
    const calls = sourcesUnder("repositories")
      .filter(({ file }) => file !== "repositories/row-scope.ts")
      .flatMap(({ src }) => rowScopeCallArgs(codeOf(src)));
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it("자기 검사 — teams.id를 teamId로 넘긴 호출은 위반, projects 열만 넘기면 통과", () => {
    const bad = "x.where(rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: teams.id, pmUserId: projects.pmUserId }));";
    const bad2 = "rowScopeCondition(viewer, scope, { projectId: projectMembers.projectId, teamId: projects.teamId, pmUserId: projects.pmUserId })";
    const good = "rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId })";
    expect(innerTableColsIn("repositories/a.ts", bad)).toHaveLength(1);
    expect(innerTableColsIn("repositories/b.ts", bad2)).toHaveLength(1);
    expect(innerTableColsIn("repositories/c.ts", good)).toEqual([]);
  });
});
