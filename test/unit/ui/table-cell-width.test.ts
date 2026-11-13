import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaticTable } from "../../../ui/table/StaticTable";
import { Table } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 07.5-01 D-7524: 열 옵션 cellWidth — `number`는 <th>·<td> 클래스, `field`는 머리글 글자·읽기 칸 내용을 감싼 span 하나의 클래스.
// 옵션 없는 열의 DOM은 main 그대로.
type Row = { id: string; a: string; b: string; c: string };
const rows: Row[] = [{ id: "r1", a: "가", b: "나", c: "다" }];

const tableColumns: TableColumn<Row>[] = [
  { key: "a", header: "일반", priority: "p1", cell: (row) => row.a },
  { key: "b", header: "필드", priority: "p2", cellWidth: "field", cell: (row) => row.b },
  { key: "c", header: "숫자", priority: "p2", cellWidth: "number", cell: (row) => row.c },
];

function renderTable(columns: TableColumn<Row>[]): string {
  return renderToStaticMarkup(createElement(Table<Row>, { caption: "표", columns, rows, getRowId: (row) => row.id }));
}

function classOf(markup: string, tag: "th" | "td", text: string): string {
  const match = new RegExp(`<${tag}[^>]*class="([^"]*)"[^>]*>(?:(?!</${tag}>).)*?${text}`, "s").exec(markup);
  return match?.[1] ?? "";
}

describe("Table cellWidth", () => {
  const markup = renderTable(tableColumns);

  it("number 열은 th · td class에 number 규칙이 붙는다", () => {
    expect(classOf(markup, "th", "숫자")).toMatch(/cellWidthNumber/);
    expect(classOf(markup, "td", "다")).toMatch(/cellWidthNumber/);
  });

  it("field 열은 th · td가 아니라 머리글 글자 · 읽기 칸 내용을 감싼 span에 field 규칙이 붙는다", () => {
    expect(classOf(markup, "th", "필드")).not.toMatch(/cellWidthField/);
    expect(classOf(markup, "td", "나")).not.toMatch(/cellWidthField/);
    expect(markup).toMatch(/<th[^>]*><span class="[^"]*cellWidthField[^"]*">필드<\/span><\/th>/);
    expect(markup).toMatch(/<span class="[^"]*cellWidthField[^"]*">나<\/span>/);
  });

  it("옵션 없는 열의 th · td class에는 폭 규칙이 없고 DOM은 감싸개가 없다", () => {
    expect(classOf(markup, "th", "일반")).not.toMatch(/cellWidth/);
    expect(classOf(markup, "td", "가")).not.toMatch(/cellWidth/);
    expect(markup).toMatch(/>가<\/td>/);
    expect(markup).toMatch(/>일반<\/th>/);
  });

  it("옵션 없는 표의 마크업은 cellWidth 글자가 전혀 없다", () => {
    const plain = renderTable(tableColumns.map((column) => ({ ...column, cellWidth: undefined })));
    expect(plain).not.toMatch(/cellWidth/);
  });
});

describe("StaticTable cellWidth", () => {
  const markup = renderToStaticMarkup(
    createElement(StaticTable, {
      caption: "표",
      columns: [
        { key: "a", header: "일반", priority: "p1" },
        { key: "b", header: "필드", priority: "p2", cellWidth: "field" },
        { key: "c", header: "숫자", priority: "p2", cellWidth: "number" },
      ],
      rows: [{ key: "r1", cells: ["가", "나", "다"] }],
    }),
  );

  it("number 열은 th · td class", () => {
    expect(classOf(markup, "th", "숫자")).toMatch(/cellWidthNumber/);
    expect(classOf(markup, "td", "다")).toMatch(/cellWidthNumber/);
  });

  it("field 열은 span 감싸개", () => {
    expect(markup).toMatch(/<th[^>]*><span class="[^"]*cellWidthField[^"]*">필드<\/span><\/th>/);
    expect(markup).toMatch(/<td[^>]*><span class="[^"]*cellWidthField[^"]*">나<\/span><\/td>/);
  });

  it("옵션 없는 열은 감싸개 · 폭 클래스 없음", () => {
    expect(classOf(markup, "th", "일반")).not.toMatch(/cellWidth/);
    expect(markup).toMatch(/<td[^>]*>가<\/td>/);
  });
});
