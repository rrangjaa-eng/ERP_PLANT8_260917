import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList } from "@/ui/kv-list/KvList";
import styles from "../leave.module.css";

// 04.1-05 §7-7 LOADING → UI-SPEC loading — `DetailScreen` 제목 + 라벨 칸 · 값 줄 뼈대(`KvList` 모양). 반짝임 · 진행 바 없음,
// 300ms 지연 표시(빨리 끝나는 스트리밍에서는 보이지 않는다). 1차 행동은 그리지 않는다.
const LABELS = ["종류", "기간", "비고", "잔고", "기안", "결재선"];

export default function LeaveDocumentLoading() {
  return (
    <DetailScreen title="연차">
      <div data-ui="detail-skeleton" className={styles.kvSkeleton} aria-hidden="true">
        <KvList items={LABELS.map((label) => ({ label, value: <span className={styles.kvBar} /> }))} />
      </div>
    </DetailScreen>
  );
}
