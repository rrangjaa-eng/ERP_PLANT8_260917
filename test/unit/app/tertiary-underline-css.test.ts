import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SYSTEM §4-4 · §7-1 「3차 버튼 밑줄 1px → hover 2px」: 글자 밑줄로 그리는 3차 링크 · 버튼은 기본 두께 var(--line-w)와
// hover 두께 var(--line-w-strong) 규칙을 함께 가진다. 범위는 app/ · ui/ 아래 모든 CSS 모듈(공용 컴포넌트 포함 —
// 사용자 결정 2026-09-30). ui/button .tertiary도 글자 밑줄이라 이 스윕에 들어온다.
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
const OFFSET = /text-underline-offset\s*:\s*var\(--underline-offset\)/;
// 2026-09-30 실측: app/ · ui/ 밑줄 규칙 선택자 23개(ui/button .tertiary 포함).
const CHECKED_FLOOR = 23;

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

// FINDING-002(260930-f3l /design-review): 공유 Button .tertiary만 border-bottom 밑줄이라 폰 44 상자 바닥에 붙고
// hover에서 상자 높이가 19→20px로 자랐다. 다른 3차 링크처럼 글자 밑줄로 그린다(ListEmpty FINDING-005 선례).
describe("ui/button .tertiary — 글자 밑줄 (FINDING-002)", () => {
  const rules = parseRules(readFileSync(join(ROOT, "ui/button/Button.module.css"), "utf8"));
  const tertiary = rules.filter((rule) => rule.selectors.some((selector) => selector.startsWith(".tertiary")));

  it("밑줄을 border-bottom으로 그리지 않는다", () => {
    expect(tertiary.length).toBeGreaterThan(0);
    expect(tertiary.filter((rule) => /border-bottom/.test(rule.body))).toEqual([]);
  });

  it("기본 .tertiary 규칙이 글자 밑줄 · 기본 두께 · offset 토큰을 가진다", () => {
    const base = rules.find((rule) => rule.selectors.includes(".tertiary") && UNDERLINE.test(rule.body));
    expect(base).toBeDefined();
    expect(BASE_THICKNESS.test(base!.body)).toBe(true);
    expect(OFFSET.test(base!.body)).toBe(true);
  });

  it("hover 굵기는 aria-disabled 3차에 적용하지 않는다", () => {
    const hover = rules.find((rule) => rule.selectors.some((selector) => selector.startsWith(".tertiary:hover")));
    expect(hover?.selectors).toContain('.tertiary:hover:not([aria-disabled="true"])');
    expect(hover?.body).toMatch(HOVER_THICKNESS);
  });

  it("aria-disabled 3차는 밑줄 색을 var(--line)으로 흐리게 한다", () => {
    const disabled = rules.find((rule) => rule.selectors.includes('.tertiary[aria-disabled="true"]'));
    expect(disabled?.body).toMatch(/text-decoration-color\s*:\s*var\(--line\)/);
  });

  // PR #111 Codex 리뷰(P2): 대기 중 라벨 span과 「…」 span 사이 .btn gap 8px 때문에 글자 밑줄이 두 토막으로 그어졌다.
  it("기본 .tertiary 규칙이 flex gap을 0으로 둬 대기 중 라벨과 「…」 밑줄이 이어진다", () => {
    const base = rules.find((rule) => rule.selectors.includes(".tertiary") && UNDERLINE.test(rule.body));
    expect(base?.body).toMatch(/(^|;)\s*gap\s*:\s*0\s*(;|$)/);
  });
});
