import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// §3 터치 목표(04.2 /design-review 재실측 이월): ERROR 행의 「다시 시도」(.secondary)도 폰(700px 미만)에서
// 최소 44px 높이를 가진다 — 옆 .tertiary와 같은 폰 전용 규칙. ERROR 상태를 E2E로 띄우기 어려워 소스로 단언한다
// (선례: tertiary-underline-css.test.ts).
const source = readFileSync(resolve(process.cwd(), "ui/list-empty/ListEmpty.module.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

// 폰 미디어 쿼리 블록(여럿일 수 있다)의 본문을 이어 붙인다.
function phoneRules(): string {
  const bodies: string[] = [];
  let start = source.indexOf("@media (max-width: 699.98px)");
  while (start >= 0) {
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      if (source[i] === "}") depth--;
      if (depth === 0) {
        bodies.push(source.slice(open + 1, i));
        break;
      }
    }
    start = source.indexOf("@media (max-width: 699.98px)", open);
  }
  expect(bodies.length, "폰 미디어 쿼리가 없다").toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("ui/list-empty 폰 터치 목표", () => {
  it(".secondary는 폰에서 min-height var(--touch-min)", () => {
    const rule = [...phoneRules().matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) =>
      (m[1] ?? "").split(",").some((s) => s.trim() === ".secondary"),
    );
    expect(rule, "폰 미디어 쿼리 안에 .secondary 규칙이 없다").toBeDefined();
    expect(rule?.[2]).toMatch(/min-height\s*:\s*var\(--touch-min\)/);
  });
});
