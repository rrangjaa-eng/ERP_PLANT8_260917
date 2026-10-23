import { ListScreen } from "@/ui/list-screen/ListScreen";
import { TableSkeleton } from "@/ui/table/TableSkeleton";

// §7-7 LOADING(K18) — 제목 + 표 행 모양 뼈대만(1차 없음). 열 이름은 규칙 표(rules-client.tsx)와 같다.
export default function NotificationRulesLoading() {
  return (
    <ListScreen title="알림 규칙">
      <TableSkeleton
        columns={[
          { key: "name", label: "규칙" },
          { key: "days", label: "일수" },
          { key: "enabled", label: "켬" },
          { key: "recipients", label: "받는 사람" },
          { key: "email", label: "이메일" },
        ]}
      />
    </ListScreen>
  );
}
