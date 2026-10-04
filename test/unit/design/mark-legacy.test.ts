import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CSS_LEGACY_MARKER, collectMarkedCssFiles } from "../../../stylelint.config.mjs";
import {
  MARKERS,
  addCssMarks,
  addFrameMarks,
  addTsxMarks,
  auditPaths,
  collectAppSourceFiles,
  collectMarked,
  frameViolations,
  listMarks,
} from "../../../scripts/design/mark-legacy.mjs";

// 이 파일은 옛 이름·위반 코드를 검사 입력(픽스처)으로 쓴다 — 공통 §4 (d) 「옛 이름 데이터 예외」.

const ROOT = process.cwd();

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mark-legacy-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

describe("mark-legacy --add(CSS)", () => {
  const files = {
    "ui/a/Bad.module.css": ".a { margin: 6px; }\n",
    "ui/a/Good.module.css": ".a { margin: var(--s-2); }\n",
    "app/(app)/b/b.module.css": ".b { border-radius: 4px; }\n",
  };

  it("새 규칙 경고가 있는 파일 맨 위에만 표시 한 줄을 넣는다", async () => {
    const dir = fixture(files);
    const marked = await addCssMarks(dir);
    expect([...marked].sort()).toEqual(["app/(app)/b/b.module.css", "ui/a/Bad.module.css"]);
    expect(readFileSync(join(dir, "ui/a/Bad.module.css"), "utf8")).toBe(
      `${CSS_LEGACY_MARKER}\n.a { margin: 6px; }\n`,
    );
    expect(readFileSync(join(dir, "ui/a/Good.module.css"), "utf8")).toBe(files["ui/a/Good.module.css"]);
  });

  it("두 번 돌려도 표시는 한 줄뿐이다(멱등)", async () => {
    const dir = fixture(files);
    await addCssMarks(dir);
    const again = await addCssMarks(dir);
    expect(again).toEqual([]);
    const text = readFileSync(join(dir, "ui/a/Bad.module.css"), "utf8");
    expect(text.split(CSS_LEGACY_MARKER).length - 1).toBe(1);
  });

  it("표시는 끄는 주석이 아니다 — stylelint-disable를 쓰지 않는다", async () => {
    const dir = fixture(files);
    await addCssMarks(dir);
    expect(readFileSync(join(dir, "ui/a/Bad.module.css"), "utf8")).not.toContain("stylelint-disable");
  });
});

describe("mark-legacy --list", () => {
  it("표시 파일 목록을 종류별로 돌려준다", async () => {
    const dir = fixture({
      "ui/a/Bad.module.css": ".a { margin: 6px; }\n",
      "ui/a/Good.module.css": ".a { margin: 0; }\n",
    });
    await addCssMarks(dir);
    expect(listMarks(dir).css).toEqual(["ui/a/Bad.module.css"]);
  });

  it("CLI --list 출력의 종류별 개수가 훑은 표시 파일 수와 같다", () => {
    const out = execFileSync("node", ["scripts/design/mark-legacy.mjs", "--list"], {
      cwd: resolve(ROOT),
      encoding: "utf8",
    });
    const count = (label: string) => Number(new RegExp(`^${label}\\s+(\\d+)`, "m").exec(out)?.[1]);
    expect(count("CSS")).toBe(collectMarkedCssFiles(ROOT).length);
    expect(count("TSX")).toBe(collectMarked(ROOT, "tsx").length);
    expect(count("화면 틀")).toBe(collectMarked(ROOT, "frame").length);
  });
});

describe("mark-legacy --add(TSX · 화면 틀)", () => {
  const files = {
    "app/(app)/a/page.tsx": `import { PageHeader } from "@/ui/page-header/PageHeader";\nexport default function P() { return <table />; }\n`,
    "app/(app)/b/page.tsx": `"use client";\nimport { ListScreen } from "@/ui/list-screen/ListScreen";\nexport default function P() { return <ListScreen />; }\n`,
    "app/(app)/c/client.tsx": `"use client";\nexport function C() { return <dialog open />; }\n`,
    "app/(auth)/login/page.tsx": `export default function P() { return null; }\n`,
    "app/c/[token]/page.tsx": `export default function P() { return null; }\n`,
  };

  it("eslint 오류가 있는 파일에 TSX 표시를, 틀 위반 파일에 화면 틀 표시를 넣는다(예외 경로 제외)", async () => {
    const dir = fixture(files);
    expect((await addTsxMarks(dir)).sort()).toEqual(["app/(app)/a/page.tsx", "app/(app)/c/client.tsx"]);
    expect((await addFrameMarks(dir)).sort()).toEqual(["app/(app)/a/page.tsx"]);
    const a = readFileSync(join(dir, "app/(app)/a/page.tsx"), "utf8").split("\n");
    expect(a.slice(0, 2)).toEqual([MARKERS.frame, MARKERS.tsx]);
    const c = readFileSync(join(dir, "app/(app)/c/client.tsx"), "utf8").split("\n");
    expect(c.slice(0, 2)).toEqual([MARKERS.tsx, '"use client";']);
    expect(readFileSync(join(dir, "app/(app)/b/page.tsx"), "utf8")).toBe(files["app/(app)/b/page.tsx"]);
    expect(readFileSync(join(dir, "app/(auth)/login/page.tsx"), "utf8")).toBe(files["app/(auth)/login/page.tsx"]);
  });

  it("두 번 돌려도 표시는 한 줄뿐이다(멱등)", async () => {
    const dir = fixture(files);
    await addTsxMarks(dir);
    await addFrameMarks(dir);
    expect(await addTsxMarks(dir)).toEqual([]);
    expect(await addFrameMarks(dir)).toEqual([]);
    const text = readFileSync(join(dir, "app/(app)/a/page.tsx"), "utf8");
    expect(text.split(MARKERS.tsx).length - 1).toBe(1);
    expect(text.split(MARKERS.frame).length - 1).toBe(1);
  });

  it("--list가 종류별로 센다", async () => {
    const dir = fixture(files);
    await addTsxMarks(dir);
    await addFrameMarks(dir);
    const marks = listMarks(dir);
    expect(marks.tsx).toEqual(["app/(app)/a/page.tsx", "app/(app)/c/client.tsx"]);
    expect(marks.frame).toEqual(["app/(app)/a/page.tsx"]);
  });
});

describe("mark-legacy --audit(공통 §4 (a)~(f))", () => {
  it("(a)~(f) 각각을 한 줄씩 잡는다", () => {
    const dir = fixture({
      "app/(app)/x/x.module.css": `${MARKERS.css}\n.a { color: var(--bg); }\n.b { color: var(--g-100); }\n`,
      "app/(app)/x/page.tsx": [
        `${MARKERS.frame}`,
        `import { PageHeader } from "@/ui/page-header/PageHeader";`,
        `export default function P() {`,
        `  return (<div><table /><dialog /><StatusTag kind="ok" /><Link href={\`/admin/x?new=1#form\`} /></div>);`,
        `}`,
        ``,
      ].join("\n"),
    });
    const found = auditPaths(dir, ["app"]);
    const kinds = new Set(found.map((v: { kind: string }) => v.kind));
    expect([...kinds].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    const byKind = (k: string) => found.filter((v: { kind: string }) => v.kind === k);
    expect(byKind("a").map((v: { file: string }) => v.file).sort()).toEqual([
      "app/(app)/x/page.tsx",
      "app/(app)/x/x.module.css",
    ]);
    expect(byKind("d")).toHaveLength(2);
    expect(byKind("d").map((v: { line: number }) => v.line)).toEqual([2, 3]);
    expect(byKind("e")).toHaveLength(2);
    expect(byKind("b")).toHaveLength(1);
    expect(byKind("c")).toHaveLength(1);
    expect(byKind("f")).toHaveLength(1);
  });

  it("옛 이름 경계: 새 이름(--surface-base · --line-w · --radius-tag · --bar-bg · --text-aux)은 잡지 않는다", () => {
    const dir = fixture({
      "ui/a/A.module.css":
        ".a { background: var(--surface-base); border-width: var(--line-w); border-radius: var(--radius-tag); color: var(--bar-bg); font-size: var(--text-aux); box-shadow: var(--shadow-surface); }\n",
    });
    expect(auditPaths(dir, ["ui"])).toEqual([]);
  });

  it("깨끗한 픽스처는 0줄이다", () => {
    const dir = fixture({
      "ui/a/A.module.css": ".a { margin: var(--s-2); }\n",
      "app/(app)/x/page.tsx": `import { ListScreen } from "@/ui/list-screen/ListScreen";\nexport default function P() { return <ListScreen />; }\n`,
    });
    expect(auditPaths(dir, ["ui", "app"])).toEqual([]);
  });

  it("CLI: 위반이 있으면 종료 코드 1, 없으면 0이다", () => {
    const run = (path: string) => {
      try {
        const out = execFileSync("node", ["scripts/design/mark-legacy.mjs", "--audit", path], {
          cwd: resolve(ROOT),
          encoding: "utf8",
        });
        return { code: 0, out };
      } catch (error) {
        const e = error as { status: number; stdout: string };
        return { code: e.status, out: e.stdout };
      }
    };
    // 저장소에 이관 전 표시가 남은 화면 폴더가 없어도(04.6-22 뒤 pnl 0개) 「표시 있음 → 코드 1」은 임시 픽스처로 계속 잰다.
    const dir = fixture({
      "app/(app)/x/page.tsx": `${MARKERS.tsx}\nexport default function P() { return <table />; }\n`,
    });
    const bad = run(join(dir, "app"));
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/\(a\)/);
    expect(run("app/(auth)")).toEqual({ code: 0, out: "" });
  });
});

describe("mark-legacy 화면 틀 판정", () => {
  it("저장소의 틀 위반 파일은 전부 화면 틀 표시가 있다(스크립트 판정 — screen-frames 스캔과 같은 결과)", () => {
    const marked = new Set(collectMarked(ROOT, "frame"));
    const missing = collectAppSourceFiles(ROOT)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => frameViolations(f, readFileSync(resolve(ROOT, f), "utf8")).length > 0)
      .filter((f) => !marked.has(f));
    expect(missing).toEqual([]);
  });
});
