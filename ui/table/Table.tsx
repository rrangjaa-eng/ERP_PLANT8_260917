"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { isCtrlCombo } from "@/lib/shortcut";
import styles from "./Table.module.css";
import { isGridActionAllowed } from "./save-lock";
import { useMinWidth } from "./use-editable-width";
import type { CellEditability, CellIssue, TableColumn } from "./types";
import { conflictFocusTransition, useGridKeyboard, type ConflictFocusState, type GridPosition } from "./use-grid-keyboard";

// SYSTEM.md §7-3 + 보강 (가)~(아) — 편집/읽기 겸용 표. **렌더 형태는 서버가
// 보낸 셀 편집 가능성에서 파생된다 — 모드를 켜고 끄는 prop이 없다**(가).
//
// 04-04 — `enableGridKeyboard`는 **opt-in**이다(기본 false). 켜지 않은 표는
// 04-01/04-02가 만든 기존 동작(편집 가능 셀마다 tabIndex=0, 로빙 없음)을
// 그대로 유지한다 — revenue-section.tsx·관리자 표 등 이 플랜이 건드리지
// 않는 소비자의 회귀를 막는다(범위 경계). 켜면 표 전체가 탭 정지 1개인
// 로빙 tabIndex + 방향키 + Esc + Delete + 새 줄 + 줄 복제 + 줄 이동 +
// 붙여넣기 + 셀 오류·충돌 렌더가 활성화된다(§7-3 (아)).
export type TableKeyboardHandlers<Row> = {
  onDeleteRow?: (row: Row) => void;
  /** Ctrl+Enter — 새 줄. 포커스가 있던 행을 넘긴다(그룹 대분류 상속, D-62). */
  onNewRow?: (currentRow?: Row) => void;
  onDuplicateRow?: (row: Row) => void;
  onMoveRow?: (row: Row, direction: "up" | "down") => void;
  onSave?: () => void;
  /** 편집 중 Esc — 그 셀 값을 되돌린다(커밋 없이 편집을 닫는다). */
  onEscapeCell?: (row: Row, columnKey: string) => void;
};

export type TableProps<Row> = {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  groupBy?: (row: Row) => string;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void; shortcut?: string };
  footer?: ReactNode;
  onCellCommit?: (rowId: string, columnKey: string, value: string) => void;
  /**
   * 04-02(U-3 계획 단계 판단) — 행이 0개일 때도 `footer`를 함께 렌더한다.
   * 기본은 false(기존 표의 EMPTY 단독 렌더 유지) — 입금 줄 표처럼 EMPTY
   * 상태에서도 합계 행에 미수 금액을 보여야 하는 표만 켠다.
   */
  alwaysShowFooter?: boolean;
  /** 04-04 — role="grid" 키보드 계약을 켠다(opt-in, 기본 false). */
  enableGridKeyboard?: boolean;
  keyboard?: TableKeyboardHandlers<Row>;
  /** 04-04(다) — 활성(포커스) 셀에서 붙여넣기가 발생하면 위임한다. */
  onPasteAtCell?: (row: Row, columnKey: string, clipboardText: string) => void;
  /** 04-04(나)(다) — 셀 오류·충돌(있으면 고정 오류 모양 + aria-invalid). */
  cellIssue?: (row: Row, columnKey: string) => CellIssue | undefined;
  /** 04-04(바) — 폰에서 줄을 탭하면 호출된다(RowSheet를 여는 신호). */
  onRowTap?: (row: Row) => void;
  /** 04-04 — dirty(미저장 편집) 셀 고정 표시(좌측 인셋 선). */
  cellDirty?: (row: Row, columnKey: string) => boolean;
  /** 04-04 — 저장 성공 직후 600ms 틴트(Copywriting SUCCESS 행). */
  cellSaved?: (row: Row, columnKey: string) => boolean;
  /**
   * 04-30(DR-35) — 편집 셀이 있는 격자에서 편집기가 있는 열의 `edit`이 아닌 셀에 Enter·글자 입력·Delete가 오면
   * 편집 모드를 열지 않고(줄 삭제도 하지 않고) 이것만 부른다. 이유 표시는 호출부가 cellIssue `reason`으로 한다.
   */
  onBlockedEdit?: (row: Row, columnKey: string) => void;
  /**
   * 04-49(DR-3 · 계약 3) — 저장 요청 중. 격자 모양은 그대로 두고 `aria-busy`만 붙이며, 편집 진입·붙여넣기·구조·저장
   * 동작을 `isGridActionAllowed`로 거른다(방향키·범위 선택은 된다).
   */
  saveLocked?: boolean;
  /** 04-49(04-30 리뷰 S-5) — 셀 편집기가 열리고 닫힐 때 알린다(열린 편집기 값은 아직 dirty에 들지 않는다). */
  onEditingChange?: (editing: boolean) => void;
  /** 04-23 — 호출부가 방금 만든 줄의 한 칸을 편집 상태로 연다(객체가 바뀔 때마다 한 번, 그 칸이 `edit`일 때만). */
  openCell?: { rowId: string; columnKey: string } | null;
};

type ActiveCell = { rowId: string; columnKey: string } | null;

function groupRows<Row>(rows: Row[], groupBy?: (row: Row) => string): { header: string | null; rows: Row[] }[] {
  if (!groupBy) return [{ header: null, rows }];
  const groups: { header: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const header = groupBy(row);
    const existing = groups.find((group) => group.header === header);
    if (existing) existing.rows.push(row);
    else groups.push({ header, rows: [row] });
  }
  return groups;
}

export function Table<Row>({
  caption,
  columns,
  rows,
  getRowId,
  groupBy,
  emptyMessage,
  emptyAction,
  footer,
  onCellCommit,
  alwaysShowFooter,
  enableGridKeyboard = false,
  keyboard,
  onPasteAtCell,
  cellIssue,
  onRowTap,
  cellDirty,
  cellSaved,
  onBlockedEdit,
  saveLocked = false,
  onEditingChange,
  openCell,
}: TableProps<Row>) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const allowed = (action: Parameters<typeof isGridActionAllowed>[0]) => isGridActionAllowed(action, { saveLocked });
  // 04-49(DR-14) — collapseBelow로 숨은 열(CSS와 같은 폭 판정). 방향키가 건너뛴다.
  const atLeast1280 = useMinWidth(1280);
  const atLeast1024 = useMinWidth(1024);
  const isHiddenColumn = (column: TableColumn<Row> | undefined) =>
    (column?.collapseBelow === 1280 && !atLeast1280) || (column?.collapseBelow !== undefined && !atLeast1024);
  const collapseClass = (column: TableColumn<Row>) => (column.collapseBelow ? styles[`collapse-${column.collapseBelow}`] : "");

  // (가) — 편집 가능한 셀이 하나라도 있으면 role="grid" + --g-100 머리글,
  // 하나도 없으면 <table> + 시각적으로 숨긴 <caption> + 흰 머리글.
  const hasEditableCell = rows.some((row) =>
    columns.some((column) => (column.editability?.(row) ?? "readonly") === "edit"),
  );

  const groups = groupRows(rows, groupBy);
  // 그룹 머리글 행은 이 평탄화 목록에 들어오지 않는다 — 로빙 tabIndex·방향키
  // 좌표 체계가 데이터 행만 센다(방향키가 그룹 머리글을 "건너뛴다"는 (라)
  // 요구가 저절로 성립한다).
  const flatRows: Row[] = groups.flatMap((group) => group.rows);

  function cellEditability(column: TableColumn<Row>, row: Row): CellEditability {
    return column.editability?.(row) ?? "readonly";
  }

  // 04-28 — 편집 중 Esc로 입력 요소가 사라지면 포커스가 <body>로 빠져 표
  // 키보드가 끊긴다. 입력 요소가 내려간 뒤 그 셀로 포커스를 돌려준다(먼저
  // 옮기면 입력의 blur 커밋이 취소를 덮는다).
  const refocusCellRef = useRef(false);

  const keyboardState = useGridKeyboard({
    rowCount: flatRows.length,
    colCount: columns.length,
    isEditableCell: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return cellEditability(column, row) === "edit";
    },
    isBlockedCell: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!hasEditableCell || !row || !column || !column.editCell) return false;
      return cellEditability(column, row) !== "edit";
    },
    isEditing: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return activeCell?.rowId === getRowId(row) && activeCell.columnKey === column.key;
    },
    saveLocked,
    isHiddenCol: (col) => isHiddenColumn(columns[col]),
    handlers: {
      onEnterEdit: (pos) => {
        const row = flatRows[pos.row];
        const column = columns[pos.col];
        if (!row || !column) return;
        setActiveCell({ rowId: getRowId(row), columnKey: column.key });
      },
      onEscape: (pos, wasEditing) => {
        const row = flatRows[pos.row];
        const column = columns[pos.col];
        if (wasEditing) {
          refocusCellRef.current = true;
          setActiveCell(null);
          if (row && column) keyboard?.onEscapeCell?.(row, column.key);
        }
      },
      onDeleteRow: (rowIndex) => {
        const row = flatRows[rowIndex];
        if (row) keyboard?.onDeleteRow?.(row);
      },
      onNewRow: (rowIndex) => {
        const row = flatRows[rowIndex];
        keyboard?.onNewRow?.(row);
      },
      onDuplicateRow: (rowIndex) => {
        const row = flatRows[rowIndex];
        if (row) keyboard?.onDuplicateRow?.(row);
      },
      onMoveRow: (rowIndex, direction) => {
        const row = flatRows[rowIndex];
        if (row) keyboard?.onMoveRow?.(row, direction);
      },
      onBlockedEdit: onBlockedEdit
        ? (pos) => {
            const row = flatRows[pos.row];
            const column = columns[pos.col];
            if (row && column) onBlockedEdit(row, column.key);
          }
        : undefined,
      onSave: () => {
        // 04-30(엔지 r2) — 열린 셀 편집기를 먼저 커밋한다. 편집기 blur는 Enter 커밋과 같은 onCommit 경로이고,
        // 커밋 뒤 포커스는 그 셀로 돌아온다. 저장 호출부는 이 커밋이 반영된 뒤 페이로드를 모은다.
        const active = document.activeElement;
        if (activeCell && active instanceof HTMLElement && tableRef.current?.contains(active)) {
          refocusCellRef.current = true;
          active.blur();
        }
        keyboard?.onSave?.();
      },
    },
  });

  // 04-28(앞 플랜 결함 — 04-04) — 방향키가 로빙 좌표(tabIndex)만 옮기고 DOM
  // 포커스는 옛 셀에 남아 「이동 ↑↓←→」가 동작하지 않았다. 표 안에 포커스가
  // 있을 때 좌표가 바뀌면 그 셀로 포커스를 옮긴다(편집 중 입력 요소는 건드리지 않는다).
  const tableRef = useRef<HTMLTableElement>(null);
  // 좌표가 실제로 바뀔 때만 옮긴다 — 첫 렌더(하이드레이션)에서 옮기면 그 전에
  // 사용자가 둔 포커스를 (0,0)으로 빼앗는다.
  const lastFocusRef = useRef(`${keyboardState.focus.row}:${keyboardState.focus.col}`);
  useEffect(() => {
    const key = `${keyboardState.focus.row}:${keyboardState.focus.col}`;
    if (lastFocusRef.current === key) return;
    lastFocusRef.current = key;
    if (!enableGridKeyboard) return;
    const table = tableRef.current;
    const active = document.activeElement;
    if (!table || !active || !table.contains(active)) return;
    const target = table.querySelector<HTMLElement>("td[data-grid-focus]");
    if (target && !target.contains(active)) target.focus();
  }, [enableGridKeyboard, keyboardState.focus.row, keyboardState.focus.col]);

  // 04-23 — 요청 객체가 바뀐 렌더에서 한 번 연다(렌더 중 상태 조정 — 효과 안 setState를 피한다).
  const [seenOpenCell, setSeenOpenCell] = useState(openCell);
  if (openCell !== seenOpenCell) {
    setSeenOpenCell(openCell);
    const rowIndex = openCell ? flatRows.findIndex((row) => getRowId(row) === openCell.rowId) : -1;
    const colIndex = openCell ? columns.findIndex((column) => column.key === openCell.columnKey) : -1;
    const row = flatRows[rowIndex];
    const column = columns[colIndex];
    if (openCell && row && column?.editCell && cellEditability(column, row) === "edit" && allowed("enterEdit")) {
      keyboardState.setFocus({ row: rowIndex, col: colIndex });
      setActiveCell(openCell);
    }
  }

  const editing = activeCell !== null;
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  // 04-49 — 잠금이 걸리는 순간 표 안에 열려 있던 편집기는 버리지 않고 blur(커밋 입구)로 닫는다.
  useEffect(() => {
    if (!saveLocked) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches("input, textarea, select") && tableRef.current?.contains(active)) {
      active.blur();
    }
  }, [saveLocked]);

  useEffect(() => {
    if (!refocusCellRef.current || activeCell) return;
    refocusCellRef.current = false;
    tableRef.current?.querySelector<HTMLElement>("td[data-grid-focus]")?.focus();
  }, [activeCell]);

  // 04-28(DR-25) — 충돌 셀(3차 버튼 둘) 안의 키. 처리했으면 true, 격자 기본
  // 처리에 맡길 키면 false. 버튼은 tabindex=-1이라 격자의 탭 정지는 1개 그대로다.
  function handleConflictKey(event: React.KeyboardEvent<HTMLTableCellElement>, issue: CellIssue | undefined): boolean {
    const actions = issue?.kind === "conflict" ? issue.actions : undefined;
    if (!actions || actions.length !== 2 || event.ctrlKey || event.altKey) return false;
    const cell = event.currentTarget;
    const buttons = Array.from(cell.querySelectorAll<HTMLButtonElement>("button[data-issue-action]"));
    const buttonIndex = buttons.indexOf(event.target as HTMLButtonElement);
    let state: ConflictFocusState;
    if (buttonIndex !== -1) state = { at: "action", index: buttonIndex };
    else if (event.target === cell) state = { at: "cell" };
    else return false;
    const next = conflictFocusTransition(state, event.key);
    if (!next) return false;
    event.preventDefault();
    if (next.at === "action") {
      buttons[next.index]?.focus();
    } else {
      if (next.pressed !== undefined) actions[next.pressed]?.onClick();
      cell.focus();
    }
    return true;
  }

  if (rows.length === 0) {
    return (
      <table className={styles.table} aria-busy={saveLocked ? true : undefined}>
        <caption className="sr-only">{caption}</caption>
        <tbody>
          <tr>
            <td className={styles.emptyCell}>
              <span>{emptyMessage ?? "데이터가 없습니다"}</span>
              {emptyAction ? (
                <button
                  type="button"
                  className={styles.emptyAction}
                  onClick={() => {
                    if (allowed("newRow")) emptyAction.onClick();
                  }}
                  onKeyDown={(event) => {
                    // 04-28 — 표시한 kbd(Ctrl+Enter)가 실제로 동작한다(C-07).
                    if (emptyAction.shortcut === "Ctrl+Enter" && isCtrlCombo(event, "Enter")) {
                      event.preventDefault();
                      if (allowed("newRow")) emptyAction.onClick();
                    }
                  }}
                >
                  {emptyAction.label}
                  {emptyAction.shortcut ? <kbd className={styles.emptyActionKbd}>{emptyAction.shortcut}</kbd> : null}
                </button>
              ) : null}
            </td>
          </tr>
        </tbody>
        {alwaysShowFooter && footer ? <tfoot aria-live="polite">{footer}</tfoot> : null}
      </table>
    );
  }

  function renderCell(column: TableColumn<Row>, row: Row) {
    const rowId = getRowId(row);
    const editability = cellEditability(column, row);
    const isActive = activeCell?.rowId === rowId && activeCell.columnKey === column.key;

    if (isActive && editability === "edit" && column.editCell) {
      return column.editCell(row, {
        onCommit: (value) => {
          onCellCommit?.(rowId, column.key, value);
          setActiveCell(null);
        },
        onCancel: () => setActiveCell(null),
      });
    }

    const primary = column.cell(row);
    const secondary = column.secondaryLine?.(row);
    if (secondary === null || secondary === undefined || secondary === "") return primary;
    return (
      <>
        <div>{primary}</div>
        <div className={styles.cellSecondary}>{secondary}</div>
      </>
    );
  }

  function handleTablePaste(event: React.ClipboardEvent<HTMLTableElement>) {
    if (!enableGridKeyboard || !onPasteAtCell) return;
    if (!allowed("paste")) {
      event.preventDefault();
      return;
    }
    // 편집 중인 셀의 <input>·<textarea>에서 bubbling된 paste는 그 칸의
    // 네이티브 붙여넣기(값 그대로 들어가 onChange가 처리)로 두고, 표
    // 수준 TSV 붙여넣기로 가로채지 않는다.
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const row = flatRows[keyboardState.focus.row];
    const column = columns[keyboardState.focus.col];
    if (!row || !column) return;
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    onPasteAtCell(row, column.key, text);
  }

  return (
    <table
      ref={tableRef}
      className={[styles.table, hasEditableCell ? styles.editable : styles.readonly].join(" ")}
      role={hasEditableCell ? "grid" : undefined}
      aria-busy={saveLocked ? true : undefined}
      onPaste={enableGridKeyboard ? handleTablePaste : undefined}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={[
                styles.headerCell,
                styles[`prio-${column.priority}`],
                collapseClass(column),
                column.align === "right" ? styles.alignRight : "",
              ].join(" ")}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((group, groupIndex) => (
        <tbody key={group.header ?? `group-${groupIndex}`}>
          {group.header !== null ? (
            <tr className={styles.groupRow}>
              <td colSpan={columns.length} className={styles.groupHeader}>
                {group.header}
              </td>
            </tr>
          ) : null}
          {group.rows.map((row) => {
            const rowId = getRowId(row);
            const flatRowIndex = flatRows.indexOf(row);
            // 편집 가능 열은 summary가 있을 때만 접힌 줄에 낀다 — 그러지
            // 않으면 같은 입력 요소가 주 행·접힌 줄 두 곳에 동시에
            // 마운트된다(중복 aria-label, 상태 불일치).
            const p2Values = columns
              .filter((column) => column.priority === "p2")
              .filter((column) => cellEditability(column, row) !== "edit" || column.summary)
              .map((column) => (column.summary ? column.summary(row) : column.cell(row)))
              .filter((value): value is ReactNode => value !== null && value !== undefined && value !== "");

            return (
              <Fragment key={rowId}>
                <tr>
                  {columns.map((column, colIndex) => {
                    const editability = cellEditability(column, row);
                    const isEditableColumn = editability === "edit";
                    const pos: GridPosition = { row: flatRowIndex, col: colIndex };
                    const isFocusPos =
                      enableGridKeyboard && keyboardState.focus.row === pos.row && keyboardState.focus.col === pos.col;
                    const issue = cellIssue?.(row, column.key);
                    const issueId = issue ? `${rowId}-${column.key}-issue` : undefined;
                    const invalid = issue !== undefined && issue.kind !== "reason";

                    return (
                      <td
                        key={column.key}
                        role={hasEditableCell ? "gridcell" : undefined}
                        aria-readonly={hasEditableCell ? editability !== "edit" : undefined}
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={issueId}
                        data-grid-focus={isFocusPos ? "" : undefined}
                        tabIndex={
                          enableGridKeyboard
                            ? isFocusPos
                              ? 0
                              : -1
                            : hasEditableCell && isEditableColumn
                              ? 0
                              : undefined
                        }
                        className={[
                          styles.cell,
                          styles[`prio-${column.priority}`],
                          collapseClass(column),
                          column.align === "right" ? styles.alignRight : "",
                          isEditableColumn ? styles.editableCell : "",
                          editability === "locked" ? styles.lockedCell : "",
                          invalid ? (issue.kind === "conflict" ? styles.conflictCell : styles.errorCell) : "",
                          enableGridKeyboard && keyboardState.isInSelection(pos) ? styles.selectedCell : "",
                          !invalid && cellDirty?.(row, column.key) ? styles.dirtyCell : "",
                          cellSaved?.(row, column.key) ? styles.savedTint : "",
                        ].join(" ")}
                        onClick={() => {
                          if (enableGridKeyboard) keyboardState.setFocus(pos);
                          if (isEditableColumn && column.editCell && allowed("enterEdit")) {
                            setActiveCell({ rowId, columnKey: column.key });
                          }
                        }}
                        onFocus={() => {
                          if (enableGridKeyboard) keyboardState.setFocus(pos);
                        }}
                        onKeyDown={
                          enableGridKeyboard
                            ? (event) => {
                                if (handleConflictKey(event, issue)) return;
                                keyboardState.handleKeyDown(event, pos);
                              }
                            : (event) => {
                                // 04-41 — 격자 키보드를 켜지 않은 표도 onSave를 받으면 칸 안의 Ctrl+S가 저장이다(매출 표).
                                if (keyboard?.onSave && isCtrlCombo(event, "s")) {
                                  event.preventDefault();
                                  if (allowed("save")) keyboard.onSave();
                                  return;
                                }
                                if ((event.key === "Enter" || event.key === " ") && isEditableColumn && column.editCell && allowed("enterEdit")) {
                                  event.preventDefault();
                                  setActiveCell({ rowId, columnKey: column.key });
                                }
                              }
                        }
                      >
                        {renderCell(column, row)}
                        {issue ? (
                          <p id={issueId} className={styles.issueReason}>
                            {issue.message}
                            {issue.actions?.map((action, index) => (
                              <Fragment key={action.label}>
                                {index === 0 ? " · " : " / "}
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  data-issue-action=""
                                  className={styles.issueAction}
                                  onClick={(event) => {
                                    // 셀 클릭(편집 진입)으로 번지지 않게 하고, 누른 뒤 포커스는 그 셀로.
                                    event.stopPropagation();
                                    const cell = event.currentTarget.closest("td");
                                    action.onClick();
                                    cell?.focus();
                                  }}
                                >
                                  {action.label}
                                </button>
                              </Fragment>
                            ))}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
                {p2Values.length > 0 ? (
                  <tr
                    className={styles.collapsedRow}
                    aria-hidden={onRowTap ? undefined : "true"}
                  >
                    {onRowTap ? (
                      <td
                        colSpan={columns.length}
                        className={styles.collapsedCell}
                        role="button"
                        tabIndex={0}
                        aria-label={`${rowId} 상세 보기`}
                        onClick={() => onRowTap(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowTap(row);
                          }
                        }}
                      >
                        {p2Values.map((value, index) => (
                          <span key={index}>{index > 0 ? " · " : ""}{value}</span>
                        ))}
                      </td>
                    ) : (
                      <td colSpan={columns.length} className={styles.collapsedCell}>
                        {p2Values.map((value, index) => (
                          <span key={index}>{index > 0 ? " · " : ""}{value}</span>
                        ))}
                      </td>
                    )}
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      ))}
      {footer ? <tfoot aria-live="polite">{footer}</tfoot> : null}
    </table>
  );
}
