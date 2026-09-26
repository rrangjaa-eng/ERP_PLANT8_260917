import type { ProjectListTotals } from "@/domain/projects";
import { formatKrw, formatPercent } from "@/lib/format-number";
import styles from "./projects.module.css";

// 04-17(D-88 · UI-SPEC S1 합계 줄) — 필터 줄 바로 아래 한 줄: 제목 `합계 (…)` + 받은 금액 쌍(<dl>) + 오른쪽 제외 문구.
// 서버가 보내지 않은 금액은 라벨째 그리지 않는다(C-14 — 키 부재).
export function ListTotals({ totals }: { totals: ProjectListTotals }) {
  const pairs: { label: string; value: string }[] = [];
  if (totals.revenueKrw !== undefined) pairs.push({ label: "매출", value: formatKrw(totals.revenueKrw) });
  if (totals.quoteAmountKrw !== undefined) pairs.push({ label: "견적", value: formatKrw(totals.quoteAmountKrw) });
  if (totals.executionAmountKrw !== undefined) pairs.push({ label: "실행가", value: formatKrw(totals.executionAmountKrw) });
  if (totals.profitKrw !== undefined) pairs.push({ label: "수익금", value: formatKrw(totals.profitKrw) });
  if (totals.profitRate !== undefined) {
    pairs.push({ label: "수익률", value: formatPercent(totals.profitRate === null ? null : totals.profitRate * 100) });
  }

  return (
    <section aria-label="합계" className={styles.totals}>
      <p className={styles.totalsTitle}>{totals.title}</p>
      {pairs.length > 0 ? (
        <dl className={styles.totalsPairs}>
          {pairs.map((pair) => (
            <div key={pair.label} className={styles.totalsPair}>
              <dt>{pair.label}</dt>
              <dd>{pair.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {totals.exclusionText ? <p className={styles.totalsExclusion}>{totals.exclusionText}</p> : null}
    </section>
  );
}
