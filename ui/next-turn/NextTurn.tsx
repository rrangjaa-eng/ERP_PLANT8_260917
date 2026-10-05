import type { ReactNode } from "react";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Num } from "@/ui/num/Num";
import type { NextTurnView } from "./build-next-turn-view";
import styles from "./NextTurn.module.css";

// SYSTEM.md §7-4 「내 차례」 블록. Task 1(build-next-turn-view.ts)의 계산 결과를
// 그대로 그린다 — 이 컴포넌트 안에서 정렬·절단을 다시 하지 않는다(호출부가 이미
// 끝낸 계산을 다시 하면 D-24가 고정한 계약이 두 곳에서 어긋날 수 있다).
export type NextTurnProps = {
  view: NextTurnView;
  /**
   * 「더 보기 N건」이 갈 곳. WR-04: 없으면 남은 건수를 글자로만 보인다 —
   * 아무 데도 가지 않는 버튼을 그리지 않는다. 실제 목록 화면이 생기는
   * Phase 4부터 호출부가 넘긴다.
   */
  moreHref?: string;
  /** 05-10: 항목 key에 있으면 기본 링크 대신 이 노드를 그린다(서버가 만든 행 행동 — `ui/`는 `app/` 액션을 import하지 않는다). */
  actionSlots?: Record<string, ReactNode>;
};

/** 행 대상 글자 요소 id — 행 행동의 `aria-describedby`가 가리킨다. */
export function nextTurnLabelId(key: string): string {
  return `next-turn-label-${key}`;
}

export function NextTurn({ view, moreHref, actionSlots }: NextTurnProps) {
  if (!view.visible) {
    // §7-4: 항목이 0이면 블록 자체가 사라진다. 빈 상태 문구를 대신 넣지 않는다.
    return null;
  }

  const total = view.items.length + view.overflowCount;

  return (
    <section className={styles.next}>
      <h2 className={styles.heading}>내 차례 {total}</h2>
      <ul className={styles.list}>
        {view.items.map((item, index) => (
          <li key={index} className={styles.item}>
            <span className={styles.tagSlot}>
              <StatusTag status={item.tag} />
            </span>
            <span className={styles.grow}>
              {/* 대상은 자기 span을 가진다 — 폰(§7-4 두 줄)에서 .grow가 display:contents로
                  풀리면 대상과 이유가 각자 그리드 칸에 놓여야 하기 때문이다. */}
              <span className={styles.label} id={item.key ? nextTurnLabelId(item.key) : undefined}>
                {item.label}
              </span>
              {item.reason ? <span className={styles.why}> · {item.reason}</span> : null}
            </span>
            <span className={styles.amt}>
              <Num value={item.measureText ?? item.amount} />
            </span>
            <span className={styles.action}>
              {item.key && actionSlots?.[item.key] ? (
                actionSlots[item.key]
              ) : (
                // WR-04: §10 — 페이지 이동은 <a>다. ListEmpty의 3차 링크와 같은 모양.
                <a href={item.action.href} className={styles.tertiary}>
                  {item.action.label}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      {view.overflowCount > 0 ? (
        <div className={styles.more}>
          {moreHref ? (
            <a href={moreHref} className={styles.tertiary}>
              더 보기 {view.overflowCount}건
            </a>
          ) : (
            // 갈 곳을 못 받았으면 건수만 알린다 — 죽은 버튼을 그리느니 글자가 낫다.
            <span className={styles.moreText}>더 보기 {view.overflowCount}건</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
