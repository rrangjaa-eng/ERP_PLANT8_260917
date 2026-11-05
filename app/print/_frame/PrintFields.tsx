import type { ReactNode } from "react";
import styles from "./print-frame.module.css";

export type PrintFieldRow = { label: string; value: ReactNode; breakable?: boolean };

// 07.4-01: 라벨 · 값 dl. 값이 null · "" 이면 「—」. breakable 행(자유 글 — 지출결의 상세 · 연차 비고)만 쪽을 넘어 이어질 수 있다.
export function PrintFields({ rows }: { rows: readonly PrintFieldRow[] }) {
  return (
    <dl className={styles.list}>
      {rows.map((row) => (
        <div key={row.label} className={row.breakable ? `${styles.row} ${styles.rowBreakable}` : styles.row}>
          <dt>{row.label}</dt>
          <dd>{row.value === null || row.value === undefined || row.value === "" ? "—" : row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
