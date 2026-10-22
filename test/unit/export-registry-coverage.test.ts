import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ROADMAP 기준 5 — Excel 내보내기 함수도 누수 스캔이 덮는다(G-58/C-P2-9).
// 새 내려받기(07-20 등)는 registerExport + leak-scan 통합 시험에 import 한 줄을 더해야 이 시험이 녹색이다.
//
// 「파일을 만드는 모듈」은 import로 판정한다(FA-2) — `buildTextSheetXlsx`(lib/xlsx-server.ts) 또는
// `@/lib/csv`를 import하는 app · domain · lib의 시험 아닌 파일(두 라이브러리 자신 제외).
// DB 없이 정적으로 판정하므로 통합이 아니라 단위로 둔다.

const ROOT = process.cwd();
const LEAK_SCAN = resolve(ROOT, "test/integration/leak-scan.test.ts");
const SCAN_DIRS = ["app", "domain", "lib"].map((dir) => resolve(ROOT, dir));
const LIBRARY_SELF = new Set([resolve(ROOT, "lib/xlsx-server.ts"), resolve(ROOT, "lib/csv.ts")]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORTS_FILE_BUILDER = /import[^;]*(?:buildTextSheetXlsx|["']@\/lib\/csv["'])/;

function importSpecifiersFor(file: string): string[] {
  const spec = `@/${file.replace(`${ROOT}/`, "").replace(/\.tsx?$/, "")}`;
  return spec.endsWith("/index") ? [spec, spec.slice(0, -"/index".length)] : [spec];
}

describe("파일을 만드는 모듈은 registerExport로 등록되고 누수 스캔이 로드한다 (07-03 · G-58)", () => {
  const fileMakers = SCAN_DIRS.flatMap(listSourceFiles).filter(
    (file) => !LIBRARY_SELF.has(file) && IMPORTS_FILE_BUILDER.test(readFileSync(file, "utf8")),
  );
  const leakScanSource = readFileSync(LEAK_SCAN, "utf8");
  const rel = (file: string) => file.replace(`${ROOT}/`, "");

  it("파일을 만드는 모듈을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => {
    expect(fileMakers.length).toBeGreaterThan(0);
  });

  it("파일을 만드는 모든 모듈이 registerExport(를 부른다", () => {
    const missing = fileMakers.filter((file) => !readFileSync(file, "utf8").includes("registerExport("));
    expect(missing.map(rel), `registerExport 없이 파일을 만드는 모듈: ${missing.map(rel).join(", ")}`).toEqual([]);
  });

  it("파일을 만드는 모든 모듈이 누수 스캔에 import되어 있다", () => {
    const missing = fileMakers.filter((file) => !importSpecifiersFor(file).some((spec) => leakScanSource.includes(`"${spec}"`)));
    expect(missing.map(rel), `누수 스캔이 import하지 않는 내보내기 모듈: ${missing.map(rel).join(", ")}`).toEqual([]);
  });
});
