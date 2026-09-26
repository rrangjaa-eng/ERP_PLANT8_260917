import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04-28(D-94 · CEO 리뷰 C-07 ④) — 앱 코드와 SYSTEM.md에 Mac 글리프 넷(⌘ U+2318 ·
// ↵ U+21B5 · ⌥ U+2325 · ⇧ U+21E7)이 없고, 키보드 이벤트의 메타 키 속성 참조가
// 없다(단축키는 Ctrl 전용). UI-SPEC rev 5 「재실행 가능한 확인」 2·3번 줄 담당 —
// 셸 grep 대신 파일을 직접 읽는다(admin-table-caption.test.ts와 같은 방식). 주석도 대상.

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "ui", "components"];
const GLYPHS = ["⌘", "↵", "⌥", "⇧"];
const META_KEY_REFERENCE = /\bmetaKey\b|getModifierState\(\s*["']Meta["']\s*\)/;

function isScanned(path: string): boolean {
  return path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".module.css");
}

function listFiles(dir: string): string[] {
  const abs = resolve(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return []; // components/가 없으면 건너뛴다.
  }
  return entries.flatMap((entry) => {
    const rel = join(dir, entry);
    if (statSync(resolve(ROOT, rel)).isDirectory()) return listFiles(rel);
    return isScanned(rel) ? [rel] : [];
  });
}

const appFiles = SCAN_DIRS.flatMap(listFiles);

describe("단축키 표기 — 앱 코드·SYSTEM.md에 Mac 글리프·메타 키가 없다(04-28, D-94)", () => {
  it("스캔 대상 파일을 실제로 찾는다", () => {
    expect(appFiles.length).toBeGreaterThan(50);
    expect(appFiles).toContain(join("ui", "table", "use-grid-keyboard.ts"));
  });

  it("app/·ui/(·components/)의 .ts·.tsx·.module.css에 글리프 넷이 0개다", () => {
    const offenders = appFiles.flatMap((file) => {
      const source = readFileSync(resolve(ROOT, file), "utf8");
      return GLYPHS.filter((glyph) => source.includes(glyph)).map((glyph) => `${file}: ${glyph}`);
    });
    expect(offenders).toEqual([]);
  });

  it("docs/design/SYSTEM.md에 글리프 넷이 0개다", () => {
    const system = readFileSync(resolve(ROOT, "docs", "design", "SYSTEM.md"), "utf8");
    expect(GLYPHS.filter((glyph) => system.includes(glyph))).toEqual([]);
  });

  it("app/·ui/(·components/)에 키보드 이벤트 메타 키 속성 참조가 0개다", () => {
    const offenders = appFiles.filter((file) => META_KEY_REFERENCE.test(readFileSync(resolve(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
