"use client";

import { Fragment, useState, type ReactNode } from "react";
import styles from "./Table.module.css";
import type { CellEditability, TableColumn } from "./types";

// SYSTEM.md §7-3 + 보강 (가)~(아) — 편집/읽기 겸용 표의 첫 형태(D-61).
// **렌더 형태는 서버가 보낸 셀 편집 가능성에서 파생된다 — 모드를 켜고 끄는
// prop이 없다**(가). 편집은 한 칸 클릭/Enter 진입 + Esc 되돌리기 + dirty
// 표시 + 화면 1차 「일괄 저장」까지만(04-04가 방향키 로빙·범위 선택·
// 붙여넣기·충돌 렌더·미저장 복원을 더한다).
export type TableProps<Row> = {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  groupBy?: (row: Row) => string;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  footer?: ReactNode;
  onCellCommit?: (rowId: string, columnKey: string, value: string) => void;
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
}: TableProps<Row>) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);

  // (가) — 편집 가능한 셀이 하나라도 있으면 role="grid" + --g-100 머리글,
  // 하나도 없으면 <table> + 시각적으로 숨긴 <caption> + 흰 머리글.
  const hasEditableCell = rows.some((row) =>
    columns.some((column) => (column.editability?.(row) ?? "readonly") === "edit"),
  );

  if (rows.length === 0) {
    return (
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <tbody>
          <tr>
            <td className={styles.emptyCell}>
              <span>{emptyMessage ?? "데이터가 없습니다"}</span>
              {emptyAction ? (
                <button type="button" className={styles.emptyAction} onClick={emptyAction.onClick}>
                  {emptyAction.label}
                </button>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  const groups = groupRows(rows, groupBy);

  function cellEditability(column: TableColumn<Row>, row: Row): CellEditability {
    return column.editability?.(row) ?? "readonly";
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

  return (
    <table
      className={[styles.table, hasEditableCell ? styles.editable : styles.readonly].join(" ")}
      role={hasEditableCell ? "grid" : undefined}
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
                  {columns.map((column) => {
                    const editability = cellEditability(column, row);
                    const isEditableColumn = editability === "edit";
                    return (
                      <td
                        key={column.key}
                        role={hasEditableCell ? "gridcell" : undefined}
                        aria-readonly={hasEditableCell ? editability !== "edit" : undefined}
                        tabIndex={hasEditableCell && isEditableColumn ? 0 : undefined}
                        className={[
                          styles.cell,
                          styles[`prio-${column.priority}`],
                          column.align === "right" ? styles.alignRight : "",
                          isEditableColumn ? styles.editableCell : "",
                          editability === "locked" ? styles.lockedCell : "",
                        ].join(" ")}
                        onClick={() => {
                          if (isEditableColumn && column.editCell) setActiveCell({ rowId, columnKey: column.key });
                        }}
                        onKeyDown={(event) => {
                          if ((event.key === "Enter" || event.key === " ") && isEditableColumn && column.editCell) {
                            event.preventDefault();
                            setActiveCell({ rowId, columnKey: column.key });
                          }
                        }}
                      >
                        {renderCell(column, row)}
                      </td>
                    );
                  })}
                </tr>
                {p2Values.length > 0 ? (
                  <tr className={styles.collapsedRow} aria-hidden="true">
                    <td colSpan={columns.length} className={styles.collapsedCell}>
                      {p2Values.map((value, index) => (
                        <span key={index}>{index > 0 ? " · " : ""}{value}</span>
                      ))}
                    </td>
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
