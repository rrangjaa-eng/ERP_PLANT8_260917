import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProjectsLoading from "@/app/(app)/projects/loading";

// 04-48 Task 3(UI-SPEC S1 loading · SYSTEM.md 개정 ③ §7-7 · 사용자 D17) — 목록 로딩 뼈대: 합계 줄 자리는 라벨만, 머리글 +
// --surface 행 3개, 표 아래 합계 행 뼈대 없음, 진행 막대 없음.
describe("ProjectsLoading — 목록 로딩 뼈대", () => {
  const html = renderToStaticMarkup(createElement(ProjectsLoading));

  it("표 아래 합계 행(tfoot) 뼈대가 없다", () => {
    expect(html).not.toContain("<tfoot");
  });

  it("표 위 합계 줄 자리에 라벨 「합계」만 있고 금액 자리가 없다", () => {
    const totals = /<section[^>]*>(.*?)<\/section>/.exec(html)?.[1] ?? "";
    expect(totals).toContain("합계");
    expect(totals).not.toMatch(/<dd|<dl/);
    expect(html.indexOf("<section")).toBeLessThan(html.indexOf("<table"));
  });

  it("머리글 + 행 3개이고 진행 막대가 없다", () => {
    expect(html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(3);
    expect(html).toContain("<thead>");
    expect(html).not.toMatch(/progressbar|<progress/);
  });
});
