import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./event-detail.module.css";

// 04.3-04 Task 4 ④-b · 04.3-15 · 04.3-10 — I′3 LOADING. 제목은 아직 모르므로 제목 자리만(부제 없음 — app/(app)/projects/loading.tsx
// 선례의 이유) + 경품 표 뼈대(§7-7 — 머리글 + --surface 3행 + 합계 자리, 반짝임 없음).
export default function CertEventDetailLoading() {
  return (
    <div aria-hidden="true">
      <PageHeader title={" "} />
      <table className={styles.skeletonTable}>
        <thead>
          <tr>
            <th>경품명</th>
            <th>전달</th>
            <th>당첨 수</th>
            <th>제출</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i} className={styles.skeletonRow}>
              <td colSpan={4} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.skeletonFooter}>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
