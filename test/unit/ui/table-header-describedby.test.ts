import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 04.3-04 Task 3 ⓪-b(최종 리뷰 B2) — 열 머리글 `<th>`가 설명(상시 힌트) id를 aria-describedby로 가리킬 수 있다.
// 주지 않은 열의 머리글 마크업은 그대로다. jsdom 없이 정적 렌더로 본다(table-header-sort.test.ts 선례).

type Row = { id: string; name: string; label: string };

const columns: TableColumn<Row>[] = [
  { key: "name", header: "이름", priority: "p1", cell: (row) => row.name },
  { key: "label", header: "구별 표시", priority: "p2", headerDescribedBy: "hint-id", cell: (row) => row.label },
];

function headerCell(markup: string, header: string): string {
  const cells = markup.match(/<th[ >][\s\S]*?<\/th>/g) ?? [];
  return cells.find((cell) => cell.includes(header)) ?? "";
}

describe("Table 머리글 aria-describedby", () => {
  const markup = renderToStaticMarkup(
    createElement(Table<Row>, {
      caption: "당첨자",
      columns,
      rows: [{ id: "r1", name: "김하늘", label: "" }],
      getRowId: (row) => row.id,
    }),
  );

  it("headerDescribedBy를 준 열의 <th>에 aria-describedby가 있다", () => {
    expect(headerCell(markup, "구별 표시")).toContain('aria-describedby="hint-id"');
  });

  it("주지 않은 열의 <th>에는 aria-describedby 속성이 없다", () => {
    expect(headerCell(markup, "이름")).not.toContain("aria-describedby");
  });
});
