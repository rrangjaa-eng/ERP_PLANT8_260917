import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CSS_LEGACY_MARKER, collectMarkedCssFiles } from "../../../stylelint.config.mjs";
import { addCssMarks, listMarks } from "../../../scripts/design/mark-legacy.mjs";

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

  it("CLI --list 출력의 CSS 개수가 훑은 표시 파일 수와 같다", () => {
    const out = execFileSync("node", ["scripts/design/mark-legacy.mjs", "--list"], {
      cwd: resolve(ROOT),
      encoding: "utf8",
    });
    const match = /CSS\s+(\d+)/.exec(out);
    expect(match, out).not.toBeNull();
    expect(Number(match?.[1])).toBe(collectMarkedCssFiles(ROOT).length);
  });
});
