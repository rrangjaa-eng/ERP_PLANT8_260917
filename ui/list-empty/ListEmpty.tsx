import styles from "./ListEmpty.module.css";

// SYSTEM.md §7-7 EMPTY 행 + §6-1 목록 EMPTY. 한 줄 「무엇이 없다 · 다음 한 수」다.
// 그림·일러스트·아이콘 없음, 안내 문구 없음(§8 규칙 5).
//
// 같은 컴포넌트가 오류 톤으로도 쓰인다(02-06의 오류 페이지). 톤이 오류면 색만
// --danger로 바뀌고 구조는 같다(§7-7 ERROR 행: 한 줄 + 2차 버튼) — EMPTY는 3차
// 버튼(§7-7 EMPTY 행)이다.
export type ListEmptyTone = "empty" | "error";

// 02-06: 다음 한 수가 화면 이동이면 href(<a>), 재시도처럼 이동이 아니면 onClick
// (<button>)다(§10 — 3차 버튼은 <button>, 페이지 이동이면 <a>). 오류 경계
// (app/(app)/error.tsx)의 "다시 시도"가 onClick 갈래를 쓴다.
export type ListEmptyAction = { label: string; href: string } | { label: string; onClick: () => void };

export type ListEmptyProps = {
  /** 「무엇이 없다」 부분. */
  message: string;
  /**
   * 「다음 한 수」— 기본은 필수(§8 규칙 5, 원인만 쓰고 끝내는 EMPTY를 막는다).
   * **예외:** 03-07(보관함) — 보관함이 비어 있는 것은 해소할 상태가 아니라
   * 정상이라 다음 한 수를 두지 않는다(§7-12 알림함 EMPTY 예외와 같은 논리,
   * `DECISIONS.md` 참고). 그런 화면만 명시적으로 `action`을 생략한다 — 잊고
   * 안 넣은 것과 구분하기 위해 `action?: undefined`가 아니라 유니언으로 연다.
   */
  action?: ListEmptyAction;
  tone?: ListEmptyTone;
};

export function ListEmpty({ message, action, tone = "empty" }: ListEmptyProps) {
  const isError = tone === "error";
  const actionClassName = isError ? styles.secondary : styles.tertiary;

  return (
    <p className={[styles.row, isError ? styles.error : styles.empty].join(" ")}>
      <span className={styles.message}>{message}</span>
      {action && "href" in action ? (
        <a href={action.href} className={actionClassName}>
          {action.label}
        </a>
      ) : action ? (
        <button type="button" onClick={action.onClick} className={actionClassName}>
          {action.label}
        </button>
      ) : null}
    </p>
  );
}
