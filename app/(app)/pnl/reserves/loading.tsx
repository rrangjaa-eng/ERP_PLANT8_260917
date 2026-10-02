// 04.6 스킨 A 이관 전: 화면 틀
/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./reserves.module.css";

// §7-7 LOADING — 머리글 + 합계 자리 + `--surface` 행 3개, 반짝임 없음. 첫 진입에서만 보인다 — 쪽 이동은 next/link
// 클라이언트 이동이라 새 쪽이 올 때까지 지금 쪽이 그대로 보인다(S12 loading). 제목만 렌더한다(projects/loading.tsx 선례).
export default function ReservesLoading() {
  return (
    <>
      <PageHeader title="리저브 대장" />
      <table className={styles.skeleton} aria-hidden="true">
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">구분</th>
            <th scope="col">금액</th>
            <th scope="col">잔액</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={4}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className={styles.footerCell}>
              &nbsp;
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
