import type { ReactNode } from "react";
import styles from "./print-frame.module.css";

// 07.4-01 D-7411: 제목 · 번호 줄(+ 상태 글자) · 2px 괘선. 번호가 없으면 상태 글자만, 둘 다 없으면 줄이 없다.
export function PrintTitle({ title, number, statusText, aside }: { title: string; number?: string | null; statusText?: string | null; aside?: ReactNode }) {
  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {aside ? <span className={styles.aside}>{aside}</span> : null}
      </div>
      {number || statusText ? (
        <p className={styles.sub}>
          {number ? <span className={`${styles.num} ${statusText ? styles.subNum : ""}`}>{number}</span> : null}
          {statusText ? <span className={styles.status}>{statusText}</span> : null}
        </p>
      ) : null}
      <hr className={styles.rule} />
    </>
  );
}
