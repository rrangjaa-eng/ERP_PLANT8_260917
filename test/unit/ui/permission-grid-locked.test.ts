import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PermissionGrid,
  bulkTargetRows,
  buildCellKey,
  type PermissionGridColumn,
  type PermissionGridRow,
} from "../../../ui/permission-grid/PermissionGrid";

// PR #171 리뷰 P3-3 · 디자인 검토 F-1 — 잠긴(보관된) 행 · 열의 칸은 체크된 것만 해제할 수 있다. 빈 칸은 비활성이고
// 행 머리 「전체」는 잠기지 않은 칸만 센다.

const rows: PermissionGridRow[] = [
  { id: "tax", label: "세금계산서 (보관됨)", locked: true },
  { id: "inv", label: "계산서" },
];
const columns: PermissionGridColumn[] = [
  { id: "cash", label: "현금" },
  { id: "bank", label: "계좌이체" },
];

function render(values: Record<string, boolean>, cols: PermissionGridColumn[] = columns): string {
  return renderToStaticMarkup(
    createElement(PermissionGrid, {
      caption: "짝",
      rowSelectLabel: "증빙 종류",
      itemHeaderLabel: "지급 방식",
      rows,
      columns: cols,
      values,
      cellAriaLabel: (row, column) => `${column.label} · ${row.label}`,
      columnAriaLabel: (column) => `${column.label} 전체`,
      onToggle: async () => {},
    }),
  );
}

function boxes(html: string, label: string): string[] {
  return (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((box) => box.includes(`aria-label="${label}"`));
}

describe("PermissionGrid — 잠긴 행 · 열(F-1)", () => {
  it("잠긴 행의 빈 칸은 disabled이고 체크된 칸은 해제할 수 있다(PC 격자)", () => {
    const html = render({ [buildCellKey("tax", "bank")]: true });
    const [empty] = boxes(html, "현금 · 세금계산서 (보관됨)");
    const [checked] = boxes(html, "계좌이체 · 세금계산서 (보관됨)");
    expect(empty).toContain("disabled");
    expect(checked).not.toContain("disabled");
    expect(checked).toContain("checked");
  });

  it("잠기지 않은 행의 빈 칸은 활성이다", () => {
    const [active] = boxes(render({}), "현금 · 계산서");
    expect(active).not.toContain("disabled");
  });

  it("폰 목록(선택 행 = 첫 행)에서도 빈 잠긴 칸은 disabled다", () => {
    const html = render({ [buildCellKey("tax", "bank")]: true });
    const all = boxes(html, "현금 · 세금계산서 (보관됨)");
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const box of all) expect(box).toContain("disabled");
  });

  it("잠긴 열의 빈 칸은 disabled이고 그 열 머리 「전체」도 disabled다", () => {
    const html = render({}, [{ id: "cash", label: "현금", locked: true }, columns[1]!]);
    for (const box of boxes(html, "현금 · 계산서")) expect(box).toContain("disabled");
    expect(boxes(html, "현금 전체")[0]).toContain("disabled");
    expect(boxes(html, "계좌이체 전체")[0]).not.toContain("disabled");
  });

  it("행 머리 「전체」 대상은 잠긴 행을 뺀 행이고, 잠긴 열이면 없다", () => {
    expect(bulkTargetRows(rows, columns[0]!).map((row) => row.id)).toEqual(["inv"]);
    expect(bulkTargetRows(rows, { id: "x", label: "x", locked: true })).toEqual([]);
  });

  it("「전체」 상태는 잠기지 않은 칸만 센다 — 활성 칸이 모두 체크면 잠긴 빈 칸이 있어도 checked", () => {
    const html = render({ [buildCellKey("inv", "bank")]: true });
    expect(boxes(html, "계좌이체 전체")[0]).toContain("checked");
  });
});
