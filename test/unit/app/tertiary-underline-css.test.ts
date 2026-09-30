import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SYSTEM §4-4 · §7-1 「3차 버튼 밑줄 1px → hover 2px」: 글자 밑줄로 그리는 3차 링크 · 버튼은 기본 두께 var(--line-w)와
// hover 두께 var(--line-w-strong) 규칙을 함께 가진다. 범위는 app/ · ui/ 아래 모든 CSS 모듈(공용 컴포넌트 포함 —
// 사용자 결정 2026-09-30). ui/button .tertiary는 border-bottom 방식이라 text-decoration 스윕 밖이다.
// 선례: reserves-css.test.ts(소스 문자열 단언) · no-admin-boolean.test.ts(readdirSync 루프).
const ROOT = process.cwd();

function moduleCssFiles(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((file) => file.endsWith(".module.css"))
    .map((file) => join(dir, file));
}

type Rule = { selectors: string[]; body: string };

// 중괄호 안에 중괄호가 없는 「선택자 { 본문 }」 조각 — @media 안 규칙도 같은 방식으로 잡힌다.
function parseRules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? "")
      .split(",")
      .map((selector) => selector.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    body: match[2] ?? "",
  }));
}

const UNDERLINE = /text-decoration(?:-line)?\s*:[^;]*\bunderline\b/;
const BASE_THICKNESS = /text-decoration-thickness\s*:\s*var\(--line-w\)/;
const HOVER_THICKNESS = /text-decoration-thickness\s*:\s*var\(--line-w-strong\)/;
// §4-4 「text-underline-offset: 2px」 — 값은 토큰으로(사용자 결정 2026-09-30 /review D1).
// 2026-09-30 실측: app/ · ui/ 밑줄 규칙 선택자 22개.
const CHECKED_FLOOR = 22;
const OFFSET = /text-underline-offset\s*:\s*var\(--underline-offset\)/;

function violations(file: string): { checked: number; found: string[] } {
  const rules = parseRules(readFileSync(join(ROOT, file), "utf8"));
  const found: string[] = [];
  let checked = 0;
  for (const rule of rules) {
    if (!UNDERLINE.test(rule.body)) continue;
    // hover · focus 때만 긋는 규칙은 기본 밑줄이 아니다.
    if (rule.selectors.some((selector) => /:hover|:focus/.test(selector))) continue;
    for (const selector of rule.selectors) {
      checked += 1;
      const hasBase = BASE_THICKNESS.test(rule.body);
      const hasOffset = OFFSET.test(rule.body);
      const hasHover = rules.some(
        (other) => HOVER_THICKNESS.test(other.body) && other.selectors.some((item) => item.startsWith(`${selector}:hover`)),
      );
      if (!hasBase || !hasHover || !hasOffset) {
        found.push(
          `${file}: ${selector}${hasBase ? "" : " (기본 두께 없음)"}${hasHover ? "" : " (hover 두께 없음)"}${hasOffset ? "" : " (offset 토큰 없음)"}`,
        );
      }
    }
  }
  return { checked, found };
}

describe("3차 링크 · 버튼 밑줄 두께 — 1px → hover 2px (SYSTEM §4-4 · §7-1)", () => {
  const files = [...moduleCssFiles("app"), ...moduleCssFiles("ui")];

  it("app/ · ui/ CSS 모듈을 하나 이상 읽는다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("밑줄 규칙마다 기본 var(--line-w) · offset var(--underline-offset)와 :hover var(--line-w-strong) 규칙이 있다", () => {
    const results = files.map((file) => violations(file));
    // 파서가 규칙을 못 잡으면 빈 목록으로 통과해 버린다 — 지금 검사하는 선택자 수를 하한으로 둔다(밑줄 규칙을 지우면 이 수를 함께 고친다).
    expect(results.reduce((sum, result) => sum + result.checked, 0)).toBeGreaterThanOrEqual(CHECKED_FLOOR);
    expect(results.flatMap((result) => result.found)).toEqual([]);
  });
});
