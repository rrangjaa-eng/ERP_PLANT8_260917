import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList } from "@/ui/kv-list/KvList";
import styles from "./settlement.module.css";

// 05-11 §7-7 LOADING(UI-SPEC S10 (나)) — `DetailScreen` 제목 + 읽기 칸 순서의 라벨 · 값 막대 뼈대. 반짝임 · 진행 바 없음, 300ms 지연 표시, 1차 행동 없음.
const LABELS = ["프로젝트", "기간", "담당 PM", "견적가 합", "실행가 합", "기안", "결재선"];

export default function SettlementLoading() {
  return (
    <div className={styles.column}>
      <DetailScreen title="정산 결재">
        <div data-ui="detail-skeleton" className={styles.kvSkeleton} aria-hidden="true">
          <KvList items={LABELS.map((label) => ({ label, value: <span className={styles.kvBar} /> }))} />
        </div>
      </DetailScreen>
    </div>
  );
}
