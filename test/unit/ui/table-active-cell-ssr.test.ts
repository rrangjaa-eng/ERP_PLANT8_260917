import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 04.6-05 합본 — activeCell이 null이고 getRowId가 undefined를 돌려주는 행(id 없는 행)이면
// `activeCell?.rowId === getRowId(row)`가 참이 되어 `activeCell.columnKey`에서 SSR이 던졌다.

type Row = { id?: string; name: string };

const columns: TableColumn<Row>[] = [{ key: "name", header: "이름", priority: "p1", cell: (row) => row.name }];

describe("Table SSR — 활성 칸 없음", () => {
  it("getRowId가 undefined를 돌려주는 행도 던지지 않고 그린다", () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(Table<Row>, {
          caption: "표",
          columns,
          rows: [{ name: "행1" }],
          getRowId: (row) => row.id as string,
        }),
      );
    expect(render).not.toThrow();
    expect(render()).toContain("행1");
  });
});
