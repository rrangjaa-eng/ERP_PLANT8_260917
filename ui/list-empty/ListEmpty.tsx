import Link from "next/link";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 2차 클래스를 직접 쓴다(ListScreen 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import styles from "./ListEmpty.module.css";
import actionStyles from "./ListEmptyAction.module.css";

// SYSTEM.md §7-7 EMPTY 행 + §6-1 목록 EMPTY. 한 줄 「무엇이 없다 · 다음 한 수」다.
// 그림·일러스트·아이콘 없음, 안내 문구 없음(§8 규칙 5).
//
// 04.6-05(SC 10) — 넘겨받은 첫 행동 하나를 2차 버튼 모양으로 그린다(`href`면 `next/link` `scroll={false}`).
// 빈 목록이면 머리 1차가 숨고(04.6-04 ListScreen) 이 버튼 하나가 같은 등록 행동을 맡는다(DR5 A) — 호출부가 `action`으로 넘긴다.
// 같은 컴포넌트가 오류 톤으로도 쓰인다(02-06의 오류 페이지). 톤이 오류면 글자 색만 바뀌고 구조는 같다(§7-7 ERROR 행).
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
  const actionClassName = [buttonStyles.btn, buttonStyles.secondary, actionStyles.action].join(" ");

  // data-ui 훅은 바깥 div에 둔다 — 안쪽 `<p class>` 한 줄 마크업은 사람 목록 단위 테스트(people-list-hidden-id)가 읽는다.
  return (
    <div data-ui="empty-state">
      <p className={[styles.row, isError ? styles.error : styles.empty].join(" ")}>
        <span className={styles.message}>{message}</span>
        {action && "href" in action ? (
          <Link href={action.href} scroll={false} className={actionClassName}>
            {action.label}
          </Link>
        ) : action ? (
          <button type="button" onClick={action.onClick} className={actionClassName}>
            {action.label}
          </button>
        ) : null}
      </p>
    </div>
  );
}
