import { Button } from "@/ui/button/Button";
import { StatusTag, type StatusTagKind } from "@/ui/status-tag/StatusTag";
import type { NextTurnTag, NextTurnView } from "./build-next-turn-view";
import styles from "./NextTurn.module.css";

// SYSTEM.md §7-4 「내 차례」 블록. Task 1(build-next-turn-view.ts)의 계산 결과를
// 그대로 그린다 — 이 컴포넌트 안에서 정렬·절단을 다시 하지 않는다(호출부가 이미
// 끝낸 계산을 다시 하면 D-24가 고정한 계약이 두 곳에서 어긋날 수 있다).
export type NextTurnProps = {
  view: NextTurnView;
};

// §7-4: 태그 순서 고정(막힘 → 오늘 → 결재 → 대기)의 색 대응 — 막힘 danger,
// 오늘 warning, 결재·대기 둘 다 accent(문서 원문 그대로, §7-5의 일반 규칙이 아니라
// 이 블록 전용 색 대응이다).
const TAG_KIND: Record<NextTurnTag, StatusTagKind> = {
  막힘: "danger",
  오늘: "warning",
  결재: "accent",
  대기: "accent",
};

export function NextTurn({ view }: NextTurnProps) {
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
              <StatusTag kind={TAG_KIND[item.tag]}>{item.tag}</StatusTag>
            </span>
            <span className={styles.grow}>
              {item.label}
              <span className={styles.why}> · {item.reason}</span>
            </span>
            <span className={styles.amt}>{item.amount.toLocaleString("ko-KR")}</span>
            <span className={styles.action}>
              <Button type="button" variant="tertiary">
                {item.action.label}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {view.overflowCount > 0 ? (
        <div className={styles.more}>
          <Button type="button" variant="tertiary">
            더 보기 {view.overflowCount}건
          </Button>
        </div>
      ) : null}
    </section>
  );
}
