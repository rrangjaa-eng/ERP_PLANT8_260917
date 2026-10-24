import styles from "./vendors.module.css";

// 07-23 SC-17 ⑩ · V9: 수정 패널 맨 아래 `계좌 변경 기록` — 읽기 목록(일시 · 변경한 사람 · `····1234 → ····5678`), 최신 위.
// SYSTEM §7-14 HistoryList는 「새 이력 추가」가 붙은 편집 목록이라 쓰지 않는다 — 읽기 줄만 같은 순서로 그린다. 원값은 화면에 오지 않는다(뒤 4자리만).
export type AccountHistoryItem = { id: string; changedAt: string; changedByName: string; beforeLast4: string | null; afterLast4: string | null };

function last4Text(value: string | null): string {
  return value ? `····${value}` : "—";
}

export function AccountHistory({ items }: { items: AccountHistoryItem[] }) {
  return (
    <section className={styles.panelSection} aria-labelledby="vendor-account-history">
      <h3 id="vendor-account-history" className={styles.panelSectionTitle}>
        계좌 변경 기록
      </h3>
      {items.length === 0 ? (
        <p className={styles.historyEmpty}>이력 없음</p>
      ) : (
        <ul className={styles.historyList}>
          {items.map((item) => (
            <li key={item.id} className={styles.historyRow}>
              <span className={styles.historyAt}>{item.changedAt}</span>
              <span>{item.changedByName}</span>
              <span className={styles.historyValue}>
                {last4Text(item.beforeLast4)} → {last4Text(item.afterLast4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
