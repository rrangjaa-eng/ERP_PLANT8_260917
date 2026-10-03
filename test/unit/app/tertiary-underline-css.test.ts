import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SYSTEM §4-4 · §7-1 「3차 버튼 밑줄 1px → hover 2px」: 글자 밑줄로 그리는 3차 링크 · 버튼은 기본 두께 var(--line-w)와
// hover 두께 var(--underline-w-hover) 규칙을 함께 가진다. 범위는 app/ · ui/ 아래 모든 CSS 모듈(공용 컴포넌트 포함 —
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
// hover 두께는 역할 토큰 `--underline-w-hover`(2px) 하나만 받는다(Round 2 M1 ④ — 05의 옛 이름 대안은 04.6-28이 지웠다).
const HOVER_THICKNESS = /text-decoration-thickness\s*:\s*var\(--underline-w-hover\)/;
// §4-4 「text-underline-offset: 2px」 — 값은 토큰으로(사용자 결정 2026-09-30 /review D1).
const OFFSET = /text-underline-offset\s*:\s*var\(--underline-offset\)/;
// 하한은 숫자가 아니라 이름 있는 기준점이다(Round 2 M1) — 화면 플랜이 app/ 밑줄 규칙을 RowActions로 걷어도 내려가지 않는다.
// 공용 두 파일(ui/button의 `.tertiary` · ui/row-actions의 행동 링크 `.action`)이 검사 선택자로 잡히고, 그 두 파일의 검사 선택자 수가
// 실측(2026-10-02 · 04.6-05: Button 1 + RowActions 1) 아래로 내려가면 파서가 규칙을 못 잡는 것이다.
const REFERENCE_SELECTORS = [
  { file: "ui/button/Button.module.css", selector: ".tertiary" },
  { file: "ui/row-actions/RowActions.module.css", selector: ".action" },
] as const;
const SHARED_SELECTOR_FLOOR = 2;

function violations(file: string): { checked: number; selectors: string[]; found: string[] } {
  const rules = parseRules(readFileSync(join(ROOT, file), "utf8"));
  const found: string[] = [];
  const selectors: string[] = [];
  let checked = 0;
  for (const rule of rules) {
    if (!UNDERLINE.test(rule.body)) continue;
    // hover · focus 때만 긋는 규칙은 기본 밑줄이 아니다.
    if (rule.selectors.some((selector) => /:hover|:focus/.test(selector))) continue;
    for (const selector of rule.selectors) {
      checked += 1;
      selectors.push(selector);
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
  return { checked, selectors, found };
}

describe("3차 링크 · 버튼 밑줄 두께 — 1px → hover 2px (SYSTEM §4-4 · §7-1)", () => {
  const files = [...moduleCssFiles("app"), ...moduleCssFiles("ui")];

  it("app/ · ui/ CSS 모듈을 하나 이상 읽는다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("밑줄 규칙마다 기본 var(--line-w) · offset var(--underline-offset)와 :hover 두께(--underline-w-hover) 규칙이 있다", () => {
    const results = files.map((file) => violations(file));
    expect(results.flatMap((result) => result.found)).toEqual([]);
  });

  it("이름 있는 기준점 — 공용 ui/button .tertiary · ui/row-actions 행동 링크가 검사 선택자에 들어 있다(파서가 규칙을 못 잡으면 빈 목록으로 통과하는 것을 막는다)", () => {
    for (const { file, selector } of REFERENCE_SELECTORS) {
      expect(violations(file).selectors, `${file}의 검사 선택자`).toContain(selector);
    }
    const shared = REFERENCE_SELECTORS.reduce((sum, { file }) => sum + violations(file).checked, 0);
    expect(shared).toBeGreaterThanOrEqual(SHARED_SELECTOR_FLOOR);
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

  // 04.6-08이 Button.module.css를 새 역할 이름(--border-strong)으로 옮겼다 — 옛 이름 대안은 받지 않는다.
  it("aria-disabled 3차는 밑줄 색을 var(--border-strong)으로 흐리게 한다", () => {
    const disabled = rules.find((rule) => rule.selectors.includes('.tertiary[aria-disabled="true"]'));
    expect(disabled?.body).toMatch(/text-decoration-color\s*:\s*var\(--border-strong\)/);
  });

  // PR #111 Codex 리뷰(P2): 대기 중 라벨 span과 「…」 span 사이 .btn gap 8px 때문에 글자 밑줄이 두 토막으로 그어졌다.
  it("기본 .tertiary 규칙이 flex gap을 0으로 둬 대기 중 라벨과 「…」 밑줄이 이어진다", () => {
    const base = rules.find((rule) => rule.selectors.includes(".tertiary") && UNDERLINE.test(rule.body));
    expect(base?.body).toMatch(/(^|;)\s*gap\s*:\s*0\s*(;|$)/);
  });
});

// 04.6-05 Round 2 M1: 행동 링크(RowActions)의 hover 두께는 역할 토큰 --underline-w-hover(2px)다 — 과도기 옛 이름 대안을 받지 않는다.
describe("ui/row-actions 행동 링크 — hover 두께는 --underline-w-hover", () => {
  const rules = parseRules(readFileSync(join(ROOT, "ui/row-actions/RowActions.module.css"), "utf8"));
  const underlined = rules.filter((rule) => UNDERLINE.test(rule.body) && !rule.selectors.some((selector) => /:hover|:focus/.test(selector)));

  it("밑줄 선택자마다 같은 선택자 :hover 규칙이 var(--underline-w-hover)를 가진다", () => {
    expect(underlined.length).toBeGreaterThan(0);
    for (const rule of underlined) {
      for (const selector of rule.selectors) {
        const hover = rules.find((other) => other.selectors.some((item) => item.startsWith(`${selector}:hover`)));
        expect(hover?.body, `${selector}:hover`).toMatch(/text-decoration-thickness\s*:\s*var\(--underline-w-hover\)/);
      }
    }
  });

  it("비활성 행동은 hover 굵기를 받지 않는다", () => {
    const hover = rules.find((rule) => rule.selectors.some((selector) => selector.startsWith(".action:hover")));
    expect(hover?.selectors).toContain('.action:hover:not([aria-disabled="true"])');
  });
});
