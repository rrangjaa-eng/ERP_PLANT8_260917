import { createElement, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useGridKeyboard, type GridKeyboardHandlers, type UseGridKeyboardResult } from "@/ui/table/use-grid-keyboard";

// 05-15 — Ctrl+E(편집 중이 아닐 때): 활성 셀 줄에 줄 행동을 연다(견적 줄 `지출결의 올리기`). 호출부가 처리기를 줄 때만 가로챈다.
function renderKeyboard(editing: boolean, handlers: GridKeyboardHandlers): UseGridKeyboardResult {
  let result: UseGridKeyboardResult | undefined;
  function Probe() {
    result = useGridKeyboard({
      rowIds: ["row-1", "row-2"],
      colKeys: ["col-1"],
      isEditableCell: () => true,
      isEditing: () => editing,
      handlers,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("훅이 렌더되지 않았습니다");
  return result;
}

function ctrlE(overrides: { repeat?: boolean } = {}) {
  let prevented = false;
  const event = {
    key: "e",
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: overrides.repeat ?? false,
    nativeEvent: { isComposing: false },
    preventDefault: () => {
      prevented = true;
    },
  };
  return { event: event as unknown as ReactKeyboardEvent<HTMLElement>, prevented: () => prevented };
}

describe("useGridKeyboard — Ctrl+E 줄 행동", () => {
  it("편집 중이 아니면 활성 셀 줄 id로 처리기를 부르고 브라우저 기본 동작은 막는다", () => {
    const opened: string[] = [];
    const keyboard = renderKeyboard(false, { onOpenRow: (rowId) => opened.push(rowId) });
    const { event, prevented } = ctrlE();
    keyboard.handleKeyDown(event, { row: 1, col: 0 });
    expect(opened).toEqual(["row-2"]);
    expect(prevented()).toBe(true);
  });

  it("편집 중에는 아무것도 하지 않는다", () => {
    const opened: string[] = [];
    const keyboard = renderKeyboard(true, { onOpenRow: (rowId) => opened.push(rowId) });
    const { event, prevented } = ctrlE();
    keyboard.handleKeyDown(event, { row: 0, col: 0 });
    expect(opened).toEqual([]);
    expect(prevented()).toBe(false);
  });

  it("처리기가 없는 표는 Ctrl+E를 가로채지 않는다", () => {
    const keyboard = renderKeyboard(false, {});
    const { event, prevented } = ctrlE();
    keyboard.handleKeyDown(event, { row: 0, col: 0 });
    expect(prevented()).toBe(false);
  });

  it("자동 반복이면 처리기를 부르지 않고 기본 동작만 막는다", () => {
    const opened: string[] = [];
    const keyboard = renderKeyboard(false, { onOpenRow: (rowId) => opened.push(rowId) });
    const { event, prevented } = ctrlE({ repeat: true });
    keyboard.handleKeyDown(event, { row: 0, col: 0 });
    expect(opened).toEqual([]);
    expect(prevented()).toBe(true);
  });
});
