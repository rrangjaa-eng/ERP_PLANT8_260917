import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 07-24(SC-21 LOADING · SYSTEM §7-7) — 제목 + 표 뼈대만(발행 요청 목록 선례). 머리글은 표와 같은 낱말, 300ms 지연 표시는 TableSkeleton.
const COLUMNS = [
  { key: "project", label: "프로젝트" },
  { key: "remaining", label: "남은 예산", align: "right" as const },
  { key: "status", label: "상태" },
  { key: "budget", label: "예산", align: "right" as const },
  { key: "used", label: "사용액", align: "right" as const },
  { key: "po", label: "PO 금액", align: "right" as const },
  // 행동 열(표는 머리 글자를 숨긴다) — 뼈대도 같은 열 수로 서야 머리 폭이 로드 뒤에 바뀌지 않는다(감사 #12).
  { key: "actions", label: "" },
];

export default function ProjectBudgetLoading() {
  return (
    <ListScreen title="예산 현황">
      <TableSkeleton columns={COLUMNS} />
    </ListScreen>
  );
}
