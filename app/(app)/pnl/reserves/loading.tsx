import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// §7-7 LOADING → UI-SPEC loading(D10 · SC 10) — 제목 + 리저브 대장 표 뼈대(합계 줄 포함)만 그린다. 머리글은 표의 첫 열 이름(날짜 · 구분 · 금액 · 잔액)이고
// 1차 행동은 그리지 않는다(동작하지 않는 1차 방지). 첫 진입에서만 보이고 300ms 안에 끝나는 스트리밍에서는 뼈대가 보이지 않는다(`TableSkeleton`의 지연 표시).
const COLUMNS = [
  { key: "entryDate", label: "날짜" },
  { key: "direction", label: "구분" },
  { key: "amount", label: "금액", align: "right" as const },
  { key: "balanceKrw", label: "잔액", align: "right" as const },
];

export default function ReservesLoading() {
  return (
    <ListScreen title="리저브 대장">
      <TableSkeleton columns={COLUMNS} withFooter />
    </ListScreen>
  );
}
