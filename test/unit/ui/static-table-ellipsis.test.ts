import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaticTable } from "../../../ui/table/StaticTable";

// 카드 11/12 — StaticTable 열 옵션 `ellipsis`: 폰에서 긴 글자가 여러 줄로 접히지 않고 한 줄 말줄임(`[data-cell-text]`, Table 읽기 렌더와 같은 규칙).
// 옵션을 켜지 않은 열 · 표는 마크업이 그대로다.
const LONG = "가나다라마바사아자차카타파하".repeat(3).slice(0, 40);
const columns = (ellipsis: boolean) => [
  { key: "name", header: "이름", priority: "p1" as const, ellipsis },
  { key: "by", header: "보관한 사람", priority: "p1" as const },
];
const html = (ellipsis: boolean) =>
  renderToStaticMarkup(createElement(StaticTable, { caption: "보관함", columns: columns(ellipsis), rows: [{ key: "r1", cells: [LONG, "김"] }] }));

describe("StaticTable ellipsis 열 옵션", () => {
  it("켠 열의 글자는 [data-cell-text] 감싸개 + 전체 글자 title이고 표에 data-cell-ellipsis가 선다", () => {
    const out = html(true);
    expect(out).toContain(`<div data-cell-text="" title="${LONG}">${LONG}</div>`);
    expect(out).toMatch(/<table[^>]*data-cell-ellipsis/);
  });

  it("켜지 않으면 감싸개 · title · 표 속성이 없다(기존 마크업 그대로)", () => {
    const out = html(false);
    expect(out).not.toContain("data-cell-text");
    expect(out).not.toContain("data-cell-ellipsis");
    expect(out).not.toContain("title=");
  });

  it("글자가 아닌 칸(노드)은 감싸되 title은 없다", () => {
    const out = renderToStaticMarkup(
      createElement(StaticTable, { caption: "표", columns: columns(true), rows: [{ key: "r1", cells: [createElement("b", null, "굵게"), "김"] }] }),
    );
    expect(out).toContain('<div data-cell-text=""><b>굵게</b></div>');
  });
});
