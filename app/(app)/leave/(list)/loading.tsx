import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import { LEAVE_LIST_COLUMN_LABELS, LEAVE_LIST_SKELETON_COLUMNS } from "../labels";

// 04.1-06 §7-7 LOADING(S1) → UI-SPEC loading(D10 · SC 10) — 제목 + 연차 표 뼈대만. 머리글은 진짜 열 이름(`labels.ts` — 표와 같은 낱말)이고
// 1차 행동 prop은 넘기지 않는다(동작하지 않는 1차 방지). 300ms 안에 끝나는 스트리밍에서는 뼈대가 보이지 않는다(`TableSkeleton`의 지연 표시).
export default function LeaveListLoading() {
  return (
    <ListScreen title="연차">
      <TableSkeleton columns={LEAVE_LIST_SKELETON_COLUMNS.map(({ key, align }) => ({ key, label: LEAVE_LIST_COLUMN_LABELS[key], align }))} />
    </ListScreen>
  );
}
