import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-16 V1 · V2 — 수령자 화면 CSS 소스 단언(선례: test/unit/app/reserves-css.test.ts).
// V2: `.telLink`의 `1lh` margin은 iOS Safari 16.4 이상만 안다 — 그 앞에 `--lh-body` 대체 선언을 두고, 둘 다 양수로
// 넘어가지 않게 min(0px, …)로 묶는다(양수 margin이 되면 줄 상자가 늘어난다). 기존 토큰만 쓴다.
// V1: 전화 링크 뒤 조사 「에」는 링크와 함께 줄바꿈 금지 묶음이다.
const css = readFileSync(join(process.cwd(), "app/c/[token]/intake.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function ruleBody(selector: string): string {
  const match = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^{}]*)\\}`).exec(css);
  if (!match) throw new Error(`${selector} 규칙 없음`);
  return match[1] ?? "";
}

describe(".telLink — margin-block 대체 선언(V2)", () => {
  const marginDeclarations = [...ruleBody(".telLink").matchAll(/margin-block:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim());

  it("margin-block 선언이 둘이고, 1lh 선언 앞에 --lh-body 대체 선언이 있다", () => {
    expect(marginDeclarations).toHaveLength(2);
    expect(marginDeclarations[0]).toContain("var(--lh-body)");
    expect(marginDeclarations[0]).not.toContain("1lh");
    expect(marginDeclarations[1]).toContain("1lh");
  });

  it("두 선언 모두 min(0px, …)로 양수가 되지 않게 묶고 --touch-min 토큰만 쓴다", () => {
    for (const declaration of marginDeclarations) {
      expect(declaration.startsWith("min(0px,")).toBe(true);
      expect(declaration).toContain("var(--touch-min)");
    }
  });
});

describe(".telGroup — 링크 + 조사 「에」 줄바꿈 금지 묶음(V1)", () => {
  it("white-space: nowrap", () => {
    expect(ruleBody(".telGroup")).toMatch(/white-space:\s*nowrap\s*;/);
  });
});
