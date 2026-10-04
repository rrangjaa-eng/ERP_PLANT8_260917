import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// §7-7 LOADING — 제목 + 표 뼈대만(1차 없음). 열 이름은 알림 표(inbox-list.tsx)와 같다.
export default function NotificationsLoading() {
  return (
    <ListScreen title="알림함">
      <TableSkeleton
        columns={[
          { key: "message", label: "내용" },
          { key: "time", label: "시각", align: "right" },
        ]}
      />
    </ListScreen>
  );
}
