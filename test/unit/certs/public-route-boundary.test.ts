import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.3-15 Task 2 ③ — 가액 경계(5905714131): app/c/** 어느 파일도 가액 판정 모듈을 import하지 않고 가액 필드
// 이름을 갖지 않으며, domain/certs/intake.ts에서 가액 칸 이름은 certPrizeListed( 호출 줄에만 나온다.
// 04.3-02 Task 3 ④ — 공개 경로 경계(T-04.3-09 · T-04.3-25). 정적 텍스트
// 검사로 고정한다: `app/c/**` 어떤 파일도 `@/lib/viewer` ·
// `@/domain/permissions/`를 import하지 않고, `app/**`에서 `publicActionClient`
// 를 쓰는 파일은 전부 `app/c/` 아래이며, `domain/certs/intake.ts`가
// `can`·`visible`·`scopeFor`를 import하지 않는다.

const ROOT = process.cwd();

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      results.push(...listSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(full);
    }
  }
  return results;
}

describe("공개 경로 경계 (T-04.3-09 · T-04.3-25)", () => {
  it("app/c/** 의 어떤 파일도 lib/viewer · domain/permissions/를 import하지 않는다", () => {
    const files = listSourceFiles(resolve(ROOT, "app/c"));
    const violations = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /@\/lib\/viewer\b/.test(content) || /@\/domain\/permissions\//.test(content);
    });
    expect(violations).toEqual([]);
  });

  it("app/** 전체에서 publicActionClient를 쓰는 파일은 전부 app/c/ 아래다", () => {
    const files = listSourceFiles(resolve(ROOT, "app"));
    const usingPublicClient = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /\bpublicActionClient\b/.test(content);
    });
    expect(usingPublicClient.length).toBeGreaterThan(0);
    const outsideCertDir = usingPublicClient.filter((file) => !file.includes(`${join("app", "c")}${"/"}`));
    expect(outsideCertDir).toEqual([]);
  });

  it("domain/certs/intake.ts가 can · visible · scopeFor를 import하지 않는다", () => {
    const content = readFileSync(resolve(ROOT, "domain/certs/intake.ts"), "utf8");
    expect(/@\/domain\/permissions\/can\b/.test(content)).toBe(false);
    expect(/@\/domain\/permissions\/visible\b/.test(content)).toBe(false);
    expect(/@\/domain\/permissions\/scope-for\b/.test(content)).toBe(false);
  });
});

// /review — C1 첫 겹(액션 · 페이지 첫 줄 가드)을 따로 고정한다. E2E 직접 POST는
// 설정 cert.enabled를 끄므로 domain 두 겹째도 notFound를 내, 첫 줄을 지워도
// 녹색이다(첫 겹을 증명하지 못한다).
describe("규약 C1 첫 겹 — 공개 진입점 첫 문장", () => {
  it("app/c/[token]/actions.ts의 .action 본문(04.3-15 — 제출 하나) 첫 문장이 await assertCertFeatureEnabled()다", () => {
    const src = readFileSync(resolve(ROOT, "app/c/[token]/actions.ts"), "utf8");
    const firstStatements = [...src.matchAll(/\.action\(async \([^)]*\) => \{\s*([^;\n]+);/g)].map((m) => m[1]?.trim());
    expect(firstStatements).toEqual(Array(1).fill("await assertCertFeatureEnabled()"));
  });

  it("app/c/[token]/page.tsx 기본 export의 첫 문장이 await assertCertFeatureEnabled()다", () => {
    const src = readFileSync(resolve(ROOT, "app/c/[token]/page.tsx"), "utf8");
    expect(src).toMatch(/export default async function \w+\([^)]*\)[^{]*\{\s*await assertCertFeatureEnabled\(\);/);
  });
});

describe("가액 경계 — 수령자 쪽 코드(04.3-15 · 5905714131)", () => {
  const VALUE_FIELD_NAMES = /unitValue|unit_value|prizeValue|prize_value|가액/;

  it("app/c/** 어느 파일도 prize-value 모듈을 import하지 않고 가액 필드 이름이 없다", () => {
    const files = listSourceFiles(resolve(ROOT, "app/c"));
    expect(files.length).toBeGreaterThan(0);
    const violations = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /prize-value/.test(content) || VALUE_FIELD_NAMES.test(content);
    });
    expect(violations).toEqual([]);
  });

  it("domain/certs/intake.ts에서 가액 칸 이름이 나오는 줄은 모두 certPrizeListed( 호출 줄이다", () => {
    const lines = readFileSync(resolve(ROOT, "domain/certs/intake.ts"), "utf8").split("\n");
    const valueLines = lines.filter((line) => /unitValue|unit_value/.test(line));
    expect(valueLines.length).toBeGreaterThan(0);
    expect(valueLines.filter((line) => !line.includes("certPrizeListed("))).toEqual([]);
  });
});
