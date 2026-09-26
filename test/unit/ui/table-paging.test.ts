import { createElement, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clampPage } from "@/lib/paging";
import { crossPageTarget, nextEditableCell, pageEntryFocus, pageOfRow, pinNewRows, resolveFocus, splitPageRangeText, splitPages } from "@/ui/table/paging";
import { useGridKeyboard, type UseGridKeyboardResult } from "@/ui/table/use-grid-keyboard";

// 04-19(D-91 · SYSTEM.md §7-3 (자)) — 편집 표의 30줄 쪽 나눔은 화면 안 배열 자르기다. 표시 순서 id를 쪽 크기로
// 자르고(새 줄 고정 입력 포함), 줄 id로 쪽을 찾고, 쪽 전환 뒤 활성 셀을 정한다. 쪽 번호 보정은 lib/paging(04-29).
const ids = (count: number, prefix = "id") => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

describe("splitPages — 표시 순서 그대로 쪽 크기로 자른다", () => {
  it("45줄은 30 · 15 두 쪽이고 순서가 그대로다", () => {
    const pages = splitPages(ids(45), { pageSize: 30 });
    expect(pages.map((page) => page.length)).toEqual([30, 15]);
    expect(pages[0]?.[0]).toBe("id-1");
    expect(pages[0]?.[29]).toBe("id-30");
    expect(pages[1]?.[0]).toBe("id-31");
    expect(pages[1]?.[14]).toBe("id-45");
  });

  it("30줄은 한 쪽이다(쪽 줄이 없다)", () => {
    expect(splitPages(ids(30), { pageSize: 30 })).toEqual([ids(30)]);
  });

  it("0줄은 빈 쪽 하나다", () => {
    expect(splitPages([], { pageSize: 30 })).toEqual([[]]);
  });

  it("1쪽에 고정된 새 줄(표시 31번째)은 1쪽에 남아 1쪽 31줄 · 2쪽 14줄이고, 고정을 비우면 30 · 15로 다시 나뉜다", () => {
    const display = [...ids(30), "new-1", ...ids(14, "tail")];
    const pinned = splitPages(display, { pageSize: 30, pinned: { "new-1": 1 } });
    expect(pinned.map((page) => page.length)).toEqual([31, 14]);
    expect(pinned[0]?.[30]).toBe("new-1");
    expect(pinned[1]?.[0]).toBe("tail-1");

    const resplit = splitPages(display, { pageSize: 30 });
    expect(resplit.map((page) => page.length)).toEqual([30, 15]);
    expect(resplit[1]?.[0]).toBe("new-1");
  });
});

// 04-47(§7-3 (자) · C-18) — 직전 분할에 없던 줄(새 줄)은 만들어질 때의 쪽에 고정된다. 재분할은 저장 성공·다시 불러오기·
// 사용자의 페이지 이동뿐이다(고정을 비우는 쪽은 Table).
describe("pinNewRows — 직전 분할에 없던 id를 만들어질 때의 쪽에 고정한다", () => {
  it("2쪽에서 만든 새 줄이 표시 순서상 1쪽 자리에 들어와도 2쪽에 남는다", () => {
    const before = ids(45);
    const display = [...ids(4), "new-1", ...before.slice(4)];
    const pinned = pinNewRows({ ids: display, known: new Set(before), pinned: {}, page: 2 });
    expect(pinned).toEqual({ "new-1": 2 });
    const pages = splitPages(display, { pageSize: 30, pinned });
    expect(pageOfRow(pages, "new-1")).toBe(2);
    expect(pages.map((page) => page.length)).toEqual([30, 16]);
  });

  it("1쪽에서 35줄을 새로 만들면(붙여넣기) 1쪽이 45줄이고 쪽 줄이 없다 — 고정을 비우면 30 · 15", () => {
    const before = ids(10);
    const display = [...before, ...ids(35, "new")];
    const pinned = pinNewRows({ ids: display, known: new Set(before), pinned: {}, page: 1 });
    expect(Object.keys(pinned)).toHaveLength(35);
    expect(splitPages(display, { pageSize: 30, pinned }).map((page) => page.length)).toEqual([45]);
    expect(splitPages(display, { pageSize: 30 }).map((page) => page.length)).toEqual([30, 15]);
  });

  it("이미 고정된 줄은 그 쪽 그대로이고 알던 줄은 고정하지 않는다", () => {
    const display = [...ids(30), "new-1", "new-2"];
    const pinned = pinNewRows({ ids: display, known: new Set([...ids(30), "new-1"]), pinned: { "new-1": 1 }, page: 2 });
    expect(pinned).toEqual({ "new-1": 1, "new-2": 2 });
  });

  it("새 줄이 없으면 같은 고정 객체를 돌려준다(렌더 중 상태 조정이 멈춘다)", () => {
    const current = { "new-1": 1 };
    expect(pinNewRows({ ids: [...ids(3), "new-1"], known: new Set([...ids(3), "new-1"]), pinned: current, page: 1 })).toBe(current);
  });
});

describe("pageOfRow — 줄 id의 쪽(1부터)", () => {
  const pages = splitPages(ids(45), { pageSize: 30 });

  it("id-31은 2쪽, id-30은 1쪽이다", () => {
    expect(pageOfRow(pages, "id-31")).toBe(2);
    expect(pageOfRow(pages, "id-30")).toBe(1);
  });

  it("없는 id는 null이다", () => {
    expect(pageOfRow(pages, "missing")).toBeNull();
  });
});

// 04-47(§7-3 (자)) — 새 줄 고정으로 한 쪽이 쪽 크기를 넘는 동안에도 범위 글자는 실제 분할로 센다.
describe("splitPageRangeText — 실제 분할의 범위 글자", () => {
  const pages = splitPages(ids(46), { pageSize: 30, pinned: { "id-46": 1 } });

  it("1쪽에 고정된 새 줄이 있으면 1쪽은 `1–31 / 46줄`, 2쪽은 `32–46 / 46줄`", () => {
    expect(splitPageRangeText({ pages, page: 1, unit: "줄" })).toBe("1–31 / 46줄");
    expect(splitPageRangeText({ pages, page: 2, unit: "줄" })).toBe("32–46 / 46줄");
  });

  it("고정이 없으면 pageRangeText와 같다(천 단위 쉼표)", () => {
    const plain = splitPages(ids(1250), { pageSize: 30 });
    expect(splitPageRangeText({ pages: plain, page: 42, unit: "줄" })).toBe("1,231–1,250 / 1,250줄");
  });
});

describe("쪽 보정 — 쪽이 사라지면 렌더마다 clampPage가 마지막 쪽으로(엔지 리뷰 C 공백 5)", () => {
  it("31줄 2쪽에서 31번째 줄을 지우면 쪽 수 1 → 요청 쪽 2가 1쪽으로 보정된다", () => {
    const before = splitPages(ids(31), { pageSize: 30 });
    expect(before).toHaveLength(2);
    const after = splitPages(ids(30), { pageSize: 30 });
    expect(after).toHaveLength(1);
    expect(clampPage(2, after.length)).toBe(1);
  });
});

describe("pageEntryFocus — 쪽 전환 뒤 활성 셀(DR-23)", () => {
  const editableColKeys = ["subcategory", "execution"];

  it("직전 활성 열이 편집 열이면 새 쪽 첫 줄의 그 열", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31", "id-32"], lastColKey: "execution", editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "execution",
    });
  });

  it("직전 활성 열이 없거나 편집 열이 아니면 첫 편집 열", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: undefined, editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "subcategory",
    });
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: "profit", editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "subcategory",
    });
  });

  it("편집 열이 없으면(읽기 표) null — 호출부가 제목으로 보낸다", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: "execution", editableColKeys: [] })).toBeNull();
  });
});

// ── 04-19 Task 2 — 쪽 경계 키보드(줄 id 기준) · 편집 셀 순회 · 포커스를 id로 기억 ──────────────────────────────

describe("crossPageTarget — 쪽 경계를 넘는 ↑↓의 대상은 줄 id로 정한다(C-18)", () => {
  const display = ids(45);
  const pages = splitPages(display, { pageSize: 30 });

  it("1쪽 끝 id-30에서 ↓ → id-31 · 2쪽", () => {
    expect(crossPageTarget({ ids: display, fromId: "id-30", direction: "down", pages })).toEqual({ rowId: "id-31", page: 2 });
  });

  it("2쪽 첫 id-31에서 ↑ → id-30 · 1쪽", () => {
    expect(crossPageTarget({ ids: display, fromId: "id-31", direction: "up", pages })).toEqual({ rowId: "id-30", page: 1 });
  });

  it("표 끝(마지막 줄 ↓ · 첫 줄 ↑)에서는 null — 멈춘다", () => {
    expect(crossPageTarget({ ids: display, fromId: "id-45", direction: "down", pages })).toBeNull();
    expect(crossPageTarget({ ids: display, fromId: "id-1", direction: "up", pages })).toBeNull();
  });

  it("1쪽에 고정된 새 줄(표시 31번째)에서 ↓ → 표시 순서의 다음 id-31 · 2쪽(제자리에 머물지 않는다)", () => {
    const withNew = [...ids(30), "new-1", ...ids(15).slice(0).map((_, index) => `id-${index + 31}`)];
    const pinnedPages = splitPages(withNew, { pageSize: 30, pinned: { "new-1": 1 } });
    expect(pinnedPages[0]).toContain("new-1");
    expect(crossPageTarget({ ids: withNew, fromId: "new-1", direction: "down", pages: pinnedPages })).toEqual({ rowId: "id-31", page: 2 });
  });
});

describe("nextEditableCell — 편집 중 Tab/Shift+Tab의 대상(편집 셀만)", () => {
  const rowIds = ["id-1", "id-2"];
  const colKeys = ["sort", "subcategory", "itemName", "profit", "execution"];
  const editable = new Set(["subcategory", "itemName", "execution"]);
  const isEditable = (_rowId: string, colKey: string) => editable.has(colKey);

  it("forward — 같은 줄 오른쪽 첫 편집 셀(읽기 열은 건너뛴다)", () => {
    expect(nextEditableCell({ rowIds, colKeys, isEditable, from: { rowId: "id-1", colKey: "itemName" }, direction: "forward" })).toEqual({
      rowId: "id-1",
      colKey: "execution",
    });
  });

  it("forward — 줄 끝이면 다음 줄 첫 편집 셀, 쪽 끝이면 { crossPage: next }", () => {
    expect(nextEditableCell({ rowIds, colKeys, isEditable, from: { rowId: "id-1", colKey: "execution" }, direction: "forward" })).toEqual({
      rowId: "id-2",
      colKey: "subcategory",
    });
    expect(nextEditableCell({ rowIds, colKeys, isEditable, from: { rowId: "id-2", colKey: "execution" }, direction: "forward" })).toEqual({
      crossPage: "next",
    });
  });

  it("backward — 반대 방향, 쪽 첫 편집 셀이면 { crossPage: prev }", () => {
    expect(nextEditableCell({ rowIds, colKeys, isEditable, from: { rowId: "id-2", colKey: "subcategory" }, direction: "backward" })).toEqual({
      rowId: "id-1",
      colKey: "execution",
    });
    expect(nextEditableCell({ rowIds, colKeys, isEditable, from: { rowId: "id-1", colKey: "subcategory" }, direction: "backward" })).toEqual({
      crossPage: "prev",
    });
  });
});

describe("resolveFocus — 기억한 { rowId, colKey }를 렌더마다 지금 쪽의 인덱스로(엔지 리뷰 C §1 P2)", () => {
  const colKeys = ["sort", "itemName", "unitPrice"];

  it("1쪽 그룹 끝에 새 줄이 들어가 표시 순서가 한 칸 밀려도 포커스는 id-35에 남는다", () => {
    const before = splitPages(ids(45), { pageSize: 30 })[1]!;
    const after = splitPages([...ids(20), "new-1", ...ids(25).map((_, index) => `id-${index + 21}`)], { pageSize: 30 })[1]!;
    const focus = { rowId: "id-35", colKey: "unitPrice" };
    const was = resolveFocus({ pageIds: before, colKeys, focus, fallback: { row: 0, col: 0 } });
    const now = resolveFocus({ pageIds: after, colKeys, focus, fallback: was });
    expect(before[was.row]).toBe("id-35");
    expect(after[now.row]).toBe("id-35");
    expect(now.col).toBe(2);
  });

  it("2쪽 5번째 줄(표시 35번째)을 기억하면 그 인덱스의 줄이 id-35다 — 1쪽 5번째 줄이 아니다", () => {
    const page2 = splitPages(ids(45), { pageSize: 30 })[1]!;
    const resolved = resolveFocus({ pageIds: page2, colKeys, focus: { rowId: "id-35", colKey: "itemName" }, fallback: { row: 0, col: 0 } });
    expect(resolved).toEqual({ row: 4, col: 1 });
    expect(page2[resolved.row]).toBe("id-35");
  });

  it("기억한 줄이 지워지면 같은 자리(다음 줄), 마지막 줄이었으면 이전 줄로 떨어진다", () => {
    const pageIds = ["id-1", "id-2", "id-3"];
    expect(resolveFocus({ pageIds, colKeys, focus: { rowId: "gone", colKey: "itemName" }, fallback: { row: 1, col: 1 } })).toEqual({ row: 1, col: 1 });
    expect(resolveFocus({ pageIds, colKeys, focus: { rowId: "gone", colKey: "itemName" }, fallback: { row: 3, col: 1 } })).toEqual({ row: 2, col: 1 });
  });
});

// 훅 — jsdom 없이 react-dom/server로 한 번 렌더해 handleKeyDown을 꺼낸다(grid-keyboard-composing.test.ts 선례).
type KeyInit = { key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; isComposing?: boolean; repeat?: boolean };
type Calls = { edge: [string, string][]; deleted: unknown[]; moved: unknown[][]; tab: string[]; selectAll: number };

function renderGrid(opts: { editing: boolean; rowCount?: number }) {
  const rowCount = opts.rowCount ?? 3;
  const calls: Calls = { edge: [], deleted: [], moved: [], tab: [], selectAll: 0 };
  let result: UseGridKeyboardResult | undefined;
  const params = {
    rowIds: Array.from({ length: rowCount }, (_, index) => `id-${index + 1}`),
    colKeys: ["sort", "itemName", "unitPrice"],
    isEditableCell: () => true,
    isEditing: () => opts.editing,
    onEdgeExit: (direction: string, colKey: string) => {
      calls.edge.push([direction, colKey]);
      return true;
    },
    onSelectAll: () => {
      calls.selectAll += 1;
    },
    onTab: (_pos: unknown, direction: string) => {
      calls.tab.push(direction);
    },
    handlers: {
      onDeleteRow: (row: number | string) => {
        calls.deleted.push(row);
      },
      onMoveRow: (row: number | string, direction: "up" | "down") => {
        calls.moved.push([row, direction]);
      },
    },
  };
  function Probe() {
    result = useGridKeyboard(params);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("훅이 렌더되지 않았습니다");
  const keyboard = result;
  function press(init: KeyInit, pos: { row: number; col: number }) {
    let prevented = false;
    const event = {
      key: init.key,
      ctrlKey: init.ctrlKey ?? false,
      shiftKey: init.shiftKey ?? false,
      altKey: init.altKey ?? false,
      metaKey: false,
      repeat: init.repeat ?? false,
      nativeEvent: { isComposing: init.isComposing ?? false },
      preventDefault: () => {
        prevented = true;
      },
    };
    keyboard.handleKeyDown(event as unknown as ReactKeyboardEvent<HTMLElement>, pos);
    return prevented;
  }
  return { calls, press };
}

describe("useGridKeyboard — 쪽 경계 · Tab · Ctrl+A · Ctrl+C · 줄 id 핸들러(§7-3 (자))", () => {
  it("쪽 마지막 줄에서 ↓ · 첫 줄에서 ↑는 onEdgeExit(방향, 열 키)를 부른다", () => {
    const grid = renderGrid({ editing: false });
    grid.press({ key: "ArrowDown" }, { row: 2, col: 2 });
    grid.press({ key: "ArrowUp" }, { row: 0, col: 1 });
    expect(grid.calls.edge).toEqual([
      ["down", "unitPrice"],
      ["up", "itemName"],
    ]);
  });

  it("편집 중 Enter(편집기가 확정)는 아래로 — 쪽 마지막 줄이면 onEdgeExit(down, 열 키), 한글 조합 확정 Enter는 움직이지 않는다(리뷰 B-1)", () => {
    const grid = renderGrid({ editing: true });
    grid.press({ key: "Enter", isComposing: true }, { row: 2, col: 1 });
    expect(grid.calls.edge).toEqual([]);
    grid.press({ key: "Enter" }, { row: 2, col: 1 });
    expect(grid.calls.edge).toEqual([["down", "itemName"]]);
  });

  it("Shift+↓ 범위 선택은 쪽 마지막 줄에서 멈춘다(onEdgeExit 없음)", () => {
    const grid = renderGrid({ editing: false });
    grid.press({ key: "ArrowDown", shiftKey: true }, { row: 2, col: 1 });
    expect(grid.calls.edge).toEqual([]);
  });

  it("편집 중이 아닐 때 Ctrl+A는 전체 선택 + 기본 동작 막음, 편집 중이면 입력의 기본 동작", () => {
    const idle = renderGrid({ editing: false });
    expect(idle.press({ key: "a", ctrlKey: true }, { row: 0, col: 1 })).toBe(true);
    expect(idle.calls.selectAll).toBe(1);
    const editing = renderGrid({ editing: true });
    expect(editing.press({ key: "a", ctrlKey: true }, { row: 0, col: 1 })).toBe(false);
    expect(editing.calls.selectAll).toBe(0);
  });

  it("편집 중이 아닐 때 자동 반복 Ctrl+A는 전체 선택하지 않지만 페이지 전체 선택(기본 동작)은 막는다(리뷰 N-1)", () => {
    const idle = renderGrid({ editing: false });
    expect(idle.press({ key: "a", ctrlKey: true, repeat: true }, { row: 0, col: 1 })).toBe(true);
    expect(idle.calls.selectAll).toBe(0);
  });

  it("Ctrl+C는 가로채지 않는다(브라우저가 copy 이벤트를 쏜다)", () => {
    const grid = renderGrid({ editing: false });
    expect(grid.press({ key: "c", ctrlKey: true }, { row: 0, col: 1 })).toBe(false);
  });

  it("편집 중 Tab/Shift+Tab은 막고 onTab(forward/backward), 편집 중이 아니면 Tab은 표를 떠난다(막지 않음)", () => {
    const editing = renderGrid({ editing: true });
    expect(editing.press({ key: "Tab" }, { row: 0, col: 1 })).toBe(true);
    expect(editing.press({ key: "Tab", shiftKey: true }, { row: 0, col: 1 })).toBe(true);
    expect(editing.calls.tab).toEqual(["forward", "backward"]);
    const idle = renderGrid({ editing: false });
    expect(idle.press({ key: "Tab" }, { row: 0, col: 1 })).toBe(false);
    expect(idle.calls.tab).toEqual([]);
  });

  it("편집 중 한글 조합 중 Tab도 막고 onTab 한 번 — 표를 떠나지 않는다(리뷰 S-2)", () => {
    const editing = renderGrid({ editing: true });
    expect(editing.press({ key: "Tab", isComposing: true }, { row: 0, col: 1 })).toBe(true);
    expect(editing.calls.tab).toEqual(["forward"]);
  });

  it("Delete · Alt+↓는 줄 인덱스가 아니라 줄 id를 넘긴다", () => {
    const grid = renderGrid({ editing: false });
    grid.press({ key: "Delete" }, { row: 1, col: 1 });
    grid.press({ key: "ArrowDown", altKey: true }, { row: 1, col: 1 });
    expect(grid.calls.deleted).toEqual(["id-2"]);
    expect(grid.calls.moved).toEqual([["id-2", "down"]]);
  });
});
