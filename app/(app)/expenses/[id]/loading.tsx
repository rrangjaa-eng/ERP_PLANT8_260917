import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList } from "@/ui/kv-list/KvList";
import styles from "./expense.module.css";

// 05-05 §7-7 LOADING — `DetailScreen` 제목 + 읽기 칸 순서의 라벨 · 값 막대 뼈대. 반짝임 · 진행 바 없음, 300ms 지연 표시, 1차 행동 없음.
const LABELS = ["프로젝트", "견적 줄", "거래처", "증빙 종류", "공급가액", "지급 예정일", "지급 방식", "비고", "기안", "결재선"];

export default function ExpenseLoading() {
  return (
    <div className={styles.column}>
      <DetailScreen title="지출결의">
        <div data-ui="detail-skeleton" className={styles.kvSkeleton} aria-hidden="true">
          <KvList items={LABELS.map((label) => ({ label, value: <span className={styles.kvBar} /> }))} />
        </div>
      </DetailScreen>
    </div>
  );
}
