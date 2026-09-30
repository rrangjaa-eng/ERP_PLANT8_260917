import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression: /design-review FINDING-002 — 복원 줄·표 문제 줄의 3차 버튼 밑줄에 offset이 빠져 auto로 그려졌다.
// SYSTEM §4-4 「3차 버튼 밑줄 | text-underline-offset: 2px」: 밑줄로 그리는 3차 링크·버튼 규칙은 offset을 함께 가진다.
// 범위와 규칙 조각 방식은 tertiary-underline-css.test.ts와 같다. ui/toast는 토큰 대신 2px 리터럴을 쓴다(계획에서 손대지 않기로 함).
const ROOTS = ["app", "ui"];

function moduleCssFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".module.css"))
    .map((path) => join(root, path));
}

type Rule = { selectors: string[]; body: string };

function rulesOf(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? "")
      .split(",")
      .map((selector) => selector.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    body: match[2] ?? "",
  }));
}

const UNDERLINE = /text-decoration(?:-line)?\s*:[^;]*\bunderline\b/;
const OFFSET = /text-underline-offset\s*:\s*(?:var\(--underline-offset\)|2px)/;

function violations(): string[] {
  const found: string[] = [];
  for (const file of ROOTS.flatMap(moduleCssFiles)) {
    for (const rule of rulesOf(readFileSync(file, "utf8"))) {
      if (!UNDERLINE.test(rule.body)) continue;
      if (rule.selectors.some((selector) => /:(hover|focus)/.test(selector))) continue;
      if (!OFFSET.test(rule.body)) found.push(`${file}: ${rule.selectors.join(", ")}`);
    }
  }
  return found;
}

describe("밑줄 3차 링크·버튼 — offset 2px (SYSTEM §4-4)", () => {
  it("app/ · ui/ 모든 CSS 모듈의 밑줄 규칙이 text-underline-offset var(--underline-offset)를 가진다", () => {
    expect(violations()).toEqual([]);
  });
});
