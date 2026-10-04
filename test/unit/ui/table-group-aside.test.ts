import { createElement, type ReactNode } from "react";
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

// 묶음 ④ 리뷰 P1 — 이름이 같은 두 클라이언트는 id(groupBy)로 따로 묶이고, 머리글 글자는 groupHeader가 정한다.
describe("Table 그룹 키와 머리글 글자(groupHeader)", () => {
  const sameName: Row[] = [
    { id: "r1", group: "client-1", balance: "100" },
    { id: "r2", group: "client-2", balance: "200" },
  ];

  it("머리글 글자가 같아도 키가 다르면 두 그룹 — 각자 첫 줄 잔액", () => {
    const cells = groupHeaderCells(
      render({ rows: sameName, groupHeader: () => "같은이름", groupAside: (row) => `잔액 ${row.balance}` }),
    );
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<td[^>]*>같은이름<span[^>]*>잔액 100<\/span><\/td>$/);
    expect(cells[1]).toMatch(/^<td[^>]*>같은이름<span[^>]*>잔액 200<\/span><\/td>$/);
  });
});

// 04.6-24 — 그룹 머리글을 노드로 받고, opt-in `groupHeaderScope="rowgroup"`이면 `<th scope="rowgroup">`로 그린다(확인증 제출 표 ·
// 알림함). 두 prop이 없으면 지금 `<td colSpan>` 마크업 그대로다.
describe("Table 그룹 머리글 노드(groupHeader)와 rowgroup 범위(groupHeaderScope)", () => {
  const withNode = (row: Row): ReactNode => createElement("span", null, `${row.group} · 제출 `, createElement("em", null, "초과 1건"));

  function groupHeaderTh(markup: string): string[] {
    return markup.match(/<th scope="rowgroup" colSpan="1" class="[^"]*groupHeader[^"]*">[\s\S]*?<\/th>/g) ?? [];
  }

  it('groupHeaderScope="rowgroup"이면 그룹 머리글 칸이 `<th scope="rowgroup" colSpan>`이다', () => {
    const markup = render({ groupHeaderScope: "rowgroup" });
    const cells = groupHeaderTh(markup);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<th[^>]*>A<\/th>$/);
    expect(groupHeaderCells(markup)).toHaveLength(0);
  });

  it("groupHeader가 노드를 돌려주면 그 노드가 머리글 칸 안에 그대로 들어간다", () => {
    const cells = groupHeaderTh(render({ groupHeader: withNode, groupHeaderScope: "rowgroup" }));
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<th[^>]*><span>A · 제출 <em>초과 1건<\/em><\/span><\/th>$/);
  });

  it("노드를 줘도 scope 없이는 지금처럼 `<td colSpan>`이다", () => {
    const cells = groupHeaderCells(render({ groupHeader: withNode }));
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatch(/^<td[^>]*><span>A · 제출 <em>초과 1건<\/em><\/span><\/td>$/);
    expect(render({ groupHeader: withNode })).not.toContain('scope="rowgroup"');
  });

  it("groupAside는 th 머리글 칸 안에서도 오른쪽 칸 요소 하나로 그려진다", () => {
    const cells = groupHeaderTh(render({ groupHeaderScope: "rowgroup", groupAside: (row) => `잔액 ${row.balance}` }));
    expect(cells[0]).toMatch(/^<th[^>]*>A<span class="[^"]*groupAside[^"]*">잔액 950,000<\/span><\/th>$/);
  });
});
