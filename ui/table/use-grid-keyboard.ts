"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { isCtrlCombo } from "@/lib/shortcut";

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
  /** Ctrl+Enter — 새 줄. 현재 포커스 행 인덱스를 넘긴다(D-62: 그 줄의
   * 그룹 대분류를 물려받아야 한다 — 어느 그룹 안에서 눌렀는지 알아야 한다). */
  onNewRow?: (currentRowIndex: number) => void;
  /** Ctrl+D — 줄 복제. */
  onDuplicateRow?: (rowIndex: number) => void;
  /** Alt+↑/↓ — 줄 이동. */
  onMoveRow?: (rowIndex: number, direction: "up" | "down") => void;
  /** Ctrl+S — 일괄 저장. */
  onSave?: () => void;
  /** 04-30(DR-35) — 막힌 셀(isBlockedCell)의 Enter·글자 입력·Delete. 편집·줄 삭제 대신 이것만 부른다. */
  onBlockedEdit?: (pos: GridPosition) => void;
};

export type UseGridKeyboardParams = {
  rowCount: number;
  colCount: number;
  isEditableCell: (pos: GridPosition) => boolean;
  isEditing: (pos: GridPosition) => boolean;
  /** 04-30(DR-35) — 편집기가 있는 열인데 이 셀은 편집 단계가 아니다(잠김·읽기 전용). */
  isBlockedCell?: (pos: GridPosition) => boolean;
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

// 04-28(DR-25) — 충돌 셀 키보드. 셀에서 Enter → 셀 안 두 3차 버튼 중 첫째
// (「덮어쓰기」), 버튼 위 ←/→는 둘 사이(끝에서 멈춤), Enter/Space는 그 버튼을
// 누르고 셀로, Esc는 누르지 않고 셀로. 버튼 위 ↑/↓는 격자 이동 없이 그대로.
// null이면 격자 기본 처리에 맡긴다. 04-19가 포커스를 { rowId, colKey }로 바꿀 때
// 이 전이를 그대로 옮긴다.
export type ConflictFocusState = { at: "cell" } | { at: "action"; index: number };
export type ConflictFocusResult = { at: "cell"; pressed?: number } | { at: "action"; index: number };

const CONFLICT_ACTION_COUNT = 2;

export function conflictFocusTransition(state: ConflictFocusState, key: string): ConflictFocusResult | null {
  if (state.at === "cell") return key === "Enter" ? { at: "action", index: 0 } : null;
  switch (key) {
    case "ArrowRight":
      return { at: "action", index: Math.min(state.index + 1, CONFLICT_ACTION_COUNT - 1) };
    case "ArrowLeft":
      return { at: "action", index: Math.max(state.index - 1, 0) };
    case "ArrowUp":
    case "ArrowDown":
      return { at: "action", index: state.index };
    case "Escape":
      return { at: "cell" };
    case "Enter":
    case " ":
      return { at: "cell", pressed: state.index };
    default:
      return null;
  }
}

export function useGridKeyboard({
  rowCount,
  colCount,
  isEditableCell,
  isEditing,
  isBlockedCell,
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

    // 줄 이동은 방향키보다 먼저 판정한다(Alt+↑/↓가 일반 방향키 이동과 겹친다).
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      handlers.onMoveRow?.(pos.row, event.key === "ArrowUp" ? "up" : "down");
      return;
    }

    // D-94 · 엔지 리뷰 C §1 P1 — 앱이 쓰는 세 조합은 Ctrl 전용이고 판정은
    // isCtrlCombo 하나다(자동 반복·한글 조합 중이면 거짓 — 무시). 무시할 때도
    // 브라우저 기본 동작(페이지 저장 창 등)은 막는다. 편집 중 Ctrl+C·V·A는
    // 여기 걸리지 않아 입력의 기본 동작 그대로다.
    if (event.ctrlKey && ["enter", "d", "s"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (isCtrlCombo(event, "Enter")) handlers.onNewRow?.(pos.row);
      else if (isCtrlCombo(event, "d")) handlers.onDuplicateRow?.(pos.row);
      else if (isCtrlCombo(event, "s")) handlers.onSave?.();
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

    const blocked = handlers.onBlockedEdit !== undefined && (isBlockedCell?.(pos) ?? false);

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
        } else if (blocked) {
          event.preventDefault();
          handlers.onBlockedEdit?.(pos);
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
        if (blocked) handlers.onBlockedEdit?.(pos);
        else handlers.onDeleteRow?.(pos.row);
        break;
      default:
        // 글자 입력(한 글자 키, 조합 키 없음) — 막힌 셀이면 이유만.
        if (blocked && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          handlers.onBlockedEdit?.(pos);
        }
        break;
    }
  }

  return { focus, setFocus, selectionAnchor, clearSelection, isInSelection, handleKeyDown };
}
