import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import styles from "./print-frame.module.css";

// 07.4-01: 인쇄 라우트 404 변종(권한 없음 · 없음). 셸 없는 라우트라 인쇄 라우트 바탕 위에 app/not-found.tsx와 같은 꼴로 세운다. 문서 제목은 기본값이다.
export function PrintNotFound() {
  return (
    <main className={styles.root}>
      <DetailScreen title="페이지 찾을 수 없음">
        <ListEmpty message="페이지 없음 또는 이동됨" action={{ label: "첫 화면으로", href: "/" }} tone="error" />
      </DetailScreen>
    </main>
  );
}
