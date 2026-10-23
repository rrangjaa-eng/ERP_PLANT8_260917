import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import styles from "./inbox-list.module.css";

// §7-7 LOADING — 제목 + 표 뼈대만(1차 없음). 열 이름은 알림 표(inbox-list.tsx)와 같고 「시각」 머리글은 같은 폭 클래스(`styles.time`)를 받는다.
export default function NotificationsLoading() {
  return (
    <ListScreen title="알림함">
      <TableSkeleton
        columns={[
          { key: "message", label: "내용" },
          { key: "time", label: "시각", align: "right", className: styles.time },
        ]}
      />
    </ListScreen>
  );
}
