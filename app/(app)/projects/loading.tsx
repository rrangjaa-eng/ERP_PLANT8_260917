import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./projects.module.css";

// §7-7 LOADING — 머리글·합계 행 뼈대 + `--surface` 행 3개, 반짝임 없음.
// `loading.tsx`는 Next.js가 이 라우트 세그먼트를 자동으로 Suspense로
// 감싸는 규약이라 데이터 패치 동안 이 파일이 즉시 보인다 — 300ms 안에
// 스트리밍이 끝나면 실제 내용으로 바로 교체돼 이 자리가 눈에 띄지
// 않는다(지연 표시는 브라우저·Next 스트리밍이 사실상 담당).
//
// [Rule 1 - 버그, 실행 중 발견] 부제("진행 중인 프로젝트 원장")를 실제
// page.tsx와 똑같이 렌더하면 Next.js가 뒤로가기 캐시용으로 이전 Suspense
// 폴백을 DOM에 숨겨 남겨 두는 동작과 겹쳐 `getByText(subtitle)`이 두
// 요소에 걸린다(`test/e2e/page-chrome.spec.ts` strict mode violation,
// 실측). 제목만 남기고 부제는 렌더하지 않는다 — 뼈대의 목적(레이아웃
// 밀림 방지)은 제목만으로도 충분하다.
export default function ProjectsLoading() {
  return (
    <>
      <PageHeader title="프로젝트" />
      <table className={styles.table} aria-hidden="true">
        <caption className="sr-only">프로젝트</caption>
        <thead>
          <tr>
            <th scope="col">번호</th>
            <th scope="col">프로젝트명</th>
            <th scope="col">담당 PM</th>
            <th scope="col">기간</th>
            <th scope="col">견적</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((index) => (
            <tr key={index} className={styles.skeletonRow}>
              <td colSpan={6}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className={styles.footerCell}>
              &nbsp;
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
