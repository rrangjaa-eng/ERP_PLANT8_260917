import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 묶음 ④ /review R14 — app/(app)/pnl/reserves/reserves.module.css. 소스 문자열 단언(admin-index-css.test.ts와 같은 방식).
const css = readFileSync(resolve(process.cwd(), "app", "(app)", "pnl", "reserves", "reserves.module.css"), "utf8");

describe("reserves.module.css — 복원 줄 폰 터치 높이(R14 · 견적 원장 S18과 같은 규칙)", () => {
  it("폰(<700)에서 .restoreAction은 min-height var(--touch-min)", () => {
    expect(css).toMatch(/@media \(max-width: 699\.98px\) \{[^@]*\.restoreAction\s*\{\s*min-height:\s*var\(--touch-min\);/);
  });
});
