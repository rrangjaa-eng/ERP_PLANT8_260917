import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

// CLI 번들(scripts/build-cli.mjs)은 esbuild ESM이라, 런타임 순환 import가 있으면
// 순환에 걸린 모듈을 top-level await가 든 초기화 함수로 감싼다. 그 await는
// 영원히 풀리지 않아 Node가 "Detected unsettled top-level await"로 exit 13을
// 내고 Job은 아무 일도 하지 않은 채 끝난다 — 실측: 03이
// repositories/roles.ts → domain/permissions/roles.ts → repositories/roles.ts
// 순환을 만들면서 seed·account Cloud Run Job 둘 다 이렇게 죽었다.
// dev 서버·Next 빌드·vitest는 순환을 견디므로 지금까지 아무 게이트도 이걸
// 잡지 못했고, CI는 build:cli를 돌리지 않는다. 그래서 정적으로 잡는다.
//
// 타입만 쓰는 import(`import type ...`)는 컴파일에서 지워져 런타임 순환이
// 아니므로 세지 않는다.

const ROOT = process.cwd();
const SCAN_DIRS = ["domain", "repositories", "lib", "db", "scripts"];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => listTsFiles(resolve(ROOT, dir)));

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? resolve(ROOT, spec.slice(2)) : resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (files.includes(candidate)) return candidate;
  }
  return null;
}

// `import type ... from "x"` / `export type ... from "x"`는 건너뛰고 나머지
// import·re-export만 런타임 간선으로 센다.
function runtimeDeps(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const deps = new Set<string>();
  for (const match of src.matchAll(/^(import|export)\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)"/gm)) {
    if (match[2]) continue;
    const target = resolveSpec(file, match[4] ?? "");
    if (target && target !== file) deps.add(target);
  }
  return [...deps];
}

const graph = new Map(files.map((file) => [file, runtimeDeps(file)]));

function findCycles(): string[][] {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  function visit(node: string): void {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
      else if (!state.has(dep)) visit(dep);
    }
    stack.pop();
    state.set(node, 2);
  }
  for (const file of files) if (!state.has(file)) visit(file);
  return cycles;
}

describe("런타임 순환 import 검출 (CLI 번들 top-level await 교착 방지)", () => {
  it("스캔 대상 파일을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("domain·repositories·lib·db·scripts에 런타임 순환 import가 없다", () => {
    const rendered = findCycles().map((cycle) => cycle.map((p) => p.replace(`${ROOT}/`, "")).join(" -> "));
    expect(rendered, `순환: \n${rendered.join("\n")}`).toEqual([]);
  });
});
