import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./loading.module.css";

// 04.1-05 §7-7 LOADING — PageHeader + 표 머리글 뼈대 + --surface 행 3개. 반짝임 · 진행 바 없음, 300ms 지연 표시
// (loading.module.css .delayed). 부제는 그리지 않는다(뒤로가기 캐시의 숨긴 폴백과 글자가 겹치지 않게 — projects 선례).
export default function ApprovalsLoading() {
  return (
    <div className={styles.delayed}>
      <PageHeader title="결재" />
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            <th scope="col">문서</th>
            <th scope="col">기안</th>
            <th scope="col">일수</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={4}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
