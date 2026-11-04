import type { ApprovalBoxes } from "./approval-boxes";
import styles from "./print-frame.module.css";

// 07.4-01 D-7410: 동적 칸 결재란 — 칸마다 data-state. 직인 · 서명 이미지 · 도장 칸 없음(D-7403): 처리자 이름 + 처리 일시가 서명 역할이다.
export function PrintApproval({ boxes, columns, rejectReason }: ApprovalBoxes) {
  return (
    <section className={styles.approval}>
      <h2 className={styles.section}>결재</h2>
      <div className={styles.boxes} data-cols={columns}>
        {boxes.map((box, index) => (
          <div key={`${index}-${box.label}`} className={styles.box} data-state={box.dataState}>
            <span className={styles.boxLabel}>{box.label}</span>
            <span className={styles.boxName} data-empty={box.name === "—" ? "" : undefined}>
              {box.name}
            </span>
            <span className={styles.boxState}>{box.stateText}</span>
            {box.at ?? box.dataState === "draft" ? <span className={`${styles.boxAt} ${styles.num}`}>{box.at ?? "—"}</span> : null}
          </div>
        ))}
      </div>
      {rejectReason ? (
        <p className={styles.rejectReason}>
          <b>반려 사유</b>
          {rejectReason}
        </p>
      ) : null}
    </section>
  );
}
