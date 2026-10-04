import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// 04.3-04 Task 3 ①-b — §7-7 LOADING 표 뼈대. 04.6-23: 틀은 `ListScreen` 제목 + `TableSkeleton`(1차 행동 prop 없음 — D10, 동작하지 않는 1차 방지).
// 머리글은 표(events-table.tsx)의 진짜 열 이름이다.
export default function CertEventsLoading() {
  return (
    <ListScreen title="확인증 행사">
      <TableSkeleton
        columns={[
          { key: "name", label: "행사" },
          { key: "wonOn", label: "당첨일" },
          { key: "ownerName", label: "담당" },
          { key: "submitted", label: "제출", align: "right" },
          { key: "status", label: "상태" },
        ]}
      />
    </ListScreen>
  );
}
