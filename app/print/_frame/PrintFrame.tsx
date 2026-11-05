import type { ReactNode } from "react";
import styles from "./print-frame.module.css";

// 07.4-01 D-7404: 공용 인쇄 틀 — 서류 내용을 모른다(화면 바와 자식만 받는다). 본문이 모두 서버 렌더라 data-ready를 처음부터 붙인다.
export function PrintFrame({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  return (
    <main className={styles.root} data-ready="">
      {bar}
      <article className={styles.sheet}>{children}</article>
    </main>
  );
}
