import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 06-08 감사 D-2(UI-SPEC S11 LOADING · SYSTEM §7-7) — 제목 + 표 뼈대만(expenses/(list)/loading.tsx 선례). 머리글은 목록 표와 같은 낱말이고
// 1차 · 필터는 그리지 않는다. 300ms 지연 표시는 `TableSkeleton`이 한다.
const COLUMNS = [
  { key: "number", label: "번호" },
  { key: "requestedOn", label: "요청일" },
  { key: "item", label: "품목" },
  { key: "link", label: "연결" },
  { key: "requester", label: "요청자" },
  { key: "estimate", label: "예상 금액", align: "right" as const },
  { key: "status", label: "상태" },
];

export default function PurchasesLoading() {
  return (
    <ListScreen title="구매 요청">
      <TableSkeleton columns={COLUMNS} />
    </ListScreen>
  );
}
