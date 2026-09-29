import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 묶음 ④ /review R14 · R15 — app/(app)/pnl/reserves/reserves.module.css. 소스 문자열 단언(admin-index-css.test.ts와 같은 방식).
const css = readFileSync(resolve(process.cwd(), "app", "(app)", "pnl", "reserves", "reserves.module.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.]/g, "\\.");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`규칙을 찾을 수 없다: ${selector}`);
  return match[1] ?? "";
}

describe("reserves.module.css — 복원 줄 폰 터치 높이(R14 · 견적 원장 S18과 같은 규칙)", () => {
  it("폰(<700)에서 .restoreAction은 min-height var(--touch-min)", () => {
    expect(css).toMatch(/@media \(max-width: 699\.98px\) \{[^@]*\.restoreAction\s*\{\s*min-height:\s*var\(--touch-min\);/);
  });
});

describe("reserves.module.css — 다른 쪽 잔액 거부 링크 선 토큰(R15)", () => {
  it(".batchErrorLink 밑줄 두께·간격은 --line-w · --underline-offset", () => {
    const link = rule(".batchErrorLink");
    expect(link).toMatch(/text-decoration-thickness:\s*var\(--line-w\)/);
    expect(link).toMatch(/text-underline-offset:\s*var\(--underline-offset\)/);
    expect(link).not.toMatch(/\d+px/);
  });

  it(".batchErrorLink:hover 두께는 --line-w-strong", () => {
    expect(rule(".batchErrorLink:hover")).toMatch(/text-decoration-thickness:\s*var\(--line-w-strong\)/);
  });
});
