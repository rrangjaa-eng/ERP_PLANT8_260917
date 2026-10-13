import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 06-21(UI-SPEC S17 LOADING · SYSTEM §7-7) — 제목 + 표 뼈대만(cards/purchases/loading.tsx 선례). 머리글은 목록 표와 같은 낱말이고
// 1차 · 필터는 그리지 않는다. 300ms 지연 표시는 `TableSkeleton`이 한다.
const COLUMNS = [
  { key: "desiredIssueDate", label: "희망 발행일" },
  { key: "project", label: "프로젝트" },
  { key: "requester", label: "요청자" },
  { key: "amount", label: "금액", align: "right" as const },
  { key: "memo", label: "메모" },
  { key: "status", label: "상태" },
];

export default function IssueRequestsLoading() {
  return (
    <ListScreen title="발행 요청">
      <TableSkeleton columns={COLUMNS} />
    </ListScreen>
  );
}
