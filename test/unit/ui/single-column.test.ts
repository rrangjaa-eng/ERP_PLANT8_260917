import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// F-02(260922-o2b) — SYSTEM.md §3 「단일 기둥 최대 폭」과 전역 `.single-column`
// 유틸리티의 소스 계약을 고정한다. vitest unit은 node 환경이라 RTL이 없다 —
// design-system-docs.test.ts·system-md-compliance.test.ts와 같은 방식으로
// readFileSync 소스 단언을 쓴다.

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

const SYSTEM = read("docs", "design", "SYSTEM.md");
const DECISIONS = read("docs", "design", "DECISIONS.md");
const TOKENS = read("docs", "design", "tokens.css");
const GLOBALS = read("app", "globals.css");

function section(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  const end = doc.indexOf(endHeading);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`구간을 찾을 수 없다: '${startHeading}' ~ '${endHeading}'`);
  }
  return doc.slice(start, end);
}

export const TARGETS = [
  "app/(app)/account/page.tsx",
  "app/(app)/admin/page.tsx",
  "app/(app)/admin/settings/page.tsx",
  "app/(app)/admin/people/[id]/page.tsx",
  "app/(app)/admin/people/org/page.tsx",
  "app/(app)/admin/system-status/page.tsx",
  "app/(app)/admin/vendors/vendor-form.tsx",
  "app/(app)/admin/corp-cards/card-form.tsx",
  "app/(app)/admin/code-tables/code-item-form.tsx",
  "app/(app)/admin/people/person-form.tsx",
  "app/(app)/admin/people/roles/roles-client.tsx",
];

describe("docs/design/SYSTEM.md — 단일 기둥 최대 폭 (§3, F-02)", () => {
  const section3 = section(SYSTEM, "## 3. 간격", "## 4. 형태");

  it("§3에 「단일 기둥 최대 폭」 절이 있다", () => {
    expect(section3).toContain("단일 기둥 최대 폭");
  });

  it("§3 절 안에 max-width: var(--form-max)가 있다", () => {
    expect(section3).toContain("max-width: var(--form-max)");
  });

  it("§3 절 안에 .single-column 구현 지시가 있다", () => {
    expect(section3).toContain(".single-column");
  });

  it("§2-3 「- 줄 길이:」 줄이 체크박스 매트릭스와 --form-max를 말한다", () => {
    const section2 = section(SYSTEM, "### 2-3", "### 2-4");
    const lineLengthLine = section2
      .split("\n")
      .find((line) => line.trim().startsWith("- 줄 길이:"));
    expect(lineLengthLine).toBeDefined();
    expect(lineLengthLine).toContain("체크박스 매트릭스");
    expect(lineLengthLine).toContain("--form-max");
  });
});

describe("docs/design/DECISIONS.md — 단일 기둥 최대 폭 기록", () => {
  it("2026-09-22 「단일 기둥 최대 폭」 머리글이 있다", () => {
    expect(DECISIONS).toContain("## 2026-09-22 — 단일 기둥 최대 폭");
  });
});

describe("docs/design/tokens.css — --form-max 주석 확장", () => {
  it("--form-max 줄 주석에 「단일 기둥」이 있다", () => {
    const line = TOKENS.split("\n").find((l) => l.trim().startsWith("--form-max:"));
    expect(line).toBeDefined();
    expect(line).toContain("단일 기둥");
  });
});

describe("app/globals.css — .single-column 전역 유틸리티", () => {
  it(".single-column 블록에 max-width: var(--form-max)가 있다", () => {
    const match = GLOBALS.match(/\.single-column\s*\{[^}]*\}/);
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain("max-width: var(--form-max)");
  });
});

describe("적용 대상 화면·폼 — className=\"single-column\"", () => {
  it.each(TARGETS)("%s에 single-column이 있다", (relPath) => {
    const source = read(...relPath.split("/"));
    expect(source).toContain("single-column");
  });
});
