import styles from "./ListEmpty.module.css";

// SYSTEM.md §7-7 EMPTY 행 + §6-1 목록 EMPTY. 한 줄 「무엇이 없다 · 다음 한 수」다.
// 그림·일러스트·아이콘 없음, 안내 문구 없음(§8 규칙 5).
//
// 같은 컴포넌트가 오류 톤으로도 쓰인다(02-06의 오류 페이지). 톤이 오류면 색만
// --danger로 바뀌고 구조는 같다(§7-7 ERROR 행: 한 줄 + 2차 버튼) — EMPTY는 3차
// 버튼(§7-7 EMPTY 행)이다.
export type ListEmptyTone = "empty" | "error";

export type ListEmptyAction = {
  label: string;
  href: string;
};

export type ListEmptyProps = {
  /** 「무엇이 없다」 부분. */
  message: string;
  /**
   * 「다음 한 수」— 필수(§8 규칙 5). 원인만 쓰고 끝내는 EMPTY를 타입으로 막는다
   * (다음 한 수 없이 원인만 렌더할 수 없다).
   */
  action: ListEmptyAction;
  tone?: ListEmptyTone;
};

export function ListEmpty({ message, action, tone = "empty" }: ListEmptyProps) {
  const isError = tone === "error";

  return (
    <p className={[styles.row, isError ? styles.error : styles.empty].join(" ")}>
      <span className={styles.message}>{message}</span>
      <a href={action.href} className={isError ? styles.secondary : styles.tertiary}>
        {action.label}
      </a>
    </p>
  );
}
