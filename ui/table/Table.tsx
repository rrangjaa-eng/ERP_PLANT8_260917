"use client";

import { Fragment, useState, type ReactNode } from "react";
import { isCtrlCombo } from "@/lib/shortcut";
import styles from "./Table.module.css";
import type { CellEditability, CellIssue, TableColumn } from "./types";
import { useGridKeyboard, type GridPosition } from "./use-grid-keyboard";

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
}: TableProps<Row>) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);

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

  const keyboardState = useGridKeyboard({
    rowCount: flatRows.length,
    colCount: columns.length,
    isEditableCell: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return cellEditability(column, row) === "edit";
    },
    isEditing: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return activeCell?.rowId === getRowId(row) && activeCell.columnKey === column.key;
    },
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
      onSave: () => keyboard?.onSave?.(),
    },
  });

  if (rows.length === 0) {
    return (
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <tbody>
          <tr>
            <td className={styles.emptyCell}>
              <span>{emptyMessage ?? "데이터가 없습니다"}</span>
              {emptyAction ? (
                <button
                  type="button"
                  className={styles.emptyAction}
                  onClick={emptyAction.onClick}
                  onKeyDown={(event) => {
                    // 04-28 — 표시한 kbd(Ctrl+Enter)가 실제로 동작한다(C-07).
                    if (emptyAction.shortcut === "Ctrl+Enter" && isCtrlCombo(event, "Enter")) {
                      event.preventDefault();
                      emptyAction.onClick();
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
      className={[styles.table, hasEditableCell ? styles.editable : styles.readonly].join(" ")}
      role={hasEditableCell ? "grid" : undefined}
      onPaste={enableGridKeyboard ? handleTablePaste : undefined}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={[styles.headerCell, styles[`prio-${column.priority}`], column.align === "right" ? styles.alignRight : ""].join(
                " ",
              )}
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

                    return (
                      <td
                        key={column.key}
                        role={hasEditableCell ? "gridcell" : undefined}
                        aria-readonly={hasEditableCell ? editability !== "edit" : undefined}
                        aria-invalid={issue ? true : undefined}
                        aria-describedby={issueId}
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
                          column.align === "right" ? styles.alignRight : "",
                          isEditableColumn ? styles.editableCell : "",
                          editability === "locked" ? styles.lockedCell : "",
                          issue ? (issue.kind === "conflict" ? styles.conflictCell : styles.errorCell) : "",
                          enableGridKeyboard && keyboardState.isInSelection(pos) ? styles.selectedCell : "",
                          !issue && cellDirty?.(row, column.key) ? styles.dirtyCell : "",
                          cellSaved?.(row, column.key) ? styles.savedTint : "",
                        ].join(" ")}
                        onClick={() => {
                          if (enableGridKeyboard) keyboardState.setFocus(pos);
                          if (isEditableColumn && column.editCell) setActiveCell({ rowId, columnKey: column.key });
                        }}
                        onFocus={() => {
                          if (enableGridKeyboard) keyboardState.setFocus(pos);
                        }}
                        onKeyDown={
                          enableGridKeyboard
                            ? (event) => keyboardState.handleKeyDown(event, pos)
                            : (event) => {
                                if ((event.key === "Enter" || event.key === " ") && isEditableColumn && column.editCell) {
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
                            {issue.actions?.map((action) => (
                              <button key={action.label} type="button" className={styles.issueAction} onClick={action.onClick}>
                                {action.label}
                              </button>
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
