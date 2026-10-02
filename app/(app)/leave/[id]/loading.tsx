// 04.6 스킨 A 이관 전: 화면 틀
import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "@/app/(app)/approvals/loading.module.css";

// 04.1-05 §7-7 LOADING — PageHeader + KvList 뼈대(라벨 칸 + --surface 값 줄, UI-SPEC loading S3). 반짝임 ·
// 진행 바 없음, 300ms 지연 표시(결재함 로딩과 같은 CSS 모듈).
const LABELS = ["종류", "기간", "비고", "잔고", "기안", "결재선"];

export default function LeaveDocumentLoading() {
  return (
    <div className={styles.delayed}>
      <PageHeader title="연차" />
      <dl className={styles.kv} aria-hidden="true">
        {LABELS.map((label) => (
          <div key={label} className={styles.kvPair}>
            <dt>{label}</dt>
            <dd />
          </div>
        ))}
      </dl>
    </div>
  );
}
