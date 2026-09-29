import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectsFilterBar } from "@/app/(app)/projects/filter-bar";

// 04-48 Opus 검토 SF-2 — iOS numeric 키패드에는 `-`가 없어 `2026-09-18`을 칠 수 없다. 목록 기간 두 칸은 기본 텍스트 키보드다.
describe("ProjectsFilterBar — 기간 두 칸 키보드", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectsFilterBar, {
      teams: [],
      statusOptions: [],
      yearOptions: [2026],
      defaultValues: { year: "2026" },
      hasFilter: false,
    }),
  );

  it("기간 시작 · 끝 칸에 inputmode가 없다", () => {
    const from = /<input[^>]*id="from"[^>]*>/.exec(html)?.[0];
    const to = /<input[^>]*id="to"[^>]*>/.exec(html)?.[0];
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(from).not.toMatch(/inputmode/i);
    expect(to).not.toMatch(/inputmode/i);
  });
});
