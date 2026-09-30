import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SYSTEM §4-4 · §7-1 「3차 버튼 밑줄 1px → hover 2px」: 밑줄로 그리는 3차 링크·버튼 규칙은 기본 두께 var(--line-w)와
// hover 두께 var(--line-w-strong) 규칙을 함께 가진다. 범위는 app/ · ui/ 아래 모든 .module.css(공용 컴포넌트 포함 —
// 사용자 결정 2026-09-30). ui/button .tertiary는 border-bottom 방식이라 text-decoration 스윕 밖이다.
// 선례: reserves-css.test.ts(규칙 문자열 단언) · no-admin-boolean.test.ts(파일 스윕).
const ROOTS = ["app", "ui"];

function moduleCssFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".module.css"))
    .map((path) => join(root, path));
}

type Rule = { selectors: string[]; body: string };

// 중괄호 안에 중괄호가 없는 「선택자 { 본문 }」 조각 — @media 안의 규칙도 같은 방식으로 잡힌다.
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
const THICKNESS = (token: string) => new RegExp(`text-decoration-thickness\\s*:\\s*var\\(${token}\\)`);

function violations(): string[] {
  const found: string[] = [];
  for (const file of ROOTS.flatMap(moduleCssFiles)) {
    const rules = rulesOf(readFileSync(file, "utf8"));
    for (const rule of rules) {
      if (!UNDERLINE.test(rule.body)) continue;
      if (rule.selectors.some((selector) => /:(hover|focus)/.test(selector))) continue;
      for (const selector of rule.selectors) {
        if (!THICKNESS("--line-w").test(rule.body)) found.push(`${file}: ${selector} (기본 두께 var(--line-w) 없음)`);
        const hover = rules.some(
          (other) =>
            THICKNESS("--line-w-strong").test(other.body) &&
            other.selectors.some((candidate) => candidate.startsWith(`${selector}:hover`)),
        );
        if (!hover) found.push(`${file}: ${selector} (:hover var(--line-w-strong) 없음)`);
      }
    }
  }
  return found;
}

describe("밑줄 3차 링크·버튼 — 기본 1px, hover 2px (SYSTEM §4-4 · §7-1)", () => {
  it("app/ · ui/ 모든 CSS 모듈의 밑줄 규칙이 base var(--line-w)와 :hover var(--line-w-strong)를 함께 가진다", () => {
    expect(violations()).toEqual([]);
  });
});
