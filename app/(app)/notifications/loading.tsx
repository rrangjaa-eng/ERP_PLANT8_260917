import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./inbox-list.module.css";

// §7-7 LOADING — projects/loading.tsx 선례(반짝임·스피너 없음, 300ms 안에
// 스트리밍이 끝나면 실제 내용으로 바로 교체돼 이 자리가 눈에 띄지 않는다).
export default function NotificationsLoading() {
  return (
    <>
      <PageHeader title="알림함" />
      <table className={styles.table} aria-hidden="true">
        <caption className="sr-only">알림함</caption>
        <thead>
          <tr>
            <th scope="col">내용</th>
            <th scope="col">시각</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={2}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
