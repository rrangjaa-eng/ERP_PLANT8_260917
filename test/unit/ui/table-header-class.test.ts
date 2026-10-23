import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 07-19 게이트 P3 — 머리글 `<th>` class에 끝 공백 · 겹 공백이 남지 않는다(headerClassName 없는 열, 정렬 없는 열).
type Row = { id: string; name: string; amount: string };

const columns: TableColumn<Row>[] = [
  { key: "name", header: "이름", priority: "p1", cell: (row) => row.name },
  { key: "amount", header: "금액", priority: "p2", headerClassName: "extra", cell: (row) => row.amount },
];

describe("Table 머리글 class", () => {
  const markup = renderToStaticMarkup(
    createElement(Table<Row>, { caption: "표", columns, rows: [{ id: "r1", name: "김하늘", amount: "1" }], getRowId: (row) => row.id }),
  );
  const classes = [...markup.matchAll(/<th[^>]*class="([^"]*)"/g)].map((match) => match[1] ?? "");

  it("머리글 class는 공백으로 끝나거나 시작하지 않고 겹 공백도 없다", () => {
    expect(classes.length).toBeGreaterThanOrEqual(2);
    for (const className of classes) {
      expect(className).toBe(className.trim());
      expect(className).not.toContain("  ");
    }
  });

  it("headerClassName을 준 열은 그 class를 가진다", () => {
    expect(classes.some((className) => className.split(" ").includes("extra"))).toBe(true);
  });
});
