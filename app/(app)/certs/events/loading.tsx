// 04.6 스킨 A 이관 전: 화면 틀
/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./events.module.css";

// 04.3-04 Task 3 ①-b — §7-7 LOADING 표 뼈대(머리글 + --surface 3행 + 합계 자리), 스피너 · 반짝임 없음.
// app/(app)/projects/loading.tsx 선례 그대로 — 부제는 렌더하지 않는다(뒤로 가기 캐시가 숨겨 둔 폴백과
// 실제 제목 · 부제가 겹쳐 getByText가 두 요소에 걸린다, 그 파일의 [Rule 1] 주석).
export default function CertEventsLoading() {
  return (
    <>
      <PageHeader title="확인증 행사" />
      <table className={styles.skeletonTable} aria-hidden="true">
        <caption className="sr-only">확인증 행사</caption>
        <thead>
          <tr>
            <th scope="col">행사</th>
            <th scope="col">당첨일</th>
            <th scope="col">담당</th>
            <th scope="col">제출</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={5}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.skeletonFooter}>
            <td colSpan={5}>&nbsp;</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
