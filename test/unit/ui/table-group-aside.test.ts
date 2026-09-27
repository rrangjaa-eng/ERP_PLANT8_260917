import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table, type TableProps } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 04-42 리뷰 S3 · DOM 감사 #18 — 그룹 머리글 행 오른쪽 칸(리저브 대장의 클라이언트 최종 잔액, UI-SPEC S9 「머리글 행 오른쪽 · 700」).
// 선택 prop이라 주지 않은 표(견적 원장 · 프로젝트 목록 · 알림)의 머리글 마크업은 그대로다. jsdom 없이 정적 렌더로 본다.

type Row = { id: string; group: string; balance: string };

const columns: TableColumn<Row>[] = [{ key: "id", header: "번호", priority: "p1", cell: (row) => row.id }];
const rows: Row[] = [
  { id: "r1", group: "A", balance: "950,000" },
  { id: "r2", group: "A", balance: "950,000" },
  { id: "r3", group: "B", balance: "700,000" },
];

function render(extra: Partial<TableProps<Row>> = {}): string {
  return renderToStaticMarkup(
    createElement(Table<Row>, { caption: "대장", columns, rows, getRowId: (row) => row.id, groupBy: (row) => row.group, ...extra }),
  );
}

function groupHeaderCells(markup: string): string[] {
  return markup.match(/<td colSpan="1" class="[^"]*groupHeader[^"]*">[\s\S]*?<\/td>/g) ?? [];
}

describe("Table 그룹 머리글 오른쪽 칸(groupAside)", () => {
  it("그룹마다 첫 줄로 부른 값을 머리글 칸 안의 오른쪽 칸 요소 하나로 그린다", () => {
    const cells = groupHeaderCells(render({ groupAside: (row) => `잔액 ${row.balance}` }));
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<td[^>]*>A<span class="[^"]*groupAside[^"]*">잔액 950,000<\/span><\/td>$/);
    expect(cells[1]).toMatch(/^<td[^>]*>B<span class="[^"]*groupAside[^"]*">잔액 700,000<\/span><\/td>$/);
  });

  it("주지 않으면 머리글 칸은 글자뿐이다(기존 표 무변경)", () => {
    const cells = groupHeaderCells(render());
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<td[^>]*>A<\/td>$/);
    expect(render()).not.toContain("groupAside");
  });
});
