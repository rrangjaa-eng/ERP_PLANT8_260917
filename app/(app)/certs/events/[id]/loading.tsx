import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./event-detail.module.css";

// 04.3-04 Task 4 ④-b — I3 §7-7 표 뼈대(머리글 · --surface 3행 · 합계 자리), 스피너 없음. 제목은 아직 모르므로
// 제목 자리만(부제 없음 — app/(app)/projects/loading.tsx 선례의 이유). QR 자리는 그리지 않는다(없는 것을 있는 척하지 않는다).
const HEADERS = ["이름", "전화번호", "경품명", "수량", "전달", "구별 표시", "수령자 화면", "제출"];

export default function CertEventDetailLoading() {
  return (
    <div aria-hidden="true">
      <PageHeader title={"\u00a0"} />
      <section className={styles.section}>
        <p className={styles.sectionLabel}>당첨자</p>
        <table className={styles.skeletonTable}>
          <caption className="sr-only">당첨자</caption>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((index) => (
              <tr key={index} className={styles.skeletonRow}>
                <td colSpan={HEADERS.length}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.skeletonFooter}>
              <td colSpan={HEADERS.length}>&nbsp;</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
