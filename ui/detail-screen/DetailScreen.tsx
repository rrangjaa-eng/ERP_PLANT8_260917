import type { ReactNode } from "react";
import styles from "./DetailScreen.module.css";

// UI-SPEC 「화면 틀 계약」 DetailScreen — 상세 화면 틀(폼 화면은 이 틀 + `Form layout="page"`). 제목·섹션 제목 크기는 이 틀만 정한다.
// 부제 prop은 없다. 컨테이너 폭·좌우 안쪽 여백은 셸 main이 가진다(ListScreen과 같다).
export type DetailScreenProps = {
  title: string;
  /** 제목 옆 상태 배지(`StatusTag`). */
  status?: ReactNode;
  /** 제목 아래 한 줄. */
  meta?: ReactNode;
  /**
   * 오른쪽 행동 묶음. DOM 순서 = 시각 순서 = Tab 순서 — 2차들 먼저, 1차는 마지막(오른쪽 끝). 순서를 뒤집는 CSS는 없다(D4 · SYSTEM §10).
   * 어떤 버튼이 그 화면의 1차인지는 화면이 정한다.
   */
  actions?: { secondary?: ReactNode; primary?: ReactNode };
  /** 네 숫자 줄 — 화면이 `Num`을 넣는다. */
  numbers?: ReactNode;
  children?: ReactNode;
};

function DetailScreenRoot({ title, status, meta, actions, numbers, children }: DetailScreenProps) {
  const hasActions = Boolean(actions?.secondary || actions?.primary);
  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <div className={styles.heading}>
          {/* tabIndex -1 — 패널이 닫힌 뒤 포커스를 받을 자리. 탭 순서에는 넣지 않는다. */}
          <h1 data-ui="screen-title" tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {status}
        </div>
        {hasActions ? (
          <div className={styles.actions}>
            {actions?.secondary}
            {actions?.primary}
          </div>
        ) : null}
      </div>
      {meta ? (
        <p data-ui="screen-meta" className={styles.meta}>
          {meta}
        </p>
      ) : null}
      {numbers ? <div className={styles.numbers}>{numbers}</div> : null}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export const DetailScreen = Object.assign(DetailScreenRoot, { Section });
