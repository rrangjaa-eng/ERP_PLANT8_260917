import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 07.4-01 — 공용 인쇄 틀 CSS · TSX 소스 단언(이 저장소에는 컴포넌트 렌더 환경이 없다). 실측은 독립 DOM 감사가 한다.

const DIR = resolve(process.cwd(), "app", "print", "_frame");
const css = readFileSync(resolve(DIR, "print-frame.module.css"), "utf8");
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const escaped = selector.replace(/[.[\]="()]/g, "\\$&");
  const match = cssNoComments.match(new RegExp(`(?:^|[\\s},])${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`규칙을 찾을 수 없다: ${selector}`);
  return match[1] ?? "";
}

describe("@page · 여러 쪽", () => {
  it("A4 세로 · 여백 22/22/20mm · 바닥줄 margin box", () => {
    expect(cssNoComments).toMatch(/@page\s*\{[\s\S]*size:\s*A4 portrait/);
    expect(cssNoComments).toContain("margin: 22mm 22mm 20mm");
    expect(cssNoComments).toContain("@bottom-left");
    expect(cssNoComments).toContain("counter(page) \" / \" counter(pages)");
  });

  it("thead는 쪽마다 반복 · tr은 쪽 경계에 걸리지 않음 · h2는 홀로 남지 않음 · orphans/widows 3", () => {
    expect(rule(".table thead")).toMatch(/display:\s*table-header-group/);
    expect(rule(".table tr")).toMatch(/break-inside:\s*avoid/);
    expect(rule(".section")).toMatch(/break-after:\s*avoid/);
    expect(cssNoComments).toMatch(/orphans:\s*3/);
    expect(cssNoComments).toMatch(/widows:\s*3/);
  });

  it("종이는 min-height만 있고 고정 높이 297mm가 없다", () => {
    expect(rule(".sheet")).toMatch(/min-height:\s*297mm/);
    expect(cssNoComments).not.toMatch(/(?<!min-)height:\s*297mm/);
  });
});

describe("색 · 선", () => {
  it("세로 테두리 · 배경 이미지 · 날 색 리터럴이 없다", () => {
    expect(cssNoComments).not.toMatch(/border-(left|right)\b/);
    expect(cssNoComments).not.toMatch(/background-image/);
    expect(cssNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it("색 var는 허용 목록뿐이다", () => {
    const colorVars = [...cssNoComments.matchAll(/(?:color|background|outline|border(?:-[a-z]+)?):[^;]*var\((--[a-z0-9-]+)\)/g)].map((m) => m[1] ?? "");
    for (const name of colorVars) {
      expect(name, name).toMatch(/^--(print-ink|print-rule|print-line|surface-[a-z]+|border-surface|status-danger|accent|line-w|print-rule-w|s-\d+)$/);
    }
  });

  it("2px 구조 선은 var(--print-rule-w) solid var(--print-rule)로만 적는다", () => {
    expect(cssNoComments).not.toContain("2px solid");
    expect(cssNoComments.match(/var\(--print-rule-w\) solid var\(--print-rule\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("화면 바 · 쪽 나눔 예외 · caption", () => {
  it(".bar는 min(210mm, 100%) 폭(F5)", () => {
    expect(rule(".bar")).toContain("min(210mm, 100%)");
  });

  // 독립 DOM 감사 D1 — <hr>의 브라우저 기본 border(1px inset 회색)가 좌 · 우 · 아래에 남으면 세로선과 회색 선이 생긴다. 위 한 줄만 그린다.
  it(".rule(제목 괘선 hr)은 기본 border를 지운 뒤 위 한 줄만 그린다(D1)", () => {
    const rule_ = rule(".rule");
    expect(rule_).toMatch(/border:\s*0\s*;/);
    expect(rule_.indexOf("border: 0")).toBeLessThan(rule_.indexOf("border-top"));
    expect(rule_).toMatch(/border-top:\s*var\(--print-rule-w\) solid var\(--print-rule\)/);
  });

  it(".rowBreakable만 break-inside: auto이고 dl 행은 avoid(F6)", () => {
    expect(rule(".rowBreakable")).toMatch(/break-inside:\s*auto/);
    expect(rule(".row")).toMatch(/break-inside:\s*avoid/);
  });

  it("caption 숨김 클래스 .srOnly는 화면 · 인쇄 모두 안 보인다(F14)", () => {
    const srOnly = rule(".srOnly");
    expect(srOnly).toMatch(/clip|width:\s*1px/);
  });

  it("인쇄 미디어에서 화면 바가 사라지고 종이가 접힌다", () => {
    const printBlock = cssNoComments.slice(cssNoComments.indexOf("@media print"));
    expect(printBlock).toMatch(/\.bar[\s\S]*display:\s*none/);
    expect(printBlock).toMatch(/\.sheet\s*\{[^}]*width:\s*auto/);
  });
});

describe("손익 칸 틀 CSS (07.4-03이 쓴다 — eng 검토 C1 · B3)", () => {
  it(".metricRow는 4열 grid + break-inside: avoid", () => {
    const row = rule(".metricRow");
    expect(row).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
    expect(row).toMatch(/break-inside:\s*avoid/);
  });

  it(".metricCell 윗선 · .metricLabel 12px 600 · .metricValue 14px 700 · 24px 없음 · .metricNote 12px", () => {
    expect(rule(".metricCell")).toContain("var(--line-w) solid var(--print-line)");
    expect(rule(".metricLabel")).toMatch(/font-size:\s*12px/);
    expect(rule(".metricValue")).toMatch(/font-size:\s*14px/);
    expect(rule(".metricValue")).toMatch(/font-weight:\s*var\(--fw-bold\)/);
    for (const name of [".metricRow", ".metricCell", ".metricLabel", ".metricValue"]) expect(rule(name)).not.toContain("24px");
    expect(rule(".metricNote")).toMatch(/font-size:\s*12px/);
  });
});

describe("TSX 소스", () => {
  it("PrintTable은 실제 thead · caption · tfoot을 쓴다", () => {
    const source = readFileSync(resolve(DIR, "PrintTable.tsx"), "utf8");
    expect(source).toContain("<thead");
    expect(source).toContain("<caption");
    expect(source).toContain("<tfoot");
    expect(source).not.toMatch(/style=\{/);
  });
});
