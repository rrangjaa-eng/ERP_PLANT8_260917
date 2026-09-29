import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 04-18(§6-1 · WINDOWS #27) — 정렬 머리글. 목록은 GET 이동이라 머리글 글자가 링크이고, 현재 정렬 열 하나에만
// aria-sort와 16px 방향 아이콘(인라인 SVG)이 붙는다. jsdom 없이 정적 렌더로 본다(pagination.test.ts 선례).

type Row = { id: string; name: string; number: string; status: string };

const columns: TableColumn<Row>[] = [
  { key: "number", header: "번호", priority: "p3", sort: { href: "/projects?sort=number", direction: null }, cell: (row) => row.number },
  {
    key: "name",
    header: "프로젝트명",
    priority: "p1",
    sort: { href: "/projects?sort=name&dir=desc", direction: "asc" },
    cell: (row) => row.name,
  },
  { key: "status", header: "상태", priority: "p1", cell: (row) => row.status },
];

function headerCells(markup: string): Record<string, string> {
  const cells = markup.match(/<th[ >][\s\S]*?<\/th>/g) ?? [];
  return Object.fromEntries(
    cells.map((cell) => [["번호", "프로젝트명", "상태"].find((header) => cell.includes(header)) ?? "?", cell]),
  );
}

function render(sortColumns: TableColumn<Row>[] = columns): string {
  return renderToStaticMarkup(
    createElement(Table<Row>, {
      caption: "프로젝트",
      columns: sortColumns,
      rows: [{ id: "r1", name: "행사", number: "26001", status: "수주중" }],
      getRowId: (row) => row.id,
    }),
  );
}

describe("Table 정렬 머리글", () => {
  it("현재 정렬 열의 th에 aria-sort와 방향 아이콘 SVG 하나, 머리글 글자는 링크다", () => {
    const name = headerCells(render())["프로젝트명"] ?? "";
    expect(name).toContain('aria-sort="ascending"');
    expect(name.match(/<svg/g) ?? []).toHaveLength(1);
    expect(name).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(name).toMatch(/<a [^>]*href="\/projects\?sort=name&amp;dir=desc"[^>]*>[\s\S]*프로젝트명/);
  });

  it("내림차순이면 aria-sort가 descending이다", () => {
    const descending = columns.map((column) =>
      column.key === "name" ? { ...column, sort: { href: "/projects?sort=name", direction: "desc" as const } } : column,
    );
    expect(headerCells(render(descending))["프로젝트명"]).toContain('aria-sort="descending"');
  });

  it("direction이 null인 정렬 가능 열은 링크만 있고 aria-sort · 아이콘이 없다", () => {
    const number = headerCells(render())["번호"] ?? "";
    expect(number).toMatch(/<a [^>]*href="\/projects\?sort=number"/);
    expect(number).not.toContain("aria-sort");
    expect(number).not.toContain("<svg");
  });

  it("sort가 없는 열은 글자만이고, 표 전체에 aria-sort는 하나뿐이다", () => {
    const markup = render();
    const status = headerCells(markup)["상태"] ?? "";
    expect(status).not.toContain("<a ");
    expect(status).not.toContain("<svg");
    expect(markup.match(/aria-sort=/g) ?? []).toHaveLength(1);
  });
});
