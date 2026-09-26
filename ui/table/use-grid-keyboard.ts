"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { isCtrlCombo } from "@/lib/shortcut";
import { resolveFocus, type FocusCell } from "./paging";
import { isGridActionAllowed } from "./save-lock";

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
  /** Delete — 편집 중이 아닐 때만: 줄 삭제 확인 모달을 연다. 04-19 — 줄 인덱스가 아니라 줄 id(쪽이 바뀌어도 같은 줄). */
  onDeleteRow?: (rowId: string) => void;
  /** Ctrl+Enter — 새 줄. 현재 포커스 줄 id를 넘긴다(D-62: 그 줄의
   * 그룹 대분류를 물려받아야 한다 — 어느 그룹 안에서 눌렀는지 알아야 한다). */
  onNewRow?: (currentRowId: string | undefined) => void;
  /** Ctrl+D — 줄 복제. */
  onDuplicateRow?: (rowId: string) => void;
  /** Alt+↑/↓ — 줄 이동. */
  onMoveRow?: (rowId: string, direction: "up" | "down") => void;
  /** Ctrl+S — 일괄 저장. */
  onSave?: () => void;
  /** 04-19 리뷰 B-1 — 편집 중 Enter(편집기가 이미 확정했다) 뒤 아래로 옮겼다. 호출부는 편집기가 내려간 뒤 셀로 포커스를 돌려준다. */
  onCommitDown?: () => void;
  /** 04-30(DR-35) — 막힌 셀(isBlockedCell)의 Enter·글자 입력·Delete. 편집·줄 삭제 대신 이것만 부른다. */
  onBlockedEdit?: (pos: GridPosition) => void;
};

export type UseGridKeyboardParams = {
  /** 04-19(엔지 리뷰 C §1 P2) — 지금 쪽의 줄 id(표시 순서)·열 키. 포커스·범위 앵커는 인덱스가 아니라 이 둘로 기억한다. */
  rowIds: readonly string[];
  colKeys: readonly string[];
  isEditableCell: (pos: GridPosition) => boolean;
  isEditing: (pos: GridPosition) => boolean;
  /** 04-30(DR-35) — 편집기가 있는 열인데 이 셀은 편집 단계가 아니다(잠김·읽기 전용). */
  isBlockedCell?: (pos: GridPosition) => boolean;
  /** 04-49(DR-3) — 저장 요청 중. 편집 진입·구조·저장 키는 무동작이고 방향키·범위 선택은 된다. */
  saveLocked?: boolean;
  /** 04-49(DR-14) — 좁은 PC에서 숨은 열. 방향키가 건너뛰고 로빙 탭 정지도 보이는 열에 둔다. */
  isHiddenCol?: (col: number) => boolean;
  /** 04-19(C-18) — 쪽 첫 줄 ↑ · 끝 줄 ↓(Shift 없이). 옆 쪽으로 넘겼으면 true, 아니면 제자리. */
  onEdgeExit?: (direction: "up" | "down", colKey: string) => boolean;
  /** 04-19 — 편집 중이 아닐 때 Ctrl+A(표 전체 선택 — 지금 쪽 밖의 줄까지). */
  onSelectAll?: () => void;
  /** 04-19 — 편집 중 Tab/Shift+Tab(확정하고 옆 편집 셀로). 편집 중이 아니면 Tab은 표를 떠난다. */
  onTab?: (pos: GridPosition, direction: "forward" | "backward") => void;
  handlers: GridKeyboardHandlers;
};

export type UseGridKeyboardResult = {
  focus: GridPosition;
  setFocus: (pos: GridPosition) => void;
  /** 04-19 — 아직 그리지 않은 쪽의 셀로(쪽을 넘길 때). */
  setFocusCell: (cell: FocusCell) => void;
  selectionAnchor: GridPosition | null;
  /** 04-19 — Ctrl+A로 표 전체가 골라졌다(다른 이동·Esc로 풀린다). */
  allSelected: boolean;
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
  rowIds,
  colKeys,
  isEditableCell,
  isEditing,
  isBlockedCell,
  saveLocked = false,
  isHiddenCol = () => false,
  onEdgeExit,
  onSelectAll,
  onTab,
  handlers,
}: UseGridKeyboardParams): UseGridKeyboardResult {
  const rowCount = rowIds.length;
  const colCount = colKeys.length;
  // 04-19 — 기억은 { rowId, colKey }, 좌표는 렌더마다 지금 쪽에서 다시 찾는다. 그 줄이 없어졌으면 기억할 때의 인덱스 자리.
  const [stored, setStored] = useState<{ cell: FocusCell; at: GridPosition } | null>(null);
  const storedFocus: GridPosition = stored
    ? resolveFocus({ pageIds: rowIds, colKeys, focus: stored.cell, fallback: stored.at })
    : { row: 0, col: 0 };
  // 탭 정지가 숨은 열에 있으면(첫 칸 번호 등) 가장 가까운 보이는 열로 옮겨 보인다.
  const focus: GridPosition = isHiddenCol(storedFocus.col)
    ? { row: storedFocus.row, col: nearestVisibleCol(storedFocus.col) }
    : storedFocus;

  function nearestVisibleCol(col: number): number {
    for (let next = col; next < colCount; next++) if (!isHiddenCol(next)) return next;
    for (let next = col; next >= 0; next--) if (!isHiddenCol(next)) return next;
    return col;
  }
  const [anchorCell, setAnchorCell] = useState<FocusCell | null>(null);
  const anchorRow = anchorCell ? rowIds.indexOf(anchorCell.rowId) : -1;
  const anchorCol = anchorCell ? colKeys.indexOf(anchorCell.colKey) : -1;
  const selectionAnchor: GridPosition | null = anchorRow === -1 || anchorCol === -1 ? null : { row: anchorRow, col: anchorCol };
  const [allSelected, setAllSelected] = useState(false);

  function cellAt(pos: GridPosition): FocusCell {
    return { rowId: rowIds[pos.row] ?? "", colKey: colKeys[pos.col] ?? "" };
  }

  function setFocus(pos: GridPosition) {
    setStored({ cell: cellAt(pos), at: pos });
    setAnchorCell(null);
    setAllSelected(false);
  }

  function setFocusCell(cell: FocusCell) {
    setStored({ cell, at: { row: 0, col: Math.max(0, colKeys.indexOf(cell.colKey)) } });
    setAnchorCell(null);
    setAllSelected(false);
  }

  function clearSelection() {
    setAnchorCell(null);
    setAllSelected(false);
  }

  function isInSelection(pos: GridPosition): boolean {
    if (allSelected) return true;
    if (!selectionAnchor) return false;
    const rowMin = Math.min(selectionAnchor.row, focus.row);
    const rowMax = Math.max(selectionAnchor.row, focus.row);
    const colMin = Math.min(selectionAnchor.col, focus.col);
    const colMax = Math.max(selectionAnchor.col, focus.col);
    return pos.row >= rowMin && pos.row <= rowMax && pos.col >= colMin && pos.col <= colMax;
  }

  function moveFocus(rowDelta: number, colDelta: number, extendSelection: boolean, from: GridPosition) {
    if (rowCount === 0 || colCount === 0) return;
    // 04-19(C-18) — 쪽 끝을 넘는 ↑↓는 옆 쪽으로(호출부). Shift 범위는 쪽 안에서 멈춘다.
    const beyond = from.row + rowDelta < 0 || from.row + rowDelta > rowCount - 1;
    if (rowDelta !== 0 && beyond && !extendSelection && onEdgeExit?.(rowDelta < 0 ? "up" : "down", colKeys[from.col] ?? "")) return;
    let col = clamp(from.col + colDelta, 0, colCount - 1);
    // 04-49(DR-14) — 숨은 열은 건너뛴다. 끝까지 숨은 열뿐이면 제자리.
    while (colDelta !== 0 && col !== from.col && isHiddenCol(col)) {
      const step = Math.sign(colDelta);
      col = col + step < 0 || col + step >= colCount ? from.col : col + step;
    }
    const next = { row: clamp(from.row + rowDelta, 0, rowCount - 1), col };
    if (extendSelection) {
      setAnchorCell((anchor) => anchor ?? cellAt(from));
    } else {
      setAnchorCell(null);
    }
    setAllSelected(false);
    setStored({ cell: cellAt(next), at: next });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>, pos: GridPosition) {
    const editing = isEditing(pos);
    const allowed = (action: Parameters<typeof isGridActionAllowed>[0]) => isGridActionAllowed(action, { saveLocked });

    // 줄 이동은 방향키보다 먼저 판정한다(Alt+↑/↓가 일반 방향키 이동과 겹친다).
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const rowId = rowIds[pos.row];
      if (allowed("moveRow") && rowId !== undefined) handlers.onMoveRow?.(rowId, event.key === "ArrowUp" ? "up" : "down");
      return;
    }

    // D-94 · 엔지 리뷰 C §1 P1 — 앱이 쓰는 세 조합은 Ctrl 전용이고 판정은
    // isCtrlCombo 하나다(자동 반복·한글 조합 중이면 거짓 — 무시). 무시할 때도
    // 브라우저 기본 동작(페이지 저장 창 등)은 막는다. 편집 중 Ctrl+C·V·A는
    // 여기 걸리지 않아 입력의 기본 동작 그대로다. 04-19 — 편집 중이 아닐 때 Ctrl+A는 표 전체 선택이고, Ctrl+C는
    // 가로채지 않는다(브라우저가 쏘는 copy 이벤트를 Table이 받는다).
    if (event.ctrlKey && ["enter", "d", "s"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (isCtrlCombo(event, "Enter")) {
        if (allowed("newRow")) handlers.onNewRow?.(rowIds[pos.row]);
      } else if (isCtrlCombo(event, "d")) {
        const rowId = rowIds[pos.row];
        if (allowed("duplicateRow") && rowId !== undefined) handlers.onDuplicateRow?.(rowId);
      } else if (isCtrlCombo(event, "s")) {
        if (allowed("save")) handlers.onSave?.();
      }
      return;
    }

    if (!editing && isCtrlCombo(event, "a")) {
      event.preventDefault();
      setAnchorCell(null);
      setAllSelected(true);
      onSelectAll?.();
      return;
    }

    // 04-49 — 한글 조합 중인 키는 격자 동작을 시작하지 않는다(조합 확정 Enter가 편집을 열지 않게). Ctrl 조합은 위에서 기본 동작을 막았다(리뷰 S-1).
    if (event.nativeEvent.isComposing) return;

    if (editing) {
      // 편집 중에는 이 훅이 방향키·Delete를 가로채지 않는다 — 입력 요소
      // 자체의 커서 이동·글자 삭제가 자연스럽게 동작해야 한다. Esc·Enter만
      // 편집 종료 신호로 계속 처리한다. 04-19 — Tab/Shift+Tab은 확정하고 옆 편집 셀로(호출부).
      if (event.key === "Tab" && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onTab?.(pos, event.shiftKey ? "backward" : "forward");
      } else if (event.key === "Escape") {
        event.preventDefault();
        handlers.onEscape?.(pos, true);
      } else if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        // 04-19 리뷰 B-1 — 확정 후 아래(§7-3 「Enter 아래」). 쪽 마지막 줄이면 ↓와 같은 onEdgeExit로 다음 쪽.
        handlers.onCommitDown?.();
        moveFocus(1, 0, false, pos);
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
          if (allowed("enterEdit")) handlers.onEnterEdit?.(pos);
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
        else if (allowed("deleteRow") && rowIds[pos.row] !== undefined) handlers.onDeleteRow?.(rowIds[pos.row]!);
        break;
      default:
        // 글자 입력(한 글자 키, 조합 키 없음) — 막힌 셀이면 이유만.
        if (blocked && event.key.length === 1 && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          handlers.onBlockedEdit?.(pos);
        }
        break;
    }
  }

  return { focus, setFocus, setFocusCell, selectionAnchor, allSelected, clearSelection, isInSelection, handleKeyDown };
}
