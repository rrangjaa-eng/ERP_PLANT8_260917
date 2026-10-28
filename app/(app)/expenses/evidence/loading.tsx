import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import styles from "./evidence-table.module.css";

// §7-7 LOADING → UI-SPEC S2 「첫 불러오기」 — 제목 + 증빙 목록 표 뼈대(합계 행 포함)만 그린다. 머리글은 표와 같은 낱말이고
// 1차 · 필터 줄 · 끌어 놓기 영역은 그리지 않는다(동작하지 않는 1차 방지). 300ms 지연 표시는 `TableSkeleton`이 한다(리저브 대장 선례).
const COLUMNS = [
  { key: "issuedOn", label: "날짜" },
  { key: "ageDays", label: "며칠째", align: "right" as const, className: styles.nowrapHeader, priority: "p3" as const },
  { key: "counterparty", label: "거래처·가맹점" },
  { key: "supplyKrw", label: "공급가", align: "right" as const },
  { key: "vatKrw", label: "세액", align: "right" as const },
  { key: "totalKrw", label: "합계", align: "right" as const },
  { key: "visibility", label: "공개" },
  { key: "status", label: "상태" },
];

export default function EvidenceLoading() {
  return (
    <ListScreen title="증빙">
      <TableSkeleton columns={COLUMNS} withFooter />
    </ListScreen>
  );
}
