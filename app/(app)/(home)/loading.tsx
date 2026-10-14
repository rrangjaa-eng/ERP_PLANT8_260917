import { ListScreen } from "@/ui/list-screen/ListScreen";
import styles from "./loading.module.css";

// 06-24 backstop B-4(06-23 O-2) — 홈 §7-7 LOADING(내 차례: 제목 줄만 + `--surface-muted` 행 2개). 라우트 loading.tsx라 링크 미리 가져오기가
// 이 뼈대를 먼저 받아 느린 응답에서도 이동이 곧바로 서고, 300ms 안에 끝나면 보이지 않는다(`loading.module.css`의 지연 표시).
// 홈만 감싸려고 `(home)` 그룹에 둔다 — `app/(app)/loading.tsx`는 loading.tsx가 없는 모든 하위 화면에 번진다. 버튼은 그리지 않는다.
export default function HomeLoading() {
  return (
    <ListScreen title="내 차례">
      <div data-ui="home-skeleton" className={styles.delayed} aria-busy="true">
        <div data-ui="home-skeleton-row" className={styles.row} />
        <div data-ui="home-skeleton-row" className={styles.row} />
      </div>
    </ListScreen>
  );
}
