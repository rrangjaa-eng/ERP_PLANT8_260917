// 04.6 스킨 A 이관 전: 화면 틀
/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "@/app/(app)/approvals/loading.module.css";

// 04.1-06 §7-7 LOADING(S1) — PageHeader + 표 머리글 뼈대 + --surface 행 3개. 반짝임 · 진행 바 없음, 300ms 지연 표시
// (04.1-05 결재함 로딩과 같은 CSS 모듈 — Codex LOW). 부제는 그리지 않는다(연도는 서버가 정한 뒤에만 안다).
export default function LeaveListLoading() {
  return (
    <div className={styles.delayed}>
      <PageHeader title="연차" />
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            <th scope="col">종류 · 기간</th>
            <th scope="col">일수</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={3}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
