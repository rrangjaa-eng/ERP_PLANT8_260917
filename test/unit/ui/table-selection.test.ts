import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table, reconcileSelection, type TableSelection } from "../../../ui/table/Table";
import type { TableColumn } from "../../../ui/table/types";

// 06-29 Task 1 — SP-1 선택 표(SYSTEM §7-3 (카)). `selection`을 넘긴 표의 선택 열 마크업 · 이유 id 연결 ·
// `aria-selected` 미사용(DR-7) · `reconcileSelection`(H-3).

type Row = { id: string; name: string; reason?: string; blocked?: string };

const columns: TableColumn<Row>[] = [{ key: "name", header: "이름", priority: "p1", cell: (row) => row.name }];

const rows: Row[] = [
  { id: "a", name: "가 줄" },
  { id: "b", name: "나 줄", reason: "증빙 확인 전" },
  { id: "c", name: "다 줄", blocked: "계좌 오류" },
];

function selectionOf(overrides: Partial<TableSelection<Row>> = {}): TableSelection<Row> {
  return {
    selectedIds: ["a", "c"],
    selectable: (row) => (row.reason ? { reason: row.reason } : true),
    onChange: () => {},
    rowLabel: (row) => row.name,
    blockedReason: (row) => row.blocked ?? null,
    ...overrides,
  };
}

function render(selection?: TableSelection<Row>, enableGridKeyboard = false): string {
  return renderToStaticMarkup(
    createElement(Table<Row>, { caption: "지급 대상", columns, rows, getRowId: (row) => row.id, selection, enableGridKeyboard }),
  );
}

function checkboxes(html: string): string[] {
  return html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
}

describe("Table selection — 선택 열 마크업", () => {
  it("선택 열은 행마다 체크박스 하나와 접근 이름 `{rowLabel} 고르기`, 머리글은 `이 쪽 전체 고르기`다", () => {
    const html = render(selectionOf());
    const boxes = checkboxes(html);
    expect(boxes).toHaveLength(rows.length + 1);
    expect(html).toContain('aria-label="이 쪽 전체 고르기"');
    for (const row of rows) expect(html).toContain(`aria-label="${row.name} 고르기"`);
    // 맨 왼쪽 — 머리글 첫 칸이 체크박스 칸이다.
    expect(html.indexOf("이 쪽 전체 고르기")).toBeLessThan(html.indexOf("이름"));
  });

  it("고를 수 있는 행은 checked, 고를 수 없는 행은 aria-disabled · checked 아님 · 이유 글자 id를 aria-describedby로 가리킨다", () => {
    const html = render(selectionOf({ selectedIds: ["a", "b"] }));
    const a = checkboxes(html).find((box) => box.includes('aria-label="가 줄 고르기"'))!;
    const b = checkboxes(html).find((box) => box.includes('aria-label="나 줄 고르기"'))!;
    expect(a).toContain("checked");
    expect(a).not.toContain("aria-disabled");
    // 고를 수 없게 된 행은 selectedIds에 남아 있어도 체크로 그리지 않는다(비활성인데 체크된 행 없음).
    expect(b).toContain('aria-disabled="true"');
    expect(b).not.toContain("checked");
    const describedBy = /aria-describedby="([^"]+)"/.exec(b)?.[1];
    expect(describedBy).toBeTruthy();
    const reasonId = describedBy!.split(" ")[0]!;
    expect(html).toMatch(new RegExp(`id="${reasonId}"[^>]*>증빙 확인 전<`));
    // 고른 행 면 클래스는 고를 수 있는 선택에만.
    expect(html.match(/selectedRow/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("blockedReason이 문자열인 행은 막힘 이유 글자(위험 색 클래스)가 서고 그 id가 체크박스 aria-describedby에 더해지며 행 배경 클래스는 없다", () => {
    const html = render(selectionOf({ selectedIds: [] }));
    const c = checkboxes(html).find((box) => box.includes('aria-label="다 줄 고르기"'))!;
    const ids = /aria-describedby="([^"]+)"/.exec(c)?.[1]?.split(" ") ?? [];
    expect(ids).toHaveLength(1);
    expect(html).toMatch(new RegExp(`id="${ids[0]}"[^>]*class="[^"]*selectBlocked[^"]*"[^>]*>계좌 오류<|class="[^"]*selectBlocked[^"]*"[^>]*id="${ids[0]}"[^>]*>계좌 오류<`));
    // 막힌 행도 고른 게 아니면 행 면 클래스 0 — 막힘은 글자로만.
    expect(html).not.toContain("selectedRow");
  });

  it("선택 때문에 어떤 tr · td에도 aria-selected=true가 붙지 않는다(DR-7)", () => {
    const html = render(selectionOf({ selectedIds: ["a", "c"] }));
    expect(html).not.toContain('aria-selected="true"');
  });

  it("selection이 없는 표에는 선택 열 · 체크박스가 없다", () => {
    const html = render(undefined);
    expect(checkboxes(html)).toHaveLength(0);
    expect(html).not.toContain("고르기");
  });
});

describe("reconcileSelection — 처리 뒤 선택 다시 세우기(H-3)", () => {
  const getRowId = (row: Row) => row.id;
  const open = (row: Row) => (row.reason ? { reason: row.reason } : (true as const));

  it("없어진 행 id는 빠지고 순서는 유지된다", () => {
    expect(reconcileSelection(["c", "z", "a"], rows, getRowId, open)).toEqual(["c", "a"]);
  });

  it("selectable이 reason이 된 행은 빠지고 여전히 true인 행은 남는다", () => {
    expect(reconcileSelection(["a", "b", "c"], rows, getRowId, open)).toEqual(["a", "c"]);
    // 동시성으로만 막혔던 행(여전히 고를 수 있음)은 남는다.
    expect(reconcileSelection(["a", "c"], rows, getRowId, () => true)).toEqual(["a", "c"]);
  });
});

// 06-29 DOM 감사 D1 · D2 — SYSTEM §7-3 (아) 「표 전체가 탭 정지 1개」 · 행 높이 --row-h.
describe("Table selection — 탭 정지 · 행 높이(감사 D1 · D2)", () => {
  it("행 체크박스는 격자 키보드가 있으면 탭 정지가 아니다(tabindex=-1) — 키보드 고르기는 활성 셀 Space가 맡는다", () => {
    const boxes = checkboxes(render(selectionOf(), true));
    for (const row of rows) {
      const box = boxes.find((candidate) => candidate.includes(`aria-label="${row.name} 고르기"`))!;
      expect(box).toContain('tabindex="-1"');
    }
  });

  it("격자 키보드가 없으면 Space 경로가 없으니 행 체크박스가 탭으로 닿는다(tabindex 없음, 검토 P3-1)", () => {
    const boxes = checkboxes(render(selectionOf(), false));
    for (const row of rows) {
      const box = boxes.find((candidate) => candidate.includes(`aria-label="${row.name} 고르기"`))!;
      expect(box).not.toContain("tabindex");
    }
  });

  it("머리글 전체 고르기 체크박스는 키보드로 닿는 유일한 길이라 탭 정지로 남는다", () => {
    const head = checkboxes(render(selectionOf())).find((box) => box.includes('aria-label="이 쪽 전체 고르기"'))!;
    expect(head).not.toContain("tabindex");
  });

  it(".selectLabel 최소 높이는 위아래 padding과 아래 테두리를 뺀 값이라 선택 표 행이 --row-h다", () => {
    const css = readFileSync(resolve(process.cwd(), "ui/table/Table.module.css"), "utf8");
    const block = /\.selectLabel\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("min-height: calc(var(--row-h) - 2 * var(--cell-pad-y) - var(--line-w))");
  });
});
