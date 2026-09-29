import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-06 DOM 감사 N3 — app/c/[token]/intake.module.css. 소스 문자열 단언(reserves-css.test.ts와 같은 방식).
const css = readFileSync(resolve(process.cwd(), "app", "c", "[token]", "intake.module.css"), "utf8");
const tokens = readFileSync(resolve(process.cwd(), "docs", "design", "tokens.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.]/g, "\\.");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`규칙을 찾을 수 없다: ${selector}`);
  return match[1] ?? "";
}

describe("intake.module.css — 동의 전문 줄 길이는 토큰(N3 · SYSTEM §2-3)", () => {
  it("--measure는 64ch다(값이 같아 바꿔도 보이는 변화 없음)", () => {
    expect(tokens).toMatch(/--measure:\s*64ch;/);
  });

  it(".consentFull max-width는 var(--measure) — 64ch 리터럴 없음", () => {
    expect(rule(".consentFull")).toMatch(/max-width:\s*var\(--measure\);/);
    expect(css).not.toMatch(/\b64ch\b/);
  });
});
