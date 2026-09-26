import { createElement, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useGridKeyboard, type UseGridKeyboardResult } from "@/ui/table/use-grid-keyboard";

// 04-49 리뷰 S-1 · D-94 — 한글 조합 중 Ctrl+S는 저장하지 않지만 브라우저 기본 동작(페이지 저장 창)은 막는다.
// jsdom 없이 react-dom/server로 한 번 렌더해 훅의 handleKeyDown을 꺼낸다.
function renderKeyboard(editing: boolean, onSave: () => void): UseGridKeyboardResult {
  let result: UseGridKeyboardResult | undefined;
  function Probe() {
    result = useGridKeyboard({
      rowCount: 1,
      colCount: 1,
      isEditableCell: () => true,
      isEditing: () => editing,
      handlers: { onSave },
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("훅이 렌더되지 않았습니다");
  return result;
}

function composingCtrlS() {
  let prevented = false;
  const event = {
    key: "s",
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    nativeEvent: { isComposing: true },
    preventDefault: () => {
      prevented = true;
    },
  };
  return { event: event as unknown as ReactKeyboardEvent<HTMLElement>, prevented: () => prevented };
}

describe("useGridKeyboard — 한글 조합 중 Ctrl+S (리뷰 S-1 · D-94)", () => {
  it.each([false, true])("편집 중=%s — 저장하지 않고 기본 동작은 막는다", (editing) => {
    let saved = 0;
    const keyboard = renderKeyboard(editing, () => {
      saved += 1;
    });
    const { event, prevented } = composingCtrlS();
    keyboard.handleKeyDown(event, { row: 0, col: 0 });
    expect(saved).toBe(0);
    expect(prevented()).toBe(true);
  });
});
