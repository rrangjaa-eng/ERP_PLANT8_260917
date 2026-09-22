"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

// SYSTEM.md §7-3 보강 (아) — `role="grid"` 키보드 계약. 표 전체가 탭 정지
// **1개**이고(로빙 tabindex — 이 훅이 관리하는 `focus` 좌표만 tabIndex=0),
// 안에서는 방향키로 셀 사이를 움직인다. 그룹 머리글 행은 이 좌표 체계에
// 아예 들어오지 않는다 — Table.tsx가 데이터 행만 (rowIndex, colIndex)로
// 세므로 방향키가 "건너뛴다"는 요구가 저절로 성립한다(별도 skip 로직 불필요).
export type GridPosition = { row: number; col: number };

export type GridKeyboardHandlers = {
  /** Enter/클릭 — 이 셀이 편집 가능할 때만 호출된다. */
  onEnterEdit?: (pos: GridPosition) => void;
  /** Esc — 편집 중이면 되돌리기, 아니면 범위 해제(호출부가 값 되돌리기를 한다). */
  onEscape?: (pos: GridPosition, wasEditing: boolean) => void;
  /** Delete — 편집 중이 아닐 때만: 줄 삭제 확인 모달을 연다. */
  onDeleteRow?: (rowIndex: number) => void;
  /** ⌘/Ctrl+Enter — 새 줄. */
  onNewRow?: () => void;
  /** ⌘/Ctrl+D — 줄 복제. */
  onDuplicateRow?: (rowIndex: number) => void;
  /** Alt+↑/↓ — 줄 이동. */
  onMoveRow?: (rowIndex: number, direction: "up" | "down") => void;
  /** ⌘/Ctrl+S — 일괄 저장. */
  onSave?: () => void;
};

export type UseGridKeyboardParams = {
  rowCount: number;
  colCount: number;
  isEditableCell: (pos: GridPosition) => boolean;
  isEditing: (pos: GridPosition) => boolean;
  handlers: GridKeyboardHandlers;
};

export type UseGridKeyboardResult = {
  focus: GridPosition;
  setFocus: (pos: GridPosition) => void;
  selectionAnchor: GridPosition | null;
  clearSelection: () => void;
  isInSelection: (pos: GridPosition) => boolean;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>, pos: GridPosition) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useGridKeyboard({
  rowCount,
  colCount,
  isEditableCell,
  isEditing,
  handlers,
}: UseGridKeyboardParams): UseGridKeyboardResult {
  const [focus, setFocusState] = useState<GridPosition>({ row: 0, col: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<GridPosition | null>(null);

  function setFocus(pos: GridPosition) {
    setFocusState(pos);
    setSelectionAnchor(null);
  }

  function clearSelection() {
    setSelectionAnchor(null);
  }

  function isInSelection(pos: GridPosition): boolean {
    if (!selectionAnchor) return false;
    const rowMin = Math.min(selectionAnchor.row, focus.row);
    const rowMax = Math.max(selectionAnchor.row, focus.row);
    const colMin = Math.min(selectionAnchor.col, focus.col);
    const colMax = Math.max(selectionAnchor.col, focus.col);
    return pos.row >= rowMin && pos.row <= rowMax && pos.col >= colMin && pos.col <= colMax;
  }

  function moveFocus(rowDelta: number, colDelta: number, extendSelection: boolean, from: GridPosition) {
    if (rowCount === 0 || colCount === 0) return;
    const next = { row: clamp(from.row + rowDelta, 0, rowCount - 1), col: clamp(from.col + colDelta, 0, colCount - 1) };
    if (extendSelection) {
      setSelectionAnchor((anchor) => anchor ?? from);
    } else {
      setSelectionAnchor(null);
    }
    setFocusState(next);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>, pos: GridPosition) {
    const editing = isEditing(pos);
    const meta = event.metaKey || event.ctrlKey;

    // 줄 이동은 방향키보다 먼저 판정한다(Alt+↑/↓가 일반 방향키 이동과 겹친다).
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      handlers.onMoveRow?.(pos.row, event.key === "ArrowUp" ? "up" : "down");
      return;
    }

    if (meta && (event.key === "Enter" || event.key === "NumpadEnter")) {
      event.preventDefault();
      handlers.onNewRow?.();
      return;
    }
    if (meta && (event.key === "d" || event.key === "D")) {
      event.preventDefault();
      handlers.onDuplicateRow?.(pos.row);
      return;
    }
    if (meta && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      handlers.onSave?.();
      return;
    }

    if (editing) {
      // 편집 중에는 이 훅이 방향키·Delete를 가로채지 않는다 — 입력 요소
      // 자체의 커서 이동·글자 삭제가 자연스럽게 동작해야 한다. Esc·Enter만
      // 편집 종료 신호로 계속 처리한다.
      if (event.key === "Escape") {
        event.preventDefault();
        handlers.onEscape?.(pos, true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1, 0, event.shiftKey, pos);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1, 0, event.shiftKey, pos);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(0, -1, event.shiftKey, pos);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(0, 1, event.shiftKey, pos);
        break;
      case "Enter":
      case " ":
        if (isEditableCell(pos)) {
          event.preventDefault();
          handlers.onEnterEdit?.(pos);
        }
        break;
      case "Escape":
        event.preventDefault();
        handlers.onEscape?.(pos, false);
        clearSelection();
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        handlers.onDeleteRow?.(pos.row);
        break;
      default:
        break;
    }
  }

  return { focus, setFocus, selectionAnchor, clearSelection, isInSelection, handleKeyDown };
}
