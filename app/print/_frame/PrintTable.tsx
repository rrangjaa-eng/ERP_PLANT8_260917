import type { ReactNode } from "react";
import styles from "./print-frame.module.css";

// 07.4-01: 실제 table · thead 구조 — 쪽마다 머리가 반복된다(div 표는 반복되지 않는다, RESEARCH Pitfall 4). app/print/**에서만 <table>을 쓴다(DECISIONS).
// caption은 읽기 표의 이름(시각적으로 숨김). 폭은 CSS module의 폭 클래스 — 인라인 style 없음.
// 07.2-10: 고객 견적서가 14 · 18 · 26mm를 더했다.
export type PrintTableWidth = "8mm" | "14mm" | "18mm" | "20mm" | "22mm" | "26mm" | "28mm" | "30mm" | "36mm" | "40mm";
// hideLabel: 머리 글자를 화면 · 인쇄에서 감추고 판독기에만 남긴다(번호 열처럼 머리 글자가 없는 열).
// wrapLabel: 그 열 머리 글자만 줄바꿈을 허용한다(긴 머리 글자가 열을 밀지 않게).
export type PrintTableColumn = { label: string; width?: PrintTableWidth; align?: "end"; hideLabel?: boolean; wrapLabel?: boolean };
export type PrintTableCell = ReactNode | { span: number; content: ReactNode };
// variant: 묶음 머리 · 소계 · 합계 행 모양(없으면 tr에 class를 붙이지 않는다 — 07.4 마크업 그대로).
export type PrintTableRowVariant = "group" | "subgroup" | "sum" | "grand";
export type PrintTableRow = { key: string; cells: PrintTableCell[]; variant?: PrintTableRowVariant };

const WIDTH_CLASS: Record<PrintTableWidth, string> = {
  "8mm": styles.w8 ?? "",
  "14mm": styles.w14 ?? "",
  "18mm": styles.w18 ?? "",
  "20mm": styles.w20 ?? "",
  "22mm": styles.w22 ?? "",
  "26mm": styles.w26 ?? "",
  "28mm": styles.w28 ?? "",
  "30mm": styles.w30 ?? "",
  "36mm": styles.w36 ?? "",
  "40mm": styles.w40 ?? "",
};

const VARIANT_CLASS: Record<PrintTableRowVariant, string> = {
  group: styles.groupRow ?? "",
  subgroup: styles.subgroupRow ?? "",
  sum: styles.sumRow ?? "",
  grand: styles.grandRow ?? "",
};

function isSpanCell(cell: PrintTableCell): cell is { span: number; content: ReactNode } {
  return typeof cell === "object" && cell !== null && "span" in cell && "content" in cell;
}

export function PrintTable({ caption, columns, rows, foot }: { caption: string; columns: readonly PrintTableColumn[]; rows: readonly PrintTableRow[]; foot?: ReactNode }) {
  if (rows.length === 0) return <p>—</p>;
  const classOf = (column: PrintTableColumn | undefined) => [column?.align === "end" ? styles.end : "", column?.width ? WIDTH_CLASS[column.width] : ""].filter(Boolean).join(" ") || undefined;
  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>{caption}</caption>
      <colgroup>
        {columns.map((column) => (
          <col key={column.label} className={column.width ? WIDTH_CLASS[column.width] : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label} scope="col" className={[classOf(column), column.wrapLabel ? styles.wrapLabel : ""].filter(Boolean).join(" ") || undefined}>
              {column.hideLabel ? <span className={styles.srOnly}>{column.label}</span> : column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          let index = 0;
          return (
            <tr key={row.key} className={row.variant ? VARIANT_CLASS[row.variant] : undefined}>
              {row.cells.map((cell) => {
                const span = isSpanCell(cell) ? cell.span : 1;
                const column = columns[index];
                index += span;
                return (
                  <td key={index} colSpan={span > 1 ? span : undefined} className={classOf(isSpanCell(cell) ? columns[index - 1] : column)}>
                    {isSpanCell(cell) ? cell.content : cell}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      {foot ? <tfoot>{foot}</tfoot> : null}
    </table>
  );
}
