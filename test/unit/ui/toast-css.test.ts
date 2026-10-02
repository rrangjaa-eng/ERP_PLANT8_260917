import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-17 DOM 감사 C-L1 — 토스트는 왼쪽만 --pad-page라 긴 문장이 폰(375 · 320) 오른쪽 끝에 붙었다.
// 오른쪽에도 같은 여백이 남도록 폭 상한을 기존 토큰으로 건다(선례: test/unit/certs/intake-css.test.ts 소스 단언).
const css = readFileSync(join(process.cwd(), "ui/toast/Toast.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe(".toast — 좌우 --pad-page 여백(C-L1)", () => {
  it("max-width가 화면 폭에서 --pad-page 두 번을 뺀 값이다", () => {
    const body = /(?:^|\})\s*\.toast\s*\{([^{}]*)\}/.exec(css)?.[1] ?? "";
    expect(body).toMatch(/max-width:\s*calc\(100vw - 2 \* var\(--pad-page\)\);/);
  });
});
