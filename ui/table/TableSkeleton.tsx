import tableStyles from "./Table.module.css";
import styles from "./TableSkeleton.module.css";
import type { ColumnPriority } from "./types";

// UI-SPEC 「공용 컴포넌트 계약」 TableSkeleton(SC 10) — 라우트 loading.tsx가 쓰는 표 모양 뼈대. 받은 진짜 열 이름을 머리글로,
// `--surface-muted` 행 3개(편집 표는 합계 줄 뼈대), 애니메이션 없이 300ms 지연 표시(빨리 끝나는 스트리밍에서는 보이지 않는다).
// 표 면 · 머리글 클래스는 Table.module.css와 같다. 훅 · 지시문이 없는 서버 컴포넌트다.
export type TableSkeletonProps = {
  // className: 로드 뒤 `Table` 열의 `headerClassName`과 같은 값을 주면 머리글 폭이 앞뒤로 같다.
  /** priority — 표(Table)와 같은 prio 클래스로 폰에서 같은 열을 숨긴다(안 주면 모든 폭에서 보인다). */
  columns: { key: string; label: string; align?: "left" | "right"; className?: string; priority?: ColumnPriority }[];
  /** 편집 표 — 합계 줄 뼈대를 더한다. */
  withFooter?: boolean;
};

const SKELETON_ROWS = [0, 1, 2];

export function TableSkeleton({ columns, withFooter = false }: TableSkeletonProps) {
  return (
    <div data-ui="table-skeleton" className={styles.delayed} aria-hidden="true">
      <table className={tableStyles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  tableStyles.headerCell,
                  column.priority ? tableStyles[`prio-${column.priority}`] : "",
                  column.align === "right" ? tableStyles.alignRight : "",
                  column.className ?? "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SKELETON_ROWS.map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={columns.length}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        {withFooter ? (
          <tfoot>
            <tr className={styles.footerRow}>
              <td colSpan={columns.length}>&nbsp;</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
