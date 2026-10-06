import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import { EXPENSE_COLUMN_LABELS, EXPENSE_SKELETON_COLUMNS } from "../list-columns";

// 05-08(UI-SPEC S8 로딩 · 가정 #23) — 제목 + 목록 표 뼈대만(projects/loading.tsx 선례). 머리글은 표와 같은 낱말이고 1차 · 필터 · 합계 줄은
// 그리지 않는다(동작하지 않는 1차 방지). 300ms 지연 표시는 `TableSkeleton`이 한다.
export default function ExpensesLoading() {
  return (
    <ListScreen title="지출결의">
      <TableSkeleton columns={EXPENSE_SKELETON_COLUMNS.map((key) => ({ key, label: EXPENSE_COLUMN_LABELS[key] }))} />
    </ListScreen>
  );
}
