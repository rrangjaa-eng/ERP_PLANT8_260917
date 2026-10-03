import { Fragment, type ReactNode } from "react";
import styles from "./Table.module.css";
import type { ColumnPriority } from "./types";

// 서버 페이지의 읽기 전용 표(R1 · 공통 §6) — RSC page.tsx는 클라이언트 `Table`에 함수 prop(`cell` 등)을 넘길 수 없다
// (런타임 「Functions cannot be passed directly to Client Components」). 그래서 이 표는 호출부가 서버에서 열 순서대로
// 미리 렌더한 칸 노드(`Num` · `StatusTag` · `RowActions` 등)를 받는다. 함수 prop · 훅 · 지시문이 없는 서버 컴포넌트다.
// 마크업 · 클래스는 `Table`의 읽기 렌더와 같고(Table.module.css 하나), 폰(<700)의 P2 접힌 줄 · P3 숨김은 CSS만 한다.
// 정렬 머리글 · 편집 · 붙여넣기 · 페이지는 없다 — 그런 표는 `Table`이다.
export type StaticTableColumn = {
  key: string;
  header: string;
  priority: ColumnPriority;
  align?: "left" | "right";
  /** 한 열만 — 그 열의 칸이 `<th scope="row" id={row.headerId}>`가 되고 접힌 줄이 그 id를 `headers`로 가리킨다(사람 목록 DR-4). */
  rowHeader?: boolean;
};

export type StaticTableRow = {
  key: string;
  /** 행 머리글 id(호출부가 정한다 — 예 `people-row-0-name`). `rowHeader` 열이 있을 때 쓴다. */
  headerId?: string;
  /** 열 순서대로 미리 렌더한 칸. 가린 열은 호출부가 `columns`에서 빼므로 여기에도 없다. */
  cells: ReactNode[];
  /** 행(과 접힌 줄) 아래 전폭 줄 하나 — 코드표 증빙 종류의 세금 규칙 편집 줄처럼 열에 속하지 않는 세부. 없으면 줄이 없다. */
  detail?: ReactNode;
};

export type StaticTableProps = {
  caption: string;
  columns: StaticTableColumn[];
  rows: StaticTableRow[];
};

function isEmptyCell(value: ReactNode): boolean {
  return value === null || value === undefined || value === false || value === "";
}

function classNames(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function StaticTable({ caption, columns, rows }: StaticTableProps) {
  const hasRowHeader = columns.some((column) => column.rowHeader);
  const p2Indexes = columns.flatMap((column, index) => (column.priority === "p2" ? [index] : []));

  return (
    <table className={styles.table}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={classNames(styles.headerCell, styles[`prio-${column.priority}`], column.align === "right" && styles.alignRight)}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const folded = p2Indexes.flatMap((index) => {
            const value = row.cells[index];
            return value === undefined || isEmptyCell(value) ? [] : [{ column: columns[index], value }];
          });
          return (
            <Fragment key={row.key}>
              <tr>
                {columns.map((column, index) => {
                  const className = classNames(styles.cell, styles[`prio-${column.priority}`], column.align === "right" && styles.alignRight);
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" id={row.headerId} className={className}>
                      {row.cells[index]}
                    </th>
                  ) : (
                    <td key={column.key} className={className}>
                      {row.cells[index]}
                    </td>
                  );
                })}
              </tr>
              {folded.length > 0 ? (
                // P2 값의 유일한 출처(폰에서는 P2 열이 숨는다)라 aria-hidden을 두지 않는다. PC에서는 CSS가 이 줄을 숨겨 중복 낭독이 없다.
                <tr className={styles.collapsedRow}>
                  <td colSpan={columns.length} headers={hasRowHeader ? row.headerId : undefined} className={styles.collapsedCell}>
                    {folded.map(({ column, value }, foldedIndex) => (
                      <Fragment key={column?.key ?? foldedIndex}>
                        {foldedIndex > 0 ? " · " : null}
                        <span className="sr-only">{column?.header} </span>
                        {value}
                      </Fragment>
                    ))}
                  </td>
                </tr>
              ) : null}
              {row.detail !== undefined && row.detail !== null && row.detail !== false ? (
                <tr data-ui="static-table-detail">
                  <td colSpan={columns.length} className={styles.cell}>
                    {row.detail}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
